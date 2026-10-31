import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';

import { PrimaryPill } from '../src/components/PrimaryPill';
import { SpotlightHero } from '../src/components/SpotlightHero';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useCatalogueSize } from '../src/hooks/useCatalogueSize';
import { PRIVACY_URL, TERMS_URL, useTrialOffer } from '../src/hooks/useTrialOffer';
import { asTrigger, WHY_LINE } from '../src/lib/paywall';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const CAP = 'BricolageGrotesque_700Bold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * The paywall: the ghost light on an empty stage as the picture, "The whole
 * stage." in its light, three lines of what opens, then the plan as a
 * Yearly / Monthly switch with what the year saves, one price said large, and
 * the pill that starts the week pinned to the foot with "No payment today"
 * under it. One line of terms, Terms and Privacy.
 *
 * Every number on it comes from the store or the server: the trial length
 * from the yearly package's introductory offer, the prices and the saving
 * from the packages, the count from the database. With no trial on the
 * offering the pill says what it does instead. The money itself is
 * src/hooks/useTrialOffer.ts, shared with the wall on the page and the foot of
 * the cast sheet; this screen only draws it.
 */
export default function Paywall() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { label: catalogue } = useCatalogueSize();
  const trigger = asTrigger(useLocalSearchParams<{ why?: string }>().why);
  const why = trigger ? WHY_LINE[trigger] : undefined;

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), [router]);
  const offer = useTrialOffer({ from: 'paywall', trigger, onDone: close, onSignIn: () => router.replace('/auth') });
  const { plan, setPlan, busy, restoring, note, storeDown, retry, trialLabel, trialDays, buy, onRestore } = offer;

  const cta = trialLabel ? `Start my free ${trialDays === 7 ? 'week' : trialLabel}` : 'Unlock everything';
  const both = offer.hasAnnual && offer.hasMonthly;
  const yearly = plan === 'annual';
  const hero = Math.min(240, Math.max(170, height * 0.25));

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      {/* The light stands behind everything, so no edge of the scroll can cut it. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="none">
        <SpotlightHero height={insets.top + 44 + hero} />
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Restore on the left, because Apple asks for it and it is not the point; the way out on the right. */}
        <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, zIndex: 2 }}>
          <Pressable onPress={onRestore} hitSlop={12} accessibilityRole="button" accessibilityLabel="Restore purchases" style={{ paddingVertical: 6 }}>
            {restoring ? (
              <ActivityIndicator color={c.mutedForeground} />
            ) : (
              <Text style={{ fontFamily: SANS_B, fontSize: 13, color: c.chevron }}>Restore</Text>
            )}
          </Pressable>
          <Pressable onPress={close} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={19} color={c.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {/* The room the lamp stands in. */}
          <View style={{ height: hero }} />

          <View style={{ paddingHorizontal: 24 }}>
            {/* 42/46: Instrument Serif wants about 1.1x its size or the descender of "g" is clipped. */}
            <Text style={{ marginTop: 4, textAlign: 'center', fontFamily: SERIF, fontSize: 42, lineHeight: 46, letterSpacing: -0.6, color: c.foreground }}>
              The whole <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>stage.</Text>
            </Text>
            {/* What they just did, said back, when they came here by doing it. */}
            {why ? (
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ marginTop: 4, textAlign: 'center', fontFamily: MONO_I, fontSize: 13.5, lineHeight: 19, letterSpacing: 0.4, color: c.accentText }}>
                {why}
              </Text>
            ) : null}

            <View style={{ marginTop: 18, gap: 11, alignSelf: 'center' }}>
              <Perk text="A scene partner for every side" />
              <Perk text={`${catalogue} monologues, no limits`} />
              <Perk text="Keep, cut and run them off book" />
            </View>

            {storeDown ? (
              <Text style={{ marginTop: 24, textAlign: 'center', fontFamily: SANS, fontSize: 14, lineHeight: 21, color: c.mutedForeground }}>
                The App Store isn’t reachable right now, so we can’t show you the subscription. Check your connection and try again in a moment.
              </Text>
            ) : (
              <>
                {both ? (
                  <View style={{ marginTop: 24, flexDirection: 'row', padding: 4, borderRadius: 18, borderWidth: 1, borderColor: c.border }}>
                    <Segment selected={yearly} onPress={() => setPlan('annual')} label="Yearly" badge={offer.savePercent ? `SAVE ${offer.savePercent}%` : null} />
                    <Segment selected={!yearly} onPress={() => setPlan('monthly')} label="Monthly" badge={null} />
                  </View>
                ) : null}

                {/* The amount actually charged, said large; per month small under it (3.1.2(c)). */}
                <View style={{ marginTop: 18, alignItems: 'center' }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 38, letterSpacing: 0.3, color: c.foreground }}>
                    {yearly ? offer.annualBilled : offer.monthlyBilled}
                    <Text style={{ fontFamily: SERIF_I, fontSize: 22, color: c.mutedForeground }}>{yearly ? ' a year' : ' a month'}</Text>
                  </Text>
                  <Text style={{ marginTop: 4, fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.4, color: c.mutedForeground }}>
                    {yearly
                      ? `(${offer.annualPerMonth} a month.${offer.annualTrialLabel ? ` ${offer.annualTrialLabel} free.` : ''})`
                      : '(billed monthly. no trial.)'}
                  </Text>
                </View>
              </>
            )}
          </View>
          <View style={{ flexGrow: 1 }} />
        </ScrollView>

        <View style={{ paddingHorizontal: 22, paddingBottom: 8, paddingTop: 8 }}>
          {busy ? (
            <ActivityIndicator color={c.accentText} style={{ height: 56 }} />
          ) : storeDown ? (
            <PrimaryPill label="Try again" onPress={retry} block haptic="medium" height={56} />
          ) : (
            <PrimaryPill label={cta} onPress={buy} block haptic="medium" height={56} />
          )}

          {!storeDown ? (
            <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS_B, fontSize: 13, lineHeight: 18, color: c.mutedForeground }}>
              {trialLabel ? 'No payment today. Cancel anytime.' : 'Cancel anytime.'}
            </Text>
          ) : null}

          {note ? (
            <Text style={{ marginTop: 8, textAlign: 'center', fontFamily: SANS, fontSize: 12, lineHeight: 17, color: c.mutedForeground }}>{note}</Text>
          ) : null}

          {/* The disclosure 3.1.2(c) is about: the trial, the charge after it,
              and that it renews on its own, under the pill that starts it. */}
          {!storeDown ? (
            <Text style={{ marginTop: 8, textAlign: 'center', fontFamily: SANS, fontSize: 10.5, lineHeight: 15, color: c.chevron }}>{offer.terms}</Text>
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

/** One thing the plan opens: an amber tick in a disc, and the line. */
function Perk({ text }: { text: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.accentText, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark" size={14} color={c.ink} />
      </View>
      <Text style={{ fontFamily: SANS_B, fontSize: 15.5, lineHeight: 20, color: c.foreground }}>{text}</Text>
    </View>
  );
}

/**
 * Half of the plan switch. The chosen half is lifted onto a card with the
 * house orange round it; the year carries its saving as a gel chip, yellow
 * only ever behind ink.
 */
function Segment({ selected, onPress, label, badge }: { selected: boolean; onPress: () => void; label: string; badge: string | null }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={badge ? `${label}, ${badge.toLowerCase()}` : label}
      style={{
        flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
        borderWidth: 1.5, borderColor: selected ? c.accentText : 'transparent', backgroundColor: selected ? c.card : 'transparent',
      }}
    >
      <Text style={{ fontFamily: SANS_B, fontSize: 16, color: selected ? c.foreground : c.mutedForeground }}>{label}</Text>
      {badge ? (
        <View style={{ paddingHorizontal: 7, height: 20, borderRadius: 6, backgroundColor: c.yellow, justifyContent: 'center' }}>
          <Text style={{ fontFamily: CAP, fontSize: 9.5, letterSpacing: 0.8, color: c.ink }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
