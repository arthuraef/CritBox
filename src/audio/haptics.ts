/**
 * Resposta tátil via Vibration API. Não existe no Safari/iOS: nesse caso tudo
 * vira "não faz nada" e `hapticsSupported()` devolve falso.
 */

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Vibra com o padrão dado. Devolve falso se não houver suporte ou o navegador recusar. */
export function vibrate(pattern: number | number[]): boolean {
  if (!hapticsSupported()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
