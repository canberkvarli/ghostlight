/**
 * What the camera said, in words an actor can act on. The patched
 * expo-camera (build 62 on) reports iOS's interruption reasons and a
 * session that did not start; this turns them into a line for the room.
 *
 * 2026-11-12: the camera was black for a week because iOS thought another
 * app shared the screen (interruption reason 4). Nothing said so. A restart
 * cleared it. Now the room says what to do.
 */
export function cameraTrouble(message: string): string | null {
  const m = /interrupted, reason (\d+)/.exec(message);
  if (m) {
    switch (Number(m[1])) {
      case 1: return null; // the app went to the background: it comes back by itself
      case 2: return 'another app has the microphone. close it and try again.';
      case 3: return 'another app is using the camera. close it and try again.';
      case 4: return 'iOS thinks another app is on screen with Ghost Light, like a floating video or a call. close it, or restart the phone.';
      case 5: return 'the phone is too warm for the camera. give it a minute.';
      default: return 'iOS paused the camera. try again, or restart the phone.';
    }
  }
  if (/did not start|could not be started|runtime error|No camera device/i.test(message)) return 'the camera didn’t start. try again, or restart the phone.';
  if (/rebuilt after being detached/.test(message)) return null;
  return null;
}
