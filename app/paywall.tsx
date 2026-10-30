import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';

import { PrimaryPill } from '../src/components/PrimaryPill';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useCatalogueSize } from '../src/hooks/useCatalogueSize';
import { PRIVACY_URL, TERMS_URL, useTrialOffer } from '../src/hooks/useTrialOffer';
import { asTrigger, WHY_LINE } from '../src/lib/paywall';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/** The house, one line each, the partner first: the curtain call's rows, said shorter so the plans stay in view. */
const ROOMS: { icon: React.ComponentProps<typeof Ionicons>['name']; name: string; line: string }[] = [
  { icon: 'people-outline', name: 'Scene partner', line: 'every scene, every side.' },
  { icon: 'search-outline', name: 'Search', line: 'by who you are, what you need.' },
  { icon: 'bookmark-outline', name: 'Your book', line: 'keep them, cut them, run them.' },
  { icon: 'calendar-outline', name: 'Your board', line: 'paste the email; it knocks.' },
];

/**
 * The paywall, in the curtain call's clothes: "The whole stage.", how big
 * the library is, and the house as rows, the partner first. Under it the two
 * plans as cards, yearly chosen with the gel block behind it, the pill that
 * starts the week and one line of what the week promises. One line of terms,
 * Terms and Privacy.
 *
 * Every number on it comes from the store or the server: the trial length
 * from the yearly package's introductory offer, the prices from the
 * packages, the count from the database. With no trial on the offering the
 * promise is not said and the pill says what it does instead. The money
 * itself is src/hooks/useTrialOffer.ts, shared with the wall on the page and
 * the foot of the cast sheet; this screen only draws it.
 */
