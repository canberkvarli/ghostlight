import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { isAppleAuthAvailable, signInWithApple, signInWithGoogle } from '../../lib/auth';
import { track } from '../../lib/analytics';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { GuidedScene } from '../../api/rehearsal';
import { KEY_WORDS } from '../../lib/demo';
import { PaperCard } from '../PaperCard';
import { PrimaryPill } from '../PrimaryPill';
import { StageDirection } from '../StageDirection';
import { useTheme } from '../../theme/ThemeContext';
import { useL } from '../../i18n';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const CAP = 'BricolageGrotesque_700Bold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * The curtain call of a first scene. Lights down, the title, and then the
 * actor's own numbers: how many of their lines the partner heard, and how
 * long it ran. That is the proof no copy can give: it listened to them.
 *
 * After the first scene, the other keys are offered, "another, in a
 * different key?". After the second, the week: the offer's stage, with the
 * paywall itself unchanged behind it. "Not tonight" is always there and
 * says they will be back.
 */
/** The rest of the house, one card each, so the stranger knows what the week opens. */
const HOUSE: { icon: React.ComponentProps<typeof Ionicons>['name']; name: string; line: string; nameTr: string; lineTr: string }[] = [
  { icon: 'search-outline', name: 'Search', line: 'thousands of monologues, by who you are and what you need.', nameTr: 'Ara', lineTr: 'binlerce monolog, kim olduğuna ve neye ihtiyacın olduğuna göre.' },
  { icon: 'bookmark-outline', name: 'Your book', line: 'keep them, cut them, run them off book.', nameTr: 'Kitabın', lineTr: 'sakla, kısalt, ezbere prova et.' },
  { icon: 'calendar-outline', name: 'Your board', line: 'paste the casting email; the night before, it knocks.', nameTr: 'Panon', lineTr: 'seçme e-postasını yapıştır; bir gece önce kapını çalar.' },
];

