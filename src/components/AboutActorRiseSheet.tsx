import { Image, Linking, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PrimaryPill } from './PrimaryPill';
import { StageDirection } from './StageDirection';
import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';

const SITE = 'https://actorrise.com';

/**
 * "What is ActorRise?", behind a question rather than on the page. The name
 * turns up on the sign-in sheet and in Account, and someone who found Ghost
 * Light in the App Store has no reason to know it: this says what it is, what
 * is there, and that the account is one account. The wordmark is the site's
 * own, in the colour the scheme asks for.
 */
export function AboutActorRiseSheet({
  open,
  onClose,
  from,
}: {
  open: boolean;
  onClose: () => void;
  from: 'auth' | 'account';
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const visit = () => {
    track('app_about_actorrise', { from, visited: true });
    void Linking.openURL(SITE);
  };
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1, backgroundColor: 'rgba(12,7,4,0.72)' }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} />
        <Animated.View
          entering={FadeIn.duration(260).delay(60)}
          style={{
            backgroundColor: c.panel,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: c.border,
            paddingHorizontal: 22,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StageDirection>(what is actorrise.)</StageDirection>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={c.mutedForeground} />
            </Pressable>
          </View>

          <Image
            source={c.isLight ? require('../../assets/actorrise-wordmark-dark.png') : require('../../assets/actorrise-wordmark-light.png')}
            accessibilityLabel="ActorRise"
            resizeMode="contain"
            style={{ marginTop: 10, marginLeft: -14, width: 220, height: 66 }}
          />

          <Text
            style={{
              marginTop: 4,
              fontFamily: 'InstrumentSerif_400Regular',
              fontSize: 30,
              lineHeight: 34,
              letterSpacing: -0.4,
              color: c.foreground,
            }}
          >
            The actor&apos;s site.{' '}
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>
              Ghost Light is its phone.
            </Text>
          </Text>

          <View style={{ marginTop: 16, gap: 10 }}>
            <Line icon="book-outline" text="Every monologue in here, with your cuts, your notes and the pieces you're off book on." />
            <Line icon="calendar-outline" text="The audition board, the one the emails fill, with its reminders and the calendar feed." />
            <Line icon="mic-outline" text="A rehearsal room: run a scene with a partner that reads with you, and tape yourself." />
          </View>

          <Text
            style={{
              marginTop: 16,
              fontFamily: 'CourierPrime_400Regular_Italic',
              fontSize: 12,
              lineHeight: 18,
              letterSpacing: 0.6,
              color: c.mutedForeground,
            }}
          >
            (one account. your book and your board travel both ways.)
          </Text>

          <View style={{ marginTop: 18 }}>
            <PrimaryPill label="Visit actorrise.com" onPress={visit} height={50} block haptic="medium" />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Line({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <Ionicons name={icon} size={17} color={c.accentText} style={{ marginTop: 2 }} />
      <Text
        style={{
          flex: 1,
          fontFamily: 'BricolageGrotesque_500Medium',
          fontSize: 14,
          lineHeight: 20,
          color: c.foreground,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
