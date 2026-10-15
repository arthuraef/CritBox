/**
 * Tela de Transparência e Política de Privacidade (LGPD / GDPR).
 * Informa com clareza o armazenamento local e ausência de rastreamento.
 */

export function setupPrivacyView(): void {
  const overlay = document.getElementById('privacy-modal');
  const openBtn = document.getElementById('privacy-btn');
  const closeBtn = document.getElementById('privacy-close');
  if (!overlay || !openBtn || !closeBtn) return;

  const modal = overlay;
  const btn = closeBtn;
  let lastFocus: HTMLElement | null = null;

  function open(): void {
    lastFocus = document.activeElement as HTMLElement | null;
    modal.hidden = false;
    btn.focus();
  }

  function close(): void {
    modal.hidden = true;
    lastFocus?.focus();
  }

  openBtn.addEventListener('click', open);
  btn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
}
