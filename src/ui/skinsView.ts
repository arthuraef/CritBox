/**
 * Interface de gerenciamento e seleção de skins do D20.
 * Suporta equipar skins gratuitas e desbloquear skins especiais via anúncio recompensado.
 */

import { SKINS_CATALOG, type DiceSkin, type SkinsStore } from '../core/skins.ts';
import type { RewardedAdProvider } from '../core/ads.ts';

export function setupSkinsView(
  skinsStore: SkinsStore,
  adProvider: RewardedAdProvider,
  onSkinChanged: (skin: DiceSkin) => void,
  onRewardUnlocked?: () => void,
): void {
  const overlay = document.getElementById('skins-modal');
  const openBtn = document.getElementById('skins-btn');
  const closeBtn = document.getElementById('skins-close');
  const listEl = document.getElementById('skins-list');

  if (!overlay || !openBtn || !closeBtn || !listEl) return;

  let lastFocus: HTMLElement | null = null;

  function renderList(): void {
    listEl!.innerHTML = '';
    const activeId = skinsStore.value.activeId;

    for (const skin of SKINS_CATALOG) {
      const isUnlocked = skinsStore.isUnlocked(skin.id);
      const isActive = skin.id === activeId;

      const item = document.createElement('li');
      item.className = `skin-item ${isActive ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`;

      const preview = document.createElement('div');
      preview.className = 'skin-preview-swatch';
      preview.style.backgroundColor = skin.previewColor;

      const info = document.createElement('div');
      info.className = 'skin-info';

      const titleRow = document.createElement('div');
      titleRow.className = 'skin-title-row';

      const name = document.createElement('h3');
      name.textContent = skin.name;
      titleRow.appendChild(name);

      if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'skin-badge active';
        badge.textContent = 'Equipado';
        titleRow.appendChild(badge);
      } else if (!isUnlocked) {
        const badge = document.createElement('span');
        badge.className = 'skin-badge reward';
        badge.textContent = 'Anúncio';
        titleRow.appendChild(badge);
      }

      const desc = document.createElement('p');
      desc.textContent = skin.description;

      info.appendChild(titleRow);
      info.appendChild(desc);

      const action = document.createElement('div');
      action.className = 'skin-action';

      if (isActive) {
        const equippedLabel = document.createElement('span');
        equippedLabel.className = 'skin-equipped-text';
        equippedLabel.textContent = 'Em uso';
        action.appendChild(equippedLabel);
      } else if (isUnlocked) {
        const equipBtn = document.createElement('button');
        equipBtn.type = 'button';
        equipBtn.className = 'btn plain';
        equipBtn.textContent = 'Equipar';
        equipBtn.addEventListener('click', () => {
          skinsStore.select(skin.id);
          onSkinChanged(skinsStore.activeSkin);
          renderList();
        });
        action.appendChild(equipBtn);
      } else {
        const unlockBtn = document.createElement('button');
        unlockBtn.type = 'button';
        unlockBtn.className = 'btn danger';
        unlockBtn.textContent = 'Desbloquear';
        unlockBtn.addEventListener('click', () => {
          void adProvider.show({
            onReward: () => {
              skinsStore.unlock(skin.id);
              skinsStore.select(skin.id);
              onSkinChanged(skinsStore.activeSkin);
              renderList();
              if (onRewardUnlocked) onRewardUnlocked();
            },
          });
        });
        action.appendChild(unlockBtn);
      }

      item.appendChild(preview);
      item.appendChild(info);
      item.appendChild(action);
      listEl!.appendChild(item);
    }
  }

  function open(): void {
    lastFocus = document.activeElement as HTMLElement | null;
    renderList();
    overlay!.hidden = false;
    closeBtn!.focus();
  }

  function close(): void {
    overlay!.hidden = true;
    lastFocus?.focus();
  }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay!.hidden) close();
  });
}