export function DemoCurtain({ title, which, heard, of, seconds, others, termsLine, onAnother, onWeek, onNotTonight, stranger = false, onSignedUp, onLookAround }: {
  title: string;
  /** Which first scene this was: the first or the second. */
  which: 1 | 2;
  heard: number;
  of: number;
  seconds: number;
  /** The keys not yet run, as cards. */
  others: GuidedScene[];
  /** The trial terms, from the offer, for the second curtain call. */
  termsLine: string | null;
  onAnother: (key: string) => void;
  onWeek: () => void;
  onNotTonight: () => void;
  /** No account yet: the curtain call is where it is made, the moment they are surest it works. */
  stranger?: boolean;
  onSignedUp?: (method: 'apple' | 'google') => void;
  onLookAround?: () => void;
}) {
  const { colors: c } = useTheme();
  const L = useL();
  const all = of > 0 && heard >= of;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const ran = mins ? `${mins}:${String(secs).padStart(2, '0')}` : L(`${secs} seconds`, `${secs} saniye`);
  return (
    <Animated.View entering={FadeIn.duration(700).delay(500)} style={{ flex: 1, paddingHorizontal: 28, paddingTop: 36 }}>
      <StageDirection>{L('(lights down.)', '(ışıklar sönüyor.)')}</StageDirection>
      <Text style={{ marginTop: 12, fontFamily: SERIF, fontSize: 36, lineHeight: 40, letterSpacing: -0.5, color: c.foreground }}>{title}</Text>

      {/* Their numbers, counting up once the title has settled. */}
      <Animated.View entering={FadeIn.duration(500).delay(1200)} style={{ marginTop: 26, flexDirection: 'row', gap: 18 }}>
        <Figure n={of ? `${heard}/${of}` : '–'} countTo={of ? heard : null} countOf={of} line={all ? L('lines heard. every one.', 'replik duyuldu. hepsi.') : L('of your lines heard.', 'repliğin duyuldu.')} />
        <Figure n={ran} line={L('the scene ran.', 'sahne sürdü.')} />
      </Animated.View>
      <Animated.Text entering={FadeIn.duration(500).delay(2000)} style={{ marginTop: 18, fontFamily: SANS, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground }}>
        {all
          ? L('It waited for you and came in on your last word, every time. That is what a partner does.', 'Seni bekledi ve her seferinde son kelimende girdi. Partner bunu yapar.')
          : L('It waited for you and came in on your last word. The lines it missed, say a little louder next time; it learns your room.', 'Seni bekledi ve son kelimende girdi. Kaçırdığı replikleri bir dahaki sefere biraz daha yüksek söyle; odanı öğreniyor.')}
      </Animated.Text>

      {stranger ? (
        <KeepIt onSignedUp={onSignedUp} onLookAround={onLookAround} />
      ) : (
        <>
      {which === 1 && others.length ? (
        <Animated.View entering={FadeIn.duration(600).delay(2600)} style={{ marginTop: 30 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 32, letterSpacing: -0.3, color: c.foreground }}>
            {L('Another, ', 'Bir tane daha, ')}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{L('in a different key?', 'başka bir tonda?')}</Text>
          </Text>
          <View style={{ marginTop: 14, gap: 12 }}>
            {others.map((s, i) => {
              const words = KEY_WORDS[s.key] ?? { eyebrow: s.title.toUpperCase(), tone: s.hook ?? '' };
              return (
                <Pressable key={s.key} onPress={() => { Haptics.selectionAsync().catch(() => {}); onAnother(s.key); }} accessibilityRole="button" accessibilityLabel={s.title}>
                  <PaperCard rotate={i % 2 ? 0.4 : -0.4} shadow={6} style={{ padding: 16 }}>
                    <Text style={{ fontFamily: CAP, fontSize: 9.5, letterSpacing: 1.6, color: c.accentText }}>{words.eyebrow}</Text>
                    <Text style={{ marginTop: 6, fontFamily: SERIF, fontSize: 22, lineHeight: 26, color: c.paperInk }}>{s.hook ?? s.title}</Text>
                    <Text style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 12.5, color: c.paperMuted }}>({s.characters.map(ch => ch.name.toLowerCase()).join(L(' and ', ' ve '))}.)</Text>
                  </PaperCard>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(600).delay(2600)} style={{ marginTop: 30 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 32, letterSpacing: -0.3, color: c.foreground }}>
            {L('The whole ', 'Bütün ')}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{L('stage.', 'sahne.')}</Text>
          </Text>
          <View style={{ marginTop: 14, gap: 10 }}>
            {HOUSE.map(h => (
              <View key={h.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: c.accentText, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={h.icon} size={17} color={c.accentText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.foreground }}>{L(h.name, h.nameTr)}</Text>
                  <Text style={{ marginTop: 1, fontFamily: MONO_I, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground }}>({L(h.line, h.lineTr)})</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: 14, fontFamily: SANS, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground }}>
            {L('And a partner for every scene in the library and every side of your own. The three you just met are in your house for good.', 'Bir de kütüphanedeki her sahne ve kendi getirdiğin her metin için bir partner. Az önce tanıştığın üçü artık hep senin.')}
          </Text>
          <PrimaryPill label={L('Start the free week', 'Ücretsiz haftayı başlat')} onPress={onWeek} height={54} block haptic="medium" style={{ marginTop: 18 }} />
          {termsLine ? <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS, fontSize: 11.5, lineHeight: 16, color: c.chevron }}>{termsLine}</Text> : null}
        </Animated.View>
      )}

        </>
      )}

      {stranger ? null : <Animated.View entering={FadeIn.duration(500).delay(3200)} style={{ alignSelf: 'center', marginTop: 26 }}>
        <Pressable onPress={onNotTonight} hitSlop={12} accessibilityRole="button" style={{ paddingVertical: 8 }}>
          <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>{L('(not tonight.)', '(bu gece değil.)')}</Text>
        </Pressable>
      </Animated.View>}
    </Animated.View>
  );
}

