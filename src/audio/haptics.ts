import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type { FeedbackKind } from '../core/feedback.ts';

/**
 * Resposta tátil via Vibration API (Web) e @capacitor/haptics (Nativo iOS / Android).
 * Em dispositivos móveis nativos (especialmente iPhones com Taptic Engine onde o Safari web
 * não suporta navigator.vibrate), aciona o motor de vibração nativo com precisão.
 */
export function hapticsSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Vibra com o padrão ou tipo de evento háptico dado. */
export function vibrate(pattern: number | number[], kind?: FeedbackKind, strength = 1): boolean {
  if (!hapticsSupported()) return false;

  if (Capacitor.isNativePlatform()) {
    try {
      if (kind === 'crit') {
        void Haptics.notification({ type: NotificationType.Success });
      } else if (kind === 'fumble') {
        void Haptics.notification({ type: NotificationType.Error });
      } else if (kind === 'impact') {
        const style = strength > 0.6 ? ImpactStyle.Heavy : strength > 0.3 ? ImpactStyle.Medium : ImpactStyle.Light;
        void Haptics.impact({ style });
      } else if (kind === 'settle') {
        void Haptics.impact({ style: ImpactStyle.Light });
      } else {
        void Haptics.impact({ style: ImpactStyle.Medium });
      }
      return true;
    } catch {
      return false;
    }
  }

  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

