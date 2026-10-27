import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Who reads each part of a scene, as the actor chose it: in the sides
 * editor ("who plays Jordan") or on the cast sheet before a run. Kept on the
 * phone per scene; the cast sheet opens with these and the server's picks
 * fill in the rest.
 */
const keyOf = (sceneId: number) => `ghostlight:cast-voices.${sceneId}`;

export async function loadCastVoices(sceneId: number): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(sceneId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function saveCastVoice(sceneId: number, character: string, voiceId: string): Promise<void> {
  const now = await loadCastVoices(sceneId);
  now[character] = voiceId;
  try { await AsyncStorage.setItem(keyOf(sceneId), JSON.stringify(now)); } catch { /* the server's pick, then */ }
}
