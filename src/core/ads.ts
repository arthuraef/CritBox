/**
 * Provedor de anúncios recompensados (Rewarded Ads).
 *
 * No ambiente Web/PWA, fornece um simulador interativo com temporizador de 5 segundos
 * e garantia de recompensa apenas se concluído.
 * Pronto para conectar ao `@capacitor-community/admob` na compilação nativa para iOS/Android.
 */

export interface RewardedAdProvider {
  isReady(): boolean;
  show(callbacks: {
    onReward: () => void;
    onDismiss?: () => void;
    onError?: (err: Error) => void;
  }): Promise<void>;
}

export class WebMockRewardedAdProvider implements RewardedAdProvider {
  isReady(): boolean {
    return true;
  }

  show(callbacks: {
    onReward: () => void;
    onDismiss?: () => void;
    onError?: (err: Error) => void;
  }): Promise<void> {
    return new Promise((resolve) => {
      const adModal = document.getElementById('ad-modal');
      const timerEl = document.getElementById('ad-timer');
      const closeBtn = document.getElementById('ad-close-btn') as HTMLButtonElement | null;
      const progressEl = document.getElementById('ad-progress') as HTMLElement | null;

      if (!adModal || !timerEl || !closeBtn) {
        // Fallback imediato se o modal não existir no DOM
        callbacks.onReward();
        resolve();
        return;
      }

      adModal.hidden = false;
      closeBtn.disabled = true;
      closeBtn.textContent = 'Aguarde...';

      let secondsLeft = 5;
      timerEl.textContent = `${secondsLeft}s`;
      if (progressEl) progressEl.style.width = '0%';

      let rewarded = false;

      const interval = setInterval(() => {
        secondsLeft--;
        const progress = Math.round(((5 - secondsLeft) / 5) * 100);
        if (progressEl) progressEl.style.width = `${progress}%`;

        if (secondsLeft <= 0) {
          clearInterval(interval);
          rewarded = true;
          timerEl.textContent = 'Recompensa desbloqueada!';
          closeBtn.disabled = false;
          closeBtn.textContent = 'Resgatar Skin';
          closeBtn.focus();
        } else {
          timerEl.textContent = `${secondsLeft}s`;
        }
      }, 1000);

      const cleanup = () => {
        clearInterval(interval);
        adModal.hidden = true;
        closeBtn.removeEventListener('click', onClose);
        resolve();
      };

      const onClose = () => {
        if (rewarded) {
          callbacks.onReward();
        } else if (callbacks.onDismiss) {
          callbacks.onDismiss();
        }
        cleanup();
      };

      closeBtn.addEventListener('click', onClose);
    });
  }
}
