/**
 * Real Photographic Produce & Brand Image Dictionary
 * Replaces cartoon/animated emojis with crisp, realistic produce photography.
 */

export const FRUIT_REAL_IMAGES: Record<string, string> = {
  apple: '/assets/fruits/apple.jpg',
  mango: '/assets/fruits/mango.jpg',
  avocado: '/assets/fruits/avocado.jpg',
  banana: '/assets/fruits/banana.jpg',
  strawberry: '/assets/fruits/strawberry.jpg',
  berries: '/assets/fruits/strawberry.jpg',
  tomato: '/assets/fruits/tomato.jpg',
  kiwi: '/assets/fruits/kiwi.jpg',
  papaya: '/assets/fruits/papaya.jpg',
  dragonfruit: '/assets/fruits/dragonfruit.jpg',
  greens: '/assets/fruits/greens.jpg',
};

/**
 * Returns a real photographic image URL for any produce name or identifier.
 */
export function getFruitRealImage(idOrName?: string, fallbackUrl?: string): string {
  if (!idOrName) return '/assets/fruits/apple.jpg';
  const clean = idOrName.toLowerCase().replace(/[^a-z]/g, '');

  if (clean.includes('apple')) return FRUIT_REAL_IMAGES.apple;
  if (clean.includes('mango')) return FRUIT_REAL_IMAGES.mango;
  if (clean.includes('avocado')) return FRUIT_REAL_IMAGES.avocado;
  if (clean.includes('banana')) return FRUIT_REAL_IMAGES.banana;
  if (clean.includes('strawberr') || clean.includes('berr')) return FRUIT_REAL_IMAGES.strawberry;
  if (clean.includes('tomato')) return FRUIT_REAL_IMAGES.tomato;
  if (clean.includes('kiwi')) return FRUIT_REAL_IMAGES.kiwi;
  if (clean.includes('papaya')) return FRUIT_REAL_IMAGES.papaya;
  if (clean.includes('dragon') || clean.includes('pitaya')) return FRUIT_REAL_IMAGES.dragonfruit;
  if (clean.includes('green') || clean.includes('kale') || clean.includes('spinach') || clean.includes('lettuce')) return FRUIT_REAL_IMAGES.greens;

  return fallbackUrl || FRUIT_REAL_IMAGES.apple;
}