export default function Paywall() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { label: catalogue } = useCatalogueSize();
  const trigger = asTrigger(useLocalSearchParams<{ why?: string }>().why);
  const why = trigger ? WHY_LINE[trigger] : undefined;

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), [router]);
  const offer = useTrialOffer({ from: 'paywall', trigger, onDone: close, onSignIn: () => router.replace('/auth') });
  const { plan, setPlan, busy, restoring, note, storeDown, retry, trialLabel, trialDays, canRemind, buy, onRestore } = offer;

  const cta = trialLabel ? `Start the free ${trialDays === 7 ? 'week' : trialLabel}` : 'Unlock everything';

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Restore on the left, because Apple asks for it and it is not the point; the way out on the right. */}
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 }}>
          <Pressable onPress={onRestore} hitSlop={12} accessibilityRole="button" accessibilityLabel="Restore purchases" style={{ paddingVertical: 6 }}>
            {restoring ? (
              <ActivityIndicator color={c.mutedForeground} />
            ) : (
              <Text style={{ fontFamily: SANS_B, fontSize: 13, color: c.chevron }}>Restore</Text>
            )}
          </Pressable>
          <Pressable onPress={close} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
            <Ionicons name="close" size={24} color={c.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 12, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 40/44: Instrument Serif wants about 1.1x its size or the descender of "g" is clipped. */}
          <Text style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 44, letterSpacing: -0.6, color: c.foreground }}>
            The whole <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>stage.</Text>
          </Text>
          <StageDirection style={{ marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            ({catalogue} monologues. no limits.)
          </StageDirection>
          {/* What they just did, said back, when they came here by doing it. */}
          {why ? (
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ marginTop: 8, fontFamily: MONO_I, fontSize: 13.5, lineHeight: 19, letterSpacing: 0.4, color: c.accentText }}>
              {why}
            </Text>
          ) : null}

          {/* The house, as the curtain call of a first scene draws it, with the partner first. */}
          <View style={{ marginTop: 18 }}>
            {ROOMS.map(h => (
              <View key={h.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: c.accentText, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={h.icon} size={17} color={c.accentText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.foreground }}>{h.name}</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ marginTop: 1, fontFamily: MONO_I, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground }}>({h.line})</Text>
                </View>
              </View>
            ))}
          </View>

          {storeDown ? (
            <Text style={{ marginTop: 26, textAlign: 'center', fontFamily: SANS, fontSize: 14, lineHeight: 21, color: c.mutedForeground }}>
              The App Store isn’t reachable right now, so we can’t show you the subscription. Check your connection and try again in a moment.
            </Text>
          ) : null}

          {/* The two plans as cards. Only the packages the store sells are drawn. */}
          {!storeDown ? (
            <View style={{ marginTop: 22, gap: 12 }}>
              {offer.hasAnnual ? (
                <PlanCard
                  selected={plan === 'annual'}
                  onPress={() => setPlan('annual')}
                  name="Yearly"
                  note={offer.annualTrialLabel ? `(${offer.annualTrialLabel} free.)` : null}
                  price={offer.annualBilled}
                  per={`${offer.annualPerMonth} / month`}
                />
              ) : null}
              {offer.hasMonthly ? (
                <PlanCard selected={plan === 'monthly'} onPress={() => setPlan('monthly')} name="Monthly" note={null} price={offer.monthlyBilled} per={null} />
              ) : null}
            </View>
          ) : null}
          <View style={{ flexGrow: 1 }} />
        </ScrollView>

        <View style={{ paddingHorizontal: 22, paddingBottom: 10, paddingTop: 10 }}>
          {busy ? (
            <ActivityIndicator color={c.accentText} style={{ height: 56 }} />
          ) : storeDown ? (
            <PrimaryPill label="Try again" onPress={retry} block haptic="medium" height={56} />
          ) : (
            <PrimaryPill label={cta} onPress={buy} block haptic="medium" height={56} />
          )}

          {/* The week's promise, in one line where the timeline used to be. */}
          {trialLabel && trialDays && !storeDown && !busy ? (
            <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS_B, fontSize: 13, lineHeight: 18, color: c.mutedForeground }}>
              {canRemind && trialDays > 2 ? `We remind you on day ${trialDays - 2}. ` : ''}Cancel before day {trialDays}, pay nothing.
            </Text>
          ) : null}

          {note ? (
            <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS, fontSize: 12, lineHeight: 17, color: c.mutedForeground }}>{note}</Text>
          ) : null}

          {/* The disclosure 3.1.2(c) is about: the trial, the charge after it,
              and that it renews on its own, under the pill that starts it. */}
          {!storeDown ? (
            <Text style={{ marginTop: 12, textAlign: 'center', fontFamily: SANS, fontSize: 10.5, lineHeight: 15, color: c.chevron }}>{offer.terms}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 4, paddingBottom: 2 }}>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={8} accessibilityRole="link">
              <Text style={{ fontFamily: SANS, fontSize: 10.5, lineHeight: 15, color: c.chevron, textDecorationLine: 'underline' }}>Terms</Text>
            </Pressable>
            <Text style={{ fontFamily: SANS, fontSize: 10.5, color: c.chevron, paddingHorizontal: 6 }}>·</Text>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
              <Text style={{ fontFamily: SANS, fontSize: 10.5, lineHeight: 15, color: c.chevron, textDecorationLine: 'underline' }}>Privacy</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * A plan as a card: a radio, the name, the trial in Courier under it, the
 * price in serif and the per-month figure under that. The chosen one carries
 * the gel block offset behind it and the house orange on its rule. The price
 * printed large is the amount actually charged; per-month stays small, which
 * is the prominence 3.1.2(c) asks for.
 */
function PlanCard({ selected, onPress, name, note, price, per }: { selected: boolean; onPress: () => void; name: string; note: string | null; price: string; per: string | null }) {
  const { colors: c } = useTheme();
  return (
    <View>
      {selected ? <View pointerEvents="none" style={{ position: 'absolute', left: 6, top: 6, right: -6, bottom: -6, borderRadius: 18, backgroundColor: c.yellow }} /> : null}
      <Pressable
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 18, borderRadius: 18,
          borderWidth: 1.5, borderColor: selected ? c.accentText : c.border, backgroundColor: c.card,
        }}
      >
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: selected ? c.accentText : c.chevron, backgroundColor: selected ? c.accentText : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.ink }} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: SANS_B, fontSize: 16, lineHeight: 20, color: selected ? c.foreground : c.mutedForeground }}>{name}</Text>
          {note ? <Text style={{ marginTop: 4, fontFamily: MONO_I, fontSize: 12.5, letterSpacing: 0.4, color: c.mutedForeground }}>{note}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {/* 22/28: the serif's dollar sign crowds the first digit, half a point of tracking parts them. */}
          <Text style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 28, letterSpacing: 0.5, color: selected ? c.foreground : c.mutedForeground }}>{price}</Text>
          {per ? <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 11.5, color: c.mutedForeground }}>{per}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}
