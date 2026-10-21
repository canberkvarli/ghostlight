import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';

import { GhostLight } from '../src/components/GhostLight';
import { PaperCard } from '../src/components/PaperCard';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useCatalogueSize } from '../src/hooks/useCatalogueSize';
import { PRIVACY_URL, TERMS_URL, useTrialOffer } from '../src/hooks/useTrialOffer';
import { useTheme } from '../src/theme/ThemeContext';
import { colors } from '../src/theme/tokens';

/**
 * The paywall — a free trial (length set in App Store Connect; handoff §5).
 *
 * v2 puts what you are buying on paper: the offer is a headline on the stage,
 * the four things you get are printed on a page of sides, and the two prices are
 * hairline rows beneath it. One primary pill takes the money. Restore is present
 * because Apple requires it. Live prices come from RevenueCat when configured;
 * the static copy stands otherwise so it's never empty.
 *
 * Nothing on this screen takes a colour from a `className`. See app/auth.tsx for
 * what that cost the last time — a headline that resolved to the light scheme's
 * ink while the stage behind it was the dark scheme's, and so could not be seen.
 *
 * The money itself is src/hooks/useTrialOffer.ts, shared with the wall on the
 * page; this screen only draws it.
 */

export default function Paywall() {
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();
  const { label: catalogue } = useCatalogueSize();

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), [router]);
  const {
    plan,
    setPlan,
    busy,
    restoring,
    note,
    storeDown,
    retry,
    annualBilled,
    monthlyBilled,
    annualPerMonth,
    billed,
    cadence,
    trialLabel,
    terms,
    buy,
    onRestore,
  } = useTrialOffer({ from: 'paywall', onDone: close, onSignIn: () => router.replace('/auth') });
  const headlineTrial = trialLabel ?? '1 week';
  const headlineWord = `${headlineTrial[0].toUpperCase()}${headlineTrial.slice(1)}`;

  // Every line here must map to a real entitlement check, or App Review reads it
  // as a promise the purchase doesn't keep (Guideline 2.3.1/3.1.2). This list
  // once carried three that weren't gated at all — memorize mode (never shipped),
  // unlimited saves (free for everyone) and offline (mirrored for everyone).
  // Offline earned its place back by being implemented; the other two are gone.
  // The gates, for the record:
  //   unlimited reads  → app/read/[id].tsx:148 (free tier is 3 lifetime reads)
  //   copy to clipboard → app/read/[id].tsx:167
  //   tone/emotion/freshness filters → src/data/filters.ts (premium: true)
  //   offline copies    → src/lib/offline.ts, driven by useEntitlement
  //
  // The catalogue size is the one number in this list that goes stale on its
  // own. It was typed in as "14,000+" and the library had grown past nineteen
  // thousand, so the headline promise of the whole offer was understating the
  // product by about a third. It now comes off the search endpoint's `total`.
  const perks = useMemo(
    () => [
      `Unlimited reading, all ${catalogue}`,
      'Filter by tone, emotion & freshness',
      'Copy any monologue',
      'Read offline, anywhere',
    ],
    [catalogue],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View
          style={{
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: 20,
          }}
        >
          <Pressable
            onPress={close}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ padding: 4 }}
          >
            <Ionicons name="close" size={26} color={c.mutedForeground} />
          </Pressable>
        </View>

        {/* `flex: 1` on the ScrollView itself, not just `flexGrow` on its content.
            Yoga defaults to `flexShrink: 0`, so without this the ScrollView sizes
            to its content and pushes the footer off the bottom of a short screen.
            The footer is where the CTA and the 3.1.2 disclosure live, so it has
            to be the part that never moves. It grew by four lines of terms in
            build 13, which is what made the old arrangement unsafe. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 28,
            paddingTop: 12,
            paddingBottom: 10,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Centred by two growing spacers, not `justifyContent: 'center'`.
              Centring the content container clips the top the moment the
              content is taller than the room above the footer: the overflow
              sits above the scroll origin where no scroll can reach it, and
              the lamp and the card's top rule are the first things to go.
              Spacers shrink to nothing instead and the page simply scrolls. */}
          <View style={{ flexGrow: 1 }} />
          <View style={{ alignItems: 'center' }}>
            <GhostLight size={34} />
            {/* Only promise a trial when one actually exists. `headlineTrial`
                fell back to "7 days" whenever RevenueCat reported no intro
                offer, so the headline read "7 Days on the house." over a CTA
                that correctly said "Unlock everything" — the screen offered a
                free trial and charged immediately. If no introductory offer is
                configured in App Store Connect, this headline is the difference
                between an honest paywall and a surprise charge.

                40/48 is the v2 headline box: Instrument Serif needs about 1.16×
                its point size or RN clips the descenders to the line box, and
                "the house." has two of them. */}
            <Text
              style={{
                marginTop: 22,
                textAlign: 'center',
                fontFamily: 'InstrumentSerif_400Regular',
                fontSize: 40,
                lineHeight: 48,
                letterSpacing: -0.6,
                color: c.foreground,
              }}
            >
              {trialLabel ? `${headlineWord}\n` : 'The whole\n'}
              <Text
                style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}
              >
                {trialLabel ? 'on the house.' : 'library.'}
              </Text>
            </Text>
            {/* Build 12 was rejected under 3.1.2(c) for offering a trial without
                making the charge that follows it obvious, so the price now
                travels with the trial in the headline and not only in the footer.
                Courier 13px with 1.04 tracking runs about 9px a character, so
                "(free, then $29.99 a year.)" needs 243 of the 319px a 375pt
                screen leaves between the gutters. A longer currency string
                ("CHF 29.90") would ellipsize mid-price, which is worse than
                saying nothing — hence shrink-to-fit rather than truncate. */}
            <StageDirection
              style={{ marginTop: 12, textAlign: 'center' }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {trialLabel ? `(free, then ${billed} ${cadence}.)` : '(cancel anytime.)'}
            </StageDirection>
          </View>

          {/* When the store cannot be reached, say so instead of quoting made-up
              money. The fallback prices exist so the screen is never blank while
              RevenueCat answers; they are not a claim about what anyone would be
              charged. Showing them beside a button that then replies "Couldn't
              reach the App Store" is the shape of a 2.1 rejection and, worse,
              tells a paying customer a price we did not get from Apple.
              Restore stays available below: someone who already subscribed
              should not be held hostage by a failed product fetch. */}
          {storeDown ? (
            <View style={{ marginTop: 26, paddingHorizontal: 4 }}>
              <Text
                style={{
                  textAlign: 'center',
                  fontFamily: 'BricolageGrotesque_500Medium',
                  fontSize: 14,
                  lineHeight: 21,
                  color: c.mutedForeground,
                }}
              >
                The App Store isn’t reachable right now, so we can’t show you the
                subscription. Check your connection and try again in a moment.
              </Text>
            </View>
          ) : null}

          {/* What you are buying, printed on a page of sides. A paywall that
              lists its perks as four loose lines on the stage is a receipt; on
              paper it is the thing itself, and it rhymes with the plan card on
              Account that sends people here. Cream on BOTH schemes, so every
              word inside takes a `paper*` ink — never `foreground`. */}
          <PaperCard rotate={-0.5} shadow={8} style={{ padding: 20 }} wrapperStyle={{ marginTop: 28, marginRight: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'CourierPrime_700Bold',
                fontSize: 11,
                lineHeight: 15,
                letterSpacing: 2.2,
                textTransform: 'uppercase',
                color: colors.primaryDeep,
              }}
            >
              The whole stage
            </Text>

            <View style={{ marginTop: 14 }}>
              {perks.map((f, i) => (
                <View
                  key={f}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    marginTop: i === 0 ? 0 : 12,
                  }}
                >
                  {/* An ink tick in the margin, the way a reader marks a page.
                      The old 5pt glowing dot was `colors.stageGlow`, which is a
                      light — on the cream card it came out at about 2:1 and
                      simply disappeared. */}
                  <Ionicons
                    name="checkmark"
                    size={15}
                    color={colors.primaryDeep}
                    style={{ marginTop: 3, marginRight: 11 }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: 'BricolageGrotesque_500Medium',
                      fontSize: 15,
                      lineHeight: 21,
                      color: c.paperInk,
                    }}
                  >
                    {f}
                  </Text>
                </View>
              ))}
            </View>
          </PaperCard>

          {/* Plans — hairline radio rows, not slabs. The big number is the amount
              actually charged, not the per-month equivalent: a $2.50 in 28px
              serif over a $29.99 in 12px muted is the pricing prominence
              3.1.2(c) reads as misleading. Per-month stays, demoted to the note. */}
          <View
            style={{
              marginTop: 26,
              borderTopWidth: storeDown ? 0 : 1,
              borderTopColor: c.divider,
              display: storeDown ? 'none' : 'flex',
            }}
          >
            <PlanRow
              selected={plan === 'annual'}
              onPress={() => setPlan('annual')}
              name="Yearly"
              badge="best."
              note={`${annualPerMonth} a month, billed yearly`}
              price={annualBilled}
              unit="/yr"
            />
            <PlanRow
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              name="Monthly"
              note="billed every month"
              price={monthlyBilled}
              unit="/mo"
            />
          </View>
          <View style={{ flexGrow: 1 }} />
        </ScrollView>

        <View style={{ paddingHorizontal: 28, paddingBottom: 18, paddingTop: 12 }}>
          {busy ? (
            <ActivityIndicator color={c.accentText} style={{ height: 52 }} />
          ) : storeDown ? (
            // No CTA that apologises when pressed. There is nothing to buy until
            // the store answers, so the only thing on offer is asking again.
            <PrimaryPill
              label="Try again"
              onPress={retry}
              block
              haptic="medium"
            />
          ) : (
            <PrimaryPill
              label={trialLabel ? 'Start the trial' : 'Unlock everything'}
              onPress={buy}
              block
              haptic="medium"
            />
          )}

          {note ? (
            <Text
              style={{
                marginTop: 12,
                textAlign: 'center',
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 12,
                lineHeight: 17,
                color: c.mutedForeground,
              }}
            >
              {note}
            </Text>
          ) : null}

          {/* The disclosure 3.1.2(c) is about, and it is never conditional. It
              used to share a slot with the error note, so any store failure
              replaced the terms with an error — and it only said "Then $X a
              year", which states the amount but not that the charge happens by
              itself. A reviewer on an iPad Air read that as a trial with no
              stated renewal and rejected build 12. Trial length, the amount
              charged after it, and the fact that it renews on its own now all
              appear together, above the fold, under the button that starts it.

              With no purchase on offer it would be describing terms for a price
              we are not showing, which is worse than silence. */}
          <Text
            style={{
              marginTop: 12,
              fontFamily: 'BricolageGrotesque_500Medium',
              fontSize: 11,
              lineHeight: 16,
              color: c.mutedForeground,
              display: storeDown ? 'none' : 'flex',
              // Left, deliberately, against a screen that centres everything
              // else. This is five lines of fine print, and centring five lines
              // gives both edges a ragged margin for a reader who is scanning
              // for a number. The left edge lands on the same column as the plan
              // rows above it, so it reads as considered rather than stray.
              textAlign: 'left',
            }}
          >
            {terms}
          </Text>

          <Pressable
            onPress={onRestore}
            hitSlop={10}
            style={{ alignItems: 'center', paddingVertical: 10 }}
            accessibilityRole="button"
          >
            {restoring ? (
              <ActivityIndicator color={c.mutedForeground} />
            ) : (
              <Text
                style={{
                  fontFamily: 'BricolageGrotesque_500Medium',
                  fontSize: 13,
                  lineHeight: 18,
                  color: c.chevron,
                }}
              >
                Restore purchases
              </Text>
            )}
          </Pressable>

          {/* Guideline 3.1.2 wants these on the screen that takes the money, not
              only on the App Store page and not only buried in Account. Build 12
              was rejected for the metadata half of the same rule; this is the
              in-app half, which a human reviewer checks next. */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              paddingBottom: 4,
            }}
          >
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={FINE_PRINT_LINK(c.mutedForeground)}>Terms of Use</Text>
            </Pressable>
            <Text style={[FINE_PRINT_LINK(c.mutedForeground), { paddingHorizontal: 8 }]}>·</Text>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={FINE_PRINT_LINK(c.mutedForeground)}>Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const FINE_PRINT_LINK = (color: string) => ({
  fontFamily: 'BricolageGrotesque_500Medium',
  fontSize: 11,
  lineHeight: 16,
  color,
});

