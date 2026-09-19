import { Text, type TextProps } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

/**
 * `(lights up.)`
 *
 * Courier Prime, italic, lowercase, tracked out at 0.08em. The app's own voice
 * when it wants to speak in the language of a script rather than the language of
 * an interface. Never used for chrome that has a job to do — buttons, labels and
 * counts stay in Bricolage.
 *
 * It dropped from 15pt to 13 in v2. At 15 it was competing with the body copy it
 * was supposed to be an aside from, and the longer directions ("(sign in to keep
 * monologues.)") had no chance of holding one line on a narrow phone.
 *
 * `on="paper"` puts it on a card instead of the stage. Cards are cream on both
 * schemes, so the stage's muted grey would be nearly invisible on one of them —
 * this is the one place the distinction has to be made by hand.
 */
export function StageDirection({
  children,
  className = '',
  on = 'stage',
  ...rest
}: TextProps & { on?: 'stage' | 'paper' }) {
  const { colors: c } = useTheme();
  return (
    <Text
      {...rest}
      className={`text-[13px] lowercase ${className}`}
      style={[
        {
          fontFamily: 'CourierPrime_400Regular_Italic',
          letterSpacing: 1.04,
          lineHeight: 19,
          color: on === 'paper' ? c.paperMuted : c.mutedForeground,
        },
        rest.style,
      ]}
    >
      {children}
    </Text>
  );
}
