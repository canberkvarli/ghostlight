import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { supabase } from './supabase';

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

export type AuthResult = { ok: true } | { ok: false; canceled?: boolean; message?: string };

const redirectTo = Linking.createURL('auth-callback');

export function isAppleAuthAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<AuthResult> {
  try {
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

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    // Anonymous users link so their data is kept; a fresh user just signs in.
    const { data: sessionData } = await supabase.auth.getSession();
    const isAnon = sessionData.session?.user.is_anonymous ?? false;

    const oauth = isAnon
      ? await supabase.auth.linkIdentity({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        })
      : await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });

    if (oauth.error) return { ok: false, message: oauth.error.message };
    if (!oauth.data?.url) return { ok: false, message: 'No OAuth URL returned.' };

    const result = await WebBrowser.openAuthSessionAsync(oauth.data.url, redirectTo);
    if (result.type !== 'success') return { ok: false, canceled: true };

    const code = new URL(result.url).searchParams.get('code');
    if (!code) return { ok: false, message: 'No auth code in redirect.' };

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message ?? 'Google sign-in failed.' };
  }
}

function randomNonce(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
