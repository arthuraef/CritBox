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

      buttons.forEach((b) => b.classList.remove('active'));
      // No MVP atual, o D20 é o dado renderizado
      const d20Btn = container.querySelector<HTMLButtonElement>('[data-dice="d20"]');
      if (d20Btn) d20Btn.classList.add('active');

      if (type === 'd20') {
        if (statusEl) statusEl.textContent = '';
      } else {
        if (statusEl) {
          statusEl.textContent = `Dado ${type.toUpperCase()}: em breve! O D20 está pronto para jogar.`;
          setTimeout(() => {
            if (statusEl.textContent.includes(type.toUpperCase())) {
              statusEl.textContent = '';
            }
          }, 3200);
        }
      }

      if (onSelect) onSelect(type);
    });
  });
}
