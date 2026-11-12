import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { LabelledField } from '../src/components/LabelledField';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { AboutActorRiseSheet } from '../src/components/AboutActorRiseSheet';
import { useStageMotion } from '../src/hooks/useStageMotion';
import {
  isAppleAuthAvailable,
  sendPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../src/lib/auth';
import { useGoBack } from '../src/lib/nav';
import { track } from '../src/lib/analytics';
import { useTheme } from '../src/theme/ThemeContext';
import { homeHref, useL } from '../src/i18n';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * Sign in. One page, read from the top: the name of the thing, Apple, Google,
 * and the email form in full under a hairline, nothing folded away and
 * nothing that has to open. The page never reflows for the keyboard: it
 * starts at the top, so the fields sit in the upper half of any phone, and
 * the scroll view takes the keyboard as an inset and brings the field you
 * are in above it. The old page kept its words at the foot and gave them up
 * to the keyboard with a layout animation, which was the lurch.
 *
 * Two things the form can do, the same two fields: enter, or make an account.
 * "New here?" switches the pill between them; a sign-in that meets no account
 * switches it for you, since Supabase answers the same words for a wrong
 * password and no account at all, and a new actor must not be dead-ended on
 * them.
 */
export default function Auth() {
  const router = useRouter();
  const { next, create, only } = useLocalSearchParams<{ next?: string; create?: string; only?: string }>();
  // From a page that already offered Apple and Google: the form alone.
  const emailOnly = only === 'email';
  const goBack = useGoBack(homeHref());
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const L = useL();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creating, setCreating] = useState(create === '1');
  const [about, setAbout] = useState(false);
  // The field you tap comes up above the keyboard: its place on the page is
  // noted as it lays out, and a focus scrolls there.
  const scroller = useRef<ScrollView>(null);
  const place = useRef<Record<string, number>>({});
  const bring = (key: string) => () => { scroller.current?.scrollTo({ y: Math.max(0, (place.current[key] ?? 0) - 28), animated: true }); };

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleReady).catch(() => setAppleReady(false));
  }, []);

  const [arriving, setArriving] = useState(false);
  const done = (method: 'apple' | 'google' | 'email') => {
    Keyboard.dismiss();
    track('signed_in', { method });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // A beat on the lamp, then the room: the move from the form to the app is one fade, not a jump.
    setArriving(true);
    setTimeout(() => {
      if (next) { try { router.dismissAll(); } catch { /* the root */ } router.replace(next as '/welcome'); return; }
      if (router.canGoBack()) router.back();
      else router.replace(homeHref());
    }, 650);
  };

  const clear = () => { setError(null); setNotice(null); };

  const withApple = async () => {
    setBusy('apple');
    clear();
    const res = await signInWithApple();
    setBusy(null);
    if (res.ok) done('apple');
    else if (!res.canceled) setError(res.message ?? L('Could not sign in.', 'Giriş yapılamadı.'));
  };

  const withGoogle = async () => {
    setBusy('google');
    clear();
    const res = await signInWithGoogle();
    setBusy(null);
    if (res.ok) done('google');
    else if (!res.canceled) setError(res.message ?? L('Could not sign in.', 'Giriş yapılamadı.'));
  };

  const withEmail = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password) { setError(L('Your address and your password, both.', 'Adresin ve şifren, ikisi de.')); return; }
    setBusy('email');
    clear();
    const res = await signInWithEmail(email, password);
    setBusy(null);
    if (res.ok) { done('email'); return; }
    if (res.noAccount) {
      setError(L('No account with that address, or the password is wrong. New here? Tap Create the account. Already have one? Go back to Sign in and check the password.', 'Bu adreste hesap yok ya da şifre yanlış. Yeni misin? Hesabı aç düğmesine dokun. Hesabın var mı? Giriş yap sekmesine dön ve şifreni kontrol et.'));
      setCreating(true);
      return;
    }
    setError(res.message ?? L('Could not sign in.', 'Giriş yapılamadı.'));
  };

  const createAccount = async () => {
    Keyboard.dismiss();
    if (!email.trim()) { setError(L('An address first.', 'Önce bir adres.')); return; }
    if (password.length < 6) { setError(L('A password of at least six characters.', 'En az altı karakterli bir şifre.')); return; }
    setBusy('email');
    clear();
    const res = await signUpWithEmail(email, password);
    setBusy(null);
    if (res.ok) { done('email'); return; }
    if (res.pending) { setNotice(res.message ?? L('Confirm the address from the email we sent.', 'Sana gelen e-postadan adresini onayla.')); return; }
    setError(res.message ?? L('Could not create the account.', 'Hesap açılamadı.'));
  };

  const forgotPassword = async () => {
    if (resetting) return;
    if (!email.trim()) { setError(L('Type the address first, then tap this.', 'Önce adresi yaz, sonra buna dokun.')); return; }
    setResetting(true);
    clear();
    const res = await sendPasswordReset(email);
    setResetting(false);
    // Deliberately the same words whether or not that address has an account:
    // this form must not answer "does this person use Ghost Light" for anyone
    // who can type.
    if (res.ok) setNotice(L('If that address is registered, a reset link is on its way.', 'Bu adres kayıtlıysa sıfırlama bağlantısı yolda.'));
    else setError(res.message ?? L('Could not send the reset link.', 'Sıfırlama bağlantısı gönderilemedi.'));
  };

  const submit = () => { void (creating ? createAccount() : withEmail()); };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 28 }}>
          <Pressable onPress={goBack} hitSlop={14} accessibilityRole="button" accessibilityLabel={L('Not now', 'Şimdi değil')}>
            <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>{L('not now', 'şimdi değil')}</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroller}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 10, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {emailOnly ? (
            <Text style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 46, letterSpacing: -0.5, color: c.foreground }}>
              {L('Your', 'Senin')} <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{L('email.', 'e-postan.')}</Text>
            </Text>
          ) : (
            <Text style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 46, letterSpacing: -0.5, color: c.foreground }}>
              {L('Keep', 'Bunu')} <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{L('this one.', 'sakla.')}</Text>
            </Text>
          )}
          <StageDirection numberOfLines={2} style={{ marginTop: 8 }}>
            {emailOnly ? L('(an actorrise account works here too: same address, same password.)', '(actorrise hesabın burada da çalışır: aynı adres, aynı şifre.)') : L('(sign in to save. nothing you did is lost.)', '(kaydetmek için giriş yap. yaptığın hiçbir şey kaybolmaz.)')}
          </StageDirection>

          {/* The two slabs. Apple's is the one its guidelines require to be the prominent one. */}
          {emailOnly ? null : <View style={{ marginTop: 28, gap: 12 }}>
            {Platform.OS === 'ios' && appleReady ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={c.isLight ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={27}
                style={{ height: 54, width: '100%', opacity: busy === 'apple' ? 0.6 : 1 }}
                onPress={() => { if (!busy) void withApple(); }}
              />
            ) : null}
            <OutlineButton label={L('Continue with Google', 'Google ile devam et')} icon="logo-google" onPress={() => { if (!busy) void withGoogle(); }} busy={busy === 'google'} />
          </View>}

          {/* The two things the form can do, as two words on one rule: the chosen one carries the rule, like the houses on the curtain. */}
          <View style={{ marginTop: 28, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: c.divider }}>
            {([['in', L('Sign in', 'Giriş yap')], ['new', L('New account', 'Yeni hesap')]] as const).map(([k, label]) => {
              const on = (k === 'new') === creating;
              return (
                <Pressable key={k} onPress={() => { if (on) return; Haptics.selectionAsync().catch(() => {}); setCreating(k === 'new'); clear(); }} hitSlop={8}
                  accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={{ paddingBottom: 10, marginRight: 24, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: on ? c.accentText : 'transparent' }}>
                  <Text style={{ fontFamily: on ? SANS_B : SANS, fontSize: 15, color: on ? c.foreground : c.mutedForeground }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View onLayout={(e) => { place.current.email = e.nativeEvent.layout.y; }} />
          <LabelledField
            label={L('Email', 'E-posta')}
            onFocus={bring('email')}
            value={email}
            onChangeText={(t) => { setEmail(t); clear(); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            style={{ marginTop: 20 }}
          />
          <View onLayout={(e) => { place.current.password = e.nativeEvent.layout.y; }} />
          <LabelledField
            label={L('Password', 'Şifre')}
            onFocus={bring('password')}
            value={password}
            onChangeText={(t) => { setPassword(t); clear(); }}
            secureTextEntry={!reveal}
            autoComplete={creating ? 'new-password' : 'password'}
            textContentType={creating ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={{ marginTop: 18 }}
            accessory={
              <Pressable onPress={() => setReveal((v) => !v)} hitSlop={12} accessibilityRole="button" accessibilityLabel={reveal ? L('Hide password', 'Şifreyi gizle') : L('Show password', 'Şifreyi göster')}>
                <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={c.mutedForeground} />
              </Pressable>
            }
          />

          {/* One row: the way back for a lost password on the left, Enter on the right. */}
          <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: creating ? 'flex-end' : 'space-between', gap: 12 }}>
            {creating ? null : (
              <Pressable onPress={() => { void forgotPassword(); }} hitSlop={10} accessibilityRole="button" disabled={resetting} style={{ paddingVertical: 6 }}>
                {resetting ? <ActivityIndicator color={c.accentText} /> : (
                  <Text style={{ fontFamily: SANS_B, fontSize: 13.5, color: c.accentText }}>{L('Forgot password?', 'Şifreni mi unuttun?')}</Text>
                )}
              </Pressable>
            )}
            <PrimaryPill label={creating ? L('Create the account', 'Hesabı aç') : L('Enter', 'Gir')} onPress={submit} height={46} haptic="medium" style={{ paddingHorizontal: 8 }} />
          </View>
          {creating ? (
            <StageDirection style={{ marginTop: 14, textAlign: 'right' }}>{L('(this address, that password. your saves come with you.)', '(bu adres, o şifre. kaydettiklerin seninle gelir.)')}</StageDirection>
          ) : !emailOnly ? (
            <StageDirection numberOfLines={2} style={{ marginTop: 14 }}>{L('(have an actorrise account? the same email and password work here.)', '(actorrise hesabın var mı? aynı e-posta ve şifre burada da çalışır.)')}</StageDirection>
          ) : null}

          {error ? (
            <Animated.Text entering={FadeIn.duration(200)} style={{ marginTop: 18, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.accentText }}>
              {error}
            </Animated.Text>
          ) : null}
          {notice ? (
            <Animated.Text entering={FadeIn.duration(200)} style={{ marginTop: 18, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.mutedForeground }}>
              {notice}
            </Animated.Text>
          ) : null}

          {/* The name above means nothing to someone who found the app on its own. */}
          <Pressable
            onPress={() => { track('app_about_actorrise', { from: 'auth', visited: false }); setAbout(true); }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={L('What is ActorRise?', 'ActorRise nedir?')}
            style={{ marginTop: 'auto', paddingTop: 28, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Ionicons name="help-circle-outline" size={15} color={c.mutedForeground} />
            <StageDirection>{L('(what is actorrise?)', '(actorrise nedir?)')}</StageDirection>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
      <AboutActorRiseSheet open={about} onClose={() => setAbout(false)} from="auth" />
      {/* While it signs in, the page goes and the house comes up: the lamp, one line. It stays until the room behind it is there. */}
      {busy || arriving ? (
        <Animated.View entering={FadeIn.duration(260)} pointerEvents="auto" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
          <GhostLight size={58} />
          <StageDirection style={{ marginTop: 22 }}>{arriving ? L('(the house lights come up.)', '(salonun ışıkları yanıyor.)') : L('(finding your seat.)', '(yerin hazırlanıyor.)')}</StageDirection>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The same size and shape as Apple's slab, outlined rather than filled, so Apple's stays the prominent one. */
function OutlineButton({ label, icon, onPress, busy }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; busy?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: Boolean(busy) }}
      style={({ pressed }) => ({
        height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: c.foreground,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        opacity: pressed || busy ? 0.6 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={c.foreground} /> : (
        <>
          <Ionicons name={icon} size={18} color={c.foreground} />
          <Text style={{ fontFamily: SANS_B, fontSize: 16, color: c.foreground }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
