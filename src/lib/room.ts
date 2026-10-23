import { useSegments } from 'expo-router';

/** Which room the screen is in, from the route's group segment, as the word a back button names. */
export function useRoomName(): 'Search' | 'Book' | 'Board' | 'Scene' {
  const segments = useSegments() as string[];
  if (segments.includes('(book)')) return 'Book';
  if (segments.includes('(board)')) return 'Board';
  if (segments.includes('(scene)')) return 'Scene';
  return 'Search';
}
