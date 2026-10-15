/**
 * Barra de seleção de tipo de dado na parte inferior da tela (D4, D6, D8, D10, D12, D20, D100).
 * Mantém o D20 ativo e informa sobre a chegada dos demais dados nas próximas etapas do MVP.
 */

export function setupDiceSelector(onSelect?: (diceType: string) => void): void {
  const container = document.getElementById('dice-selector');
  const statusEl = document.getElementById('status');
  if (!container) return;

  const buttons = container.querySelectorAll<HTMLButtonElement>('.dice-chip');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.dice ?? 'd20';

      buttons.forEach((b) => {
        b.classList.remove('active');
        b.removeAttribute('aria-current');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'true');

      if (statusEl) {
        statusEl.textContent = `Dado ${type.toUpperCase()} pronto na mesa! Toque para rolar.`;
        setTimeout(() => {
          if (statusEl.textContent.includes(type.toUpperCase())) {
            statusEl.textContent = '';
          }
        }, 2400);
      }

      if (onSelect) onSelect(type);
    });
  });
}
