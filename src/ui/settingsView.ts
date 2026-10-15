import type { Settings, SettingsStore } from '../core/settings.ts';

/**
 * Tela de configurações: dois interruptores (som e vibração), salvos na hora.
 * Se o dispositivo não tem vibração, o interruptor fica desativado e explica.
 */
export function setupSettingsView(
  store: SettingsStore,
  opts: { hapticsSupported: boolean; onSoundEnabled: () => void },
): void {
  const overlay = byId('settings');
  const soundBtn = byId('toggle-sound') as HTMLButtonElement;
  const hapticBtn = byId('toggle-haptics') as HTMLButtonElement;
  const hapticNote = byId('haptics-note');
  let lastFocus: HTMLElement | null = null;

  function paint(): void {
    const s = store.value;
    soundBtn.setAttribute('aria-checked', String(s.sound));
    hapticBtn.setAttribute('aria-checked', String(opts.hapticsSupported && s.haptics));
    hapticBtn.disabled = !opts.hapticsSupported;
    hapticNote.hidden = opts.hapticsSupported;
  }

  function flip(key: keyof Settings): void {
    store.update({ [key]: !store.value[key] });
    paint();
    if (key === 'sound' && store.value.sound) opts.onSoundEnabled();
  }

  soundBtn.addEventListener('click', () => flip('sound'));
  hapticBtn.addEventListener('click', () => flip('haptics'));

  function open(): void {
    lastFocus = document.activeElement as HTMLElement | null;
    paint();
    overlay.hidden = false;
    byId('settings-close').focus();
  }
  function close(): void {
    overlay.hidden = true;
    lastFocus?.focus();
  }
  byId('settings-btn').addEventListener('click', open);
  byId('settings-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Elemento #${id} não encontrado.`);
  return el;
}
