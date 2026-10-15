import type { RandomSource } from './random.ts';

/** PRNG determinístico (mulberry32) para testes reprodutíveis. Não usar em produção. */
export function seededSource(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    nextUint32(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0);
    },
  };
}

/** Fonte que devolve uma sequência fixa de valores e falha se acabar. */
export function scriptedSource(values: number[]): RandomSource & { readonly consumed: number } {
  let i = 0;
  return {
    nextUint32(): number {
      if (i >= values.length) {
        throw new Error('scriptedSource esgotada');
      }
      return values[i++];
    },
    get consumed(): number {
      return i;
    },
  };
}

/** Estatística qui-quadrado de contagens contra distribuição uniforme. */
export function chiSquareUniform(counts: number[]): number {
  const total = counts.reduce((s, c) => s + c, 0);
  const expected = total / counts.length;
  return counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
}
