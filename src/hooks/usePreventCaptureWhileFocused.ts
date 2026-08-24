import { useCallback } from 'react';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { useFocusEffect } from 'expo-router';

/**
 * Screen-capture prevention that is only held while the screen is *focused*.
 *
 * `usePreventScreenCapture` (the expo hook) holds prevention for the whole life
 * of the component. That breaks the stack: Results stays mounted under Read, so
 * both hold prevention at once — and on iOS two overlapping secure layers black
 * out the top screen entirely (Read renders a fully black page over Results).
 *
 * Tying prevention to focus means at most one screen holds it at a time: pushing
 * Read blurs Results (releasing its lock) before Read takes over, so the words
 * are still protected on every screen that shows them, with no black-out.
 */
export function usePreventCaptureWhileFocused(key: string) {
  useFocusEffect(
    useCallback(() => {
      preventScreenCaptureAsync(key).catch(() => {});
      return () => {
        allowScreenCaptureAsync(key).catch(() => {});
      };
    }, [key]),
  );
}
