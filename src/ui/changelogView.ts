/**
 * Tela com o registro de atualizações do CritBox.
 * Texto objetivo e sem termos técnicos, focado nas melhorias práticas para o jogador.
 */

export function setupChangelogView(): void {
  const versionBtn = document.getElementById('app-version');
  const overlay = document.getElementById('changelog');
  const closeBtn = document.getElementById('changelog-close');

  if (!versionBtn || !overlay || !closeBtn) return;

  let lastFocus: HTMLElement | null = null;

  function open(): void {
    lastFocus = document.activeElement as HTMLElement | null;
    overlay!.hidden = false;
    closeBtn!.focus();
  }

  function close(): void {
    overlay!.hidden = true;
    lastFocus?.focus();
  }

  versionBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });
}
