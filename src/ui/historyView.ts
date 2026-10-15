import type { HistoryStore } from '../core/history.ts';

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Tela de histórico: lista (mais recente primeiro), fechar e limpar com
 * confirmação. Só lê e altera o `HistoryStore`; não toca em skins.
 */
export function setupHistoryView(store: HistoryStore, onCleared: () => void): void {
  const overlay = byId('history');
  const list = byId('history-list');
  const empty = byId('history-empty');
  const note = byId('history-note');
  const clearBtn = byId('history-clear') as HTMLButtonElement;
  const confirm = byId('confirm');
  const openBtn = byId('history-btn');
  let lastFocus: HTMLElement | null = null;

  function render(): void {
    list.replaceChildren();
    const newestFirst = [...store.records].reverse();
    const fragment = document.createDocumentFragment();
    for (const record of newestFirst) {
      const li = document.createElement('li');
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = dateFormat.format(new Date(record.timestamp));
      const val = document.createElement('span');
      val.className = 'val' + (record.result === 20 ? ' crit' : record.result === 1 ? ' fumble' : '');
      val.textContent = String(record.result);
      li.append(when, val);
      fragment.append(li);
    }
    list.append(fragment);
    const hasItems = newestFirst.length > 0;
    empty.hidden = hasItems;
    list.hidden = !hasItems;
    clearBtn.disabled = !hasItems;
    note.textContent = store.isPersistent ? '' : 'Não foi possível salvar neste navegador.';
  }

  function open(): void {
    lastFocus = document.activeElement as HTMLElement | null;
    render();
    overlay.hidden = false;
    byId('history-close').focus();
  }
  function close(): void {
    overlay.hidden = true;
    lastFocus?.focus();
  }

  openBtn.addEventListener('click', open);
  byId('history-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  clearBtn.addEventListener('click', () => {
    confirm.hidden = false;
    byId('confirm-no').focus();
  });
  byId('confirm-no').addEventListener('click', () => {
    confirm.hidden = true;
    clearBtn.focus();
  });
  byId('confirm-yes').addEventListener('click', () => {
    store.clear();
    confirm.hidden = true;
    render();
    onCleared();
    byId('history-close').focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!confirm.hidden) {
      confirm.hidden = true;
    } else if (!overlay.hidden) {
      close();
    }
  });
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Elemento #${id} não encontrado.`);
  return el;
}