function Figure({ n, line, countTo = null, countOf = 0 }: { n: string; line: string; countTo?: number | null; countOf?: number }) {
  const { colors: c } = useTheme();
  // The count climbs from nothing to the number over a second, once it is on.
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (countTo === null) return;
    const started = Date.now() + 1200;
    const t = setInterval(() => {
      const k = Math.min(1, Math.max(0, (Date.now() - started) / 1000));
      setAt(Math.round(countTo * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, [countTo]);
  const shown = countTo === null ? n : `${at}/${countOf}`;
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 44, letterSpacing: -0.6, color: c.accentText }}>{shown}</Text>
      <Text style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 12.5, letterSpacing: 0.4, color: c.mutedForeground }}>({line})</Text>
    </View>
  );
}

/**
 * Keep it: the account, asked for once the partner has answered them. Apple
 * first, Google under it, email a line below that, and a quiet way past for
 * the few who will not, so they look around instead of deleting the app.
 */
function KeepIt({ onSignedUp, onLookAround }: { onSignedUp?: (method: 'apple' | 'google') => void; onLookAround?: () => void }) {
  const { colors: c } = useTheme();
  const L = useL();
  const router = useRouter();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<null | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { isAppleAuthAvailable().then(setApple).catch(() => setApple(false)); }, []);
  const go = async (method: 'apple' | 'google') => {
    if (busy) return;
    setBusy(method); setError(null);
    const res = method === 'apple' ? await signInWithApple() : await signInWithGoogle();
    setBusy(null);
    if (res.ok) { track('onboarding_signup', { method }); onSignedUp?.(method); }
    else if (!res.canceled) setError(res.message ?? L('That did not go through. Try again.', 'Olmadı. Tekrar dene.'));
  };
  return (
    <Animated.View entering={FadeIn.duration(600).delay(2600)} style={{ marginTop: 30 }}>
      <Text style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, color: c.foreground }}>
        {L('Keep this. ', 'Bunu sakla. ')}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{L('Make your account.', 'Hesabını aç.')}</Text>
      </Text>
      <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground }}>
        {L('Your scenes, your sides and your partner\'s voices, kept for the next time. Free.', 'Sahnelerin, metinlerin ve partnerinin sesleri, bir dahaki sefere hazır. Ücretsiz.')}
      </Text>
      <View style={{ marginTop: 20, gap: 12 }}>
        {Platform.OS === 'ios' && apple ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={c.isLight ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={27}
            style={{ height: 54, width: '100%', opacity: busy === 'apple' ? 0.6 : 1 }}
            onPress={() => { void go('apple'); }}
          />
        ) : null}
        <Pressable onPress={() => { void go('google'); }} disabled={Boolean(busy)} accessibilityRole="button" accessibilityLabel={L('Continue with Google', 'Google ile devam et')}
          style={({ pressed }) => ({ height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: c.foreground, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: pressed || busy === 'google' ? 0.6 : 1 })}>
          {busy === 'google' ? <ActivityIndicator color={c.foreground} /> : (
            <>
              <Ionicons name="logo-google" size={18} color={c.foreground} />
              <Text style={{ fontFamily: SANS_B, fontSize: 16, color: c.foreground }}>{L('Continue with Google', 'Google ile devam et')}</Text>
            </>
          )}
        </Pressable>
        <Pressable onPress={() => { router.push({ pathname: '/auth', params: { next: '/welcome', create: '1', only: 'email' } }); }} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 6 }}>
          <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.accentText }}>{L('Use email instead', 'E-postayla devam et')}</Text>
        </Pressable>
      </View>
      {error ? <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS, fontSize: 13, color: c.accentText }}>{error}</Text> : null}
      <Pressable onPress={() => { track('onboarding_signup', { method: 'past' }); onLookAround?.(); }} hitSlop={12} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 22, paddingVertical: 8 }}>
        <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>{L('(look around first.)', '(önce bir göz at.)')}</Text>
      </Pressable>
    </Animated.View>
  );
}
