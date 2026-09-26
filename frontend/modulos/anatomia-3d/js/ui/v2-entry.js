/**
 * js/ui/v2-entry.js — ponto de entrada de v2.html (Onda 1, WP08)
 * ---------------------------------------------------------------------------
 * Único <script type="module"> de v2.html. Só liga as três peças da casca
 * (shell, sheet, navegação por foco) na ordem certa — não conhece motor
 * 3D nem conteúdo. `js/main.js` (WP13, Onda 2) é quem vai orquestrar o
 * resto (Registry, AssetLoader, Engine, Modes) por cima desta casca já
 * pronta; até lá, esta página funciona isolada (canvas vazio, painéis sem
 * conteúdo) para os testes de layout responsivo (atlas-responsive.e2e.js).
 */
import { initShell } from './shell.js';
import { initSheet } from './sheet.js';
import { initFocusNav } from './focus-nav.js';

function boot() {
  initShell();
  initSheet();
  initFocusNav();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
