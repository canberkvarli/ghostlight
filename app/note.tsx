import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { BackHeader } from '../src/components/BackHeader';
import { PaperCard } from '../src/components/PaperCard';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { GhostLight } from '../src/components/GhostLight';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useGoBack } from '../src/lib/nav';
import { Ionicons } from '@expo/vector-icons';
import { MAKER, emailMaker, openInstagram, rateGhostLight } from '../src/lib/maker';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * A note from Canberk, reached from the home-screen quick action that sits
 * above Remove App. Someone pressing that menu may be about to leave, so this
 * is a thank-you and an open door, never a plea: tell me what broke and I will
 * fix it.
 */
export default function Note() {
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { colors: c } = useTheme();

  const body = {
    fontFamily: 'BricolageGrotesque_500Medium',
    fontSize: 16,
    lineHeight: 24,
    color: c.paperBody,
  } as const;

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label="Search" onPress={goBack} />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              fontFamily: 'InstrumentSerif_400Regular',
              fontSize: 40,
              lineHeight: 45,
              letterSpacing: -0.8,
              color: c.foreground,
            }}
          >
            Before you{' '}
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>
              go.
            </Text>
          </Text>
          <StageDirection style={{ marginTop: 4 }}>(a note from {MAKER.name.toLowerCase()}.)</StageDirection>

          <PaperCard shadow={6} rotate={-0.5} wrapperStyle={{ marginTop: 24 }} style={{ padding: 22 }}>
            <Text style={body}>Thank you for giving Ghost Light a try.</Text>
            <Text style={[body, { marginTop: 12 }]}>
              I&apos;m Canberk, an actor, and I build this on my own. If something didn&apos;t
              work, or a speech you needed wasn&apos;t there, tell me. I read every message, and
              I&apos;ll fix it.
            </Text>
            <StageDirection on="paper" style={{ marginTop: 14 }}>
              (thank you for coming.)
            </StageDirection>
          </PaperCard>

          <PrimaryPill
            label="Write to me"
            block
            style={{ marginTop: 28 }}
            onPress={() => emailMaker('Ghost Light')}
          />
          <PrimaryPill
            label="Rate Ghost Light"
            variant="outline"
            block
            style={{ marginTop: 12 }}
            onPress={() => { void rateGhostLight({ inApp: true }); }}
          />
          <Pressable onPress={openInstagram} hitSlop={10} accessibilityRole="link" accessibilityLabel={`Instagram @${MAKER.instagram}`}
            style={{ alignSelf: 'center', marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="logo-instagram" size={15} color={c.accentText} />
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: c.accentText }}>@{MAKER.instagram}</Text>
          </Pressable>

          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back to the search"
            hitSlop={12}
            style={{ alignSelf: 'center', marginTop: 22, paddingVertical: 6 }}
          >
            <StageDirection style={{ fontSize: 14 }}>back to the search</StageDirection>
          </Pressable>

          <View style={{ alignItems: 'center', marginTop: 30 }}>
            <GhostLight size={21} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
