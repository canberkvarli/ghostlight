/**
 * The posters come from Amazon's image service with a size tag on the end,
 * and the catalogue stores the 300 pixel one. Painted across a phone card at
 * 3x that is a 300 pixel picture stretched over 1,200, which is why every
 * poster looked soft. The service renders any width on request: the same
 * link with a larger tag is the same poster, sharp.
 */
const SIZE_TAG = /\._V1_[^./]*\.(jpe?g|png)$/i;

/** The poster at a width that fills a phone card. Links of any other shape pass through untouched. */
export function sharpPoster(url: string | null | undefined, width = 1200): string | undefined {
  if (!url) return undefined;
  return SIZE_TAG.test(url) ? url.replace(SIZE_TAG, `._V1_SX${width}.$1`) : url;
}
