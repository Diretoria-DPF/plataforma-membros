/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * update-bar.js — aviso "Há uma versão nova do Atlas" (js/core/offline.js chama quando um service worker novo
 * está esperando). Uma pílula com o botão "Atualizar" (alvo de 44 px): ao tocar, ativa a versão nova e recarrega
 * uma vez; "Depois" a fecha até a próxima abertura. Só DOM por createElement/textContent (sem innerHTML).
 */
export const UPDATE_TEXT = 'Há uma versão nova do Atlas.';

/**
 * @param {Document} doc
 * @param {() => void} apply ativa a versão nova e recarrega
 * @returns {HTMLElement} a barra (já no corpo da página); chamar de novo reaproveita a mesma
 */
export function showUpdateBar(doc, apply) {
  const existing = doc.getElementById('atlas-update-bar');
  if (existing) return existing;
  const bar = doc.createElement('div');
  bar.id = 'atlas-update-bar';
  bar.className = 'atlas-update-bar';
  bar.setAttribute('role', 'status');
  const text = doc.createElement('span');
  text.textContent = UPDATE_TEXT;
  const update = doc.createElement('button');
  update.type = 'button';
  update.className = 'atlas-update-bar-btn';
  update.textContent = 'Atualizar';
  update.addEventListener('click', () => { update.disabled = true; update.textContent = 'Atualizando…'; apply(); });
  const later = doc.createElement('button');
  later.type = 'button';
  later.className = 'atlas-update-bar-later';
  later.textContent = 'Depois';
  later.addEventListener('click', () => { if (bar.remove) bar.remove(); });
  bar.appendChild(text);
  bar.appendChild(update);
  bar.appendChild(later);
  doc.body.appendChild(bar);
  return bar;
}
