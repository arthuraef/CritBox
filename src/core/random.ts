/**
 * Fonte de números aleatórios do CritBox.
 *
 * O sorteio do resultado é independente da animação e da interface: tudo que
 * precisa de aleatoriedade recebe uma `RandomSource`, o que permite testar com
 * fontes determinísticas.
 */

/** Fonte que produz inteiros sem sinal de 32 bits, uniformes em [0, 2^32). */
export interface RandomSource {
  nextUint32(): number;
}

const TWO_POW_32 = 4294967296;

/**
 * Fonte criptográfica (Web Crypto). Disponível nos navegadores modernos e no
 * Node 20+. Lê em lotes para não chamar a API a cada sorteio.
 */
export function createCryptoSource(
  cryptoApi: Pick<Crypto, 'getRandomValues'> = globalThis.crypto,
): RandomSource {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Web Crypto indisponível: não há fonte aleatória segura.');
  }
  const buffer = new Uint32Array(64);
  let index = buffer.length;
  return {
    nextUint32(): number {
      if (index >= buffer.length) {
        cryptoApi.getRandomValues(buffer);
        index = 0;
      }
      return buffer[index++];
    },
  };
}

/**
 * Inteiro uniformemente distribuído em [min, max] (ambos inclusos).
 *
 * Usa amostragem por rejeição: descarta valores da faixa final que tornariam
 * alguns resultados mais prováveis (viés de módulo). Para o D20 (20 valores),
 * os 16 maiores uint32 são descartados.
 */
export function uniformInt(source: RandomSource, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError(`Intervalo inválido: [${min}, ${max}]`);
  }
  const range = max - min + 1;
  if (range > TWO_POW_32) {
    throw new RangeError('Intervalo maior que 2^32 não é suportado.');
  }
  // Maior múltiplo de `range` que cabe em 2^32; valores >= limit são rejeitados.
  const limit = Math.floor(TWO_POW_32 / range) * range;
  for (;;) {
    const value = source.nextUint32();
    if (!Number.isInteger(value) || value < 0 || value >= TWO_POW_32) {
      throw new RangeError(`Fonte devolveu valor fora de uint32: ${value}`);
    }
    if (value < limit) {
      return min + (value % range);
    }
  }
}

/** Rola um D20: inteiro uniforme entre 1 e 20. */
export function rollD20(source: RandomSource): number {
  return uniformInt(source, 1, 20);
}

/**
 * Número em [0, 1) para a parte VISUAL (eixos de giro, rotação extra).
 * É uma fonte separada, nunca usada para decidir o resultado.
 */
export function createVisualRandom(source: RandomSource): () => number {
  return () => source.nextUint32() / TWO_POW_32;
}
