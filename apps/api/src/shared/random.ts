/**
 * Toda aleatoriedade do jogo passa por uma função Random. Em produção é o
 * Math.random; nos testes é uma sequência com semente, então o sorteio do
 * Mestre e dos pseudônimos fica previsível.
 */
export type Random = () => number;

export const RANDOM = Symbol('RANDOM');

/** Gerador mulberry32: pequeno, rápido e determinístico para uma semente. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inteiro entre min e max, incluindo os dois. */
export function randomInt(min: number, max: number, random: Random): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function pickOne<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)];
}

/** Embaralhamento de Fisher-Yates; não altera o array original. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
