import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { configMissing, supabase } from './supabase';

/**
 * A bundle with no environment cannot sign anybody in, and iOS reports it as a
 * DNS failure against the placeholder host — which sends you looking at wifi,
 * at Apple's Services ID, at anything except the build. Say it plainly instead.
 */
const CONFIG_ERROR =
  'This build is missing its configuration, so sign-in cannot reach the server. Reinstall from TestFlight or wait for the next update.';

/**
 * Auth, triggered by the first save — never by launch (spec §5). The user has
 * already been an anonymous user since second zero; these flows upgrade that
 * same user so their saves and read count survive the upgrade.
 *
 * Sign in with Apple is mandatory because Google is offered — Apple rejects
 * otherwise. Apple runs natively (no browser detour); Google goes through the
 * Supabase OAuth redirect.
 *
 * NOTE — needs on-device verification once anonymous sign-ins are enabled
 * server-side. The interesting, un-testable-from-here parts are exactly the
 * ones the spec flags: session persistence, the deep-link redirect, and whether
 * the anonymous user's rows carry across the upgrade. The happy paths are
 * implemented to the documented Supabase contract; treat them as scaffolding
 * until they run against a real session on hardware.
 */

export type AuthResult =
  | { ok: true }
  | { ok: false; canceled?: boolean; message?: string; noAccount?: boolean };

const redirectTo = Linking.createURL('auth-callback');

export function isAppleAuthAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<AuthResult> {
  try {
    if (configMissing) return { ok: false, message: CONFIG_ERROR };
    // Apple wants a hashed nonce; Supabase wants the raw one back to verify.
    const rawNonce = randomNonce();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { ok: false, message: 'Apple did not return an identity token.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'ERR_REQUEST_CANCELED') return { ok: false, canceled: true };
    return { ok: false, message: err.message ?? 'Apple sign-in failed.' };
  }
}

/**
 * Sign in with an existing ActorRise email + password. Because the app points at
 * the same Supabase project as the web app, this is the actor's existing account
 * — connecting the phone to what they already have on the web.
 */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    if (configMissing) return { ok: false, message: CONFIG_ERROR };
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      // Supabase answers the same way whether the address is unknown or the
      // password is wrong — deliberately, so the endpoint can't be used to
      // discover who has an account. That means we cannot tell a new user from
      // a typo, so we don't guess: `noAccount` lets the screen OFFER to create
      // one rather than silently creating an account for someone who simply
      // mistyped their password.
      const unknown = /invalid login credentials/i.test(error.message);
      return { ok: false, message: error.message, noAccount: unknown };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message ?? 'Sign-in failed.' };
  }
}

/**
 * Create an account on this address, upgrading the anonymous user in place.
 *
 * `updateUser` rather than `signUp` is load-bearing. Every actor reaching this
 * point already IS a user — the app mints an anonymous session at launch — so
 * signing them up afresh would strand whatever they saved and read as a guest
 * on an account they can never sign into again. Adding an email and password to
 * the session they already have keeps all of it.
 *
 * If the project requires email confirmation, `updateUser` returns fine but the
 * address isn't live until they click the link. Saying so is better than a
 * silent success followed by a sign-in that fails tomorrow.
 */
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    if (configMissing) return { ok: false, message: CONFIG_ERROR };
    const address = email.trim().toLowerCase();

    const { data: sessionData } = await supabase.auth.getSession();
    const isAnon = sessionData.session?.user.is_anonymous ?? false;

    if (isAnon) {
      const { error } = await supabase.auth.updateUser({ email: address, password });
      if (error) return { ok: false, message: error.message };
      return { ok: true };
    }

    const { error } = await supabase.auth.signUp({ email: address, password });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message ?? 'Could not create the account.' };
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    if (configMissing) return { ok: false, message: CONFIG_ERROR };
    // Anonymous users link so their saves and read count carry across the
    // upgrade; a fresh user just signs in.
    const { data: sessionData } = await supabase.auth.getSession();
    const isAnon = sessionData.session?.user.is_anonymous ?? false;

    const options = { redirectTo, skipBrowserRedirect: true } as const;

    let oauth = isAnon
      ? await supabase.auth.linkIdentity({ provider: 'google', options })
      : await supabase.auth.signInWithOAuth({ provider: 'google', options });

    // linkIdentity needs "Allow manual linking" switched on for the project. If
    // it isn't, this is the ONLY path Google ever takes — the app mints an
    // anonymous session at launch, so every user is anonymous when they reach
    // here — and Google sign-in is dead for everyone. Falling back to a plain
    // sign-in costs the anonymous user's rows, which is bad, but is far better
    // than a sign-in button that cannot work.
    if (isAnon && oauth.error) {
      oauth = await supabase.auth.signInWithOAuth({ provider: 'google', options });
    }

    if (oauth.error) return { ok: false, message: oauth.error.message };
    if (!oauth.data?.url) return { ok: false, message: 'No OAuth URL returned.' };

    const result = await WebBrowser.openAuthSessionAsync(oauth.data.url, redirectTo);
    if (result.type !== 'success') return { ok: false, canceled: true };

    const url = new URL(result.url);

    // Supabase reports provider-side failures as query params on the redirect
    // rather than by failing the browser session, so without this the user just
    // sees the generic "no auth code" line and we learn nothing.
    const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
    if (oauthError) return { ok: false, message: oauthError };

    const code = url.searchParams.get('code');
    if (!code) {
      // Almost always one of two dashboard problems: the client is not on the
      // PKCE flow (see src/lib/supabase.ts), or `redirectTo` is missing from
      // Authentication → URL Configuration → Redirect URLs.
      return {
        ok: false,
        message: `Sign-in came back without an auth code. Check that ${redirectTo} is an allowed redirect URL.`,
      };
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message ?? 'Google sign-in failed.' };
  }
}

/**
 * The deep link the OAuth redirect must come back to. Exported so the auth
 * screen can show it when something goes wrong — it has to be listed verbatim
 * under Authentication → URL Configuration → Redirect URLs in Supabase, and
 * getting it from the running app beats guessing at the scheme.
 */
export function authRedirectUrl(): string {
  return redirectTo;
}

function randomNonce(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
