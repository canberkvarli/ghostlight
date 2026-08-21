import { Text, type TextProps } from 'react-native';

/**
 * `(lights up.)`
 *
 * Courier Prime, italic, lowercase, tracked out. The app's own voice when it
 * wants to speak in the language of a script rather than the language of an
 * interface. Never used for chrome that has a job to do — buttons, labels and
 * counts stay in Montserrat.
 */
export function StageDirection({ children, className = '', ...rest }: TextProps) {
  return (
    <Text
      {...rest}
      className={`text-[13px] lowercase text-muted-foreground ${className}`}
      style={[{ fontFamily: 'CourierPrime_400Regular_Italic', letterSpacing: 1.04 }, rest.style]}
    >
      {children}
    </Text>
  );
}