function PlanRow({
  selected,
  onPress,
  name,
  badge,
  note,
  price,
  unit,
}: {
  selected: boolean;
  onPress: () => void;
  name: string;
  badge?: string;
  note: string;
  /** The amount actually charged, not a derived per-month figure. */
  price: string;
  unit: string;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 17,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
      }}
    >
      {/* Radio ring — fills with the house orange when selected. `accentText`
          rather than `stageGlow`: the glow is a light, tuned to read against
          warm near-black, and a 17pt ring of it on the cream stage is a smudge.
          The UNSELECTED ring took `border`, which is 1.93:1 on the dark stage
          and 1.29:1 on the cream one — a control you have to find by guessing
          where it is. It takes the chevron value now: 8.8 and 4.9, which is the
          least a thing you are asked to press can measure. The hierarchy is
          carried by the fill, not by hiding the option you did not pick. */}
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 1.5,
          borderColor: selected ? c.accentText : c.chevron,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 16,
        }}
      >
        {selected ? (
          <View
            style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.accentText }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              fontFamily: 'BricolageGrotesque_600SemiBold',
              fontSize: 17,
              lineHeight: 23,
              color: c.foreground,
            }}
          >
            {name}
          </Text>
          {badge ? (
            <Text
              style={{
                fontFamily: 'CourierPrime_400Regular_Italic',
                fontSize: 13,
                lineHeight: 18,
                color: c.accentText,
              }}
            >
              ({badge})
            </Text>
          ) : null}
        </View>
        <Text
          style={{
            marginTop: 2,
            fontFamily: 'BricolageGrotesque_500Medium',
            fontSize: 12,
            lineHeight: 17,
            color: c.mutedForeground,
          }}
        >
          {note}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        {/* The serif's dollar sign has almost no right sidebearing, so at 28px it
            sits on top of the first digit — visible in the reviewer's own
            screenshot of build 12, where "$2.50" reads as a struck-through 2.
            A half point of tracking separates them without loosening the
            numerals enough to notice. The 34pt line box is not optional: without
            it RN sizes the box to the 28pt em and clips the comma and the
            descender off a price like "$29.99" on a narrow phone. */}
        <Text
          style={{
            fontFamily: 'InstrumentSerif_400Regular',
            fontSize: 28,
            lineHeight: 34,
            letterSpacing: 0.5,
            color: c.foreground,
          }}
        >
          {price}
        </Text>
        <Text
          style={{
            marginLeft: 2,
            fontFamily: 'BricolageGrotesque_500Medium',
            fontSize: 12,
            lineHeight: 17,
            color: c.mutedForeground,
          }}
        >
          {unit}
        </Text>
      </View>
    </Pressable>
  );
}
