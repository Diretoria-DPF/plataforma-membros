/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-webgl.e2e.js — o 3D sem WebGL 2 e depois de perder o contexto.
 * ---------------------------------------------------------------------------
 *   1. Sem WebGL 2 (three.js r186 exige): tela de falha com a mensagem
 *      específica, nunca um canvas vazio.
 *   2. Contexto WebGL perdido e recuperado (WEBGL_lose_context): aviso na
 *      tela e, ao voltar, a seleção, a câmera e a ficha continuam como
 *      estavam e o corpo volta a aparecer no canvas (pixels diferentes do
 *      fundo, comparados com antes da perda). Sem a extensão, vira skip.
 */
const { startApp, check } = require('./harness');

/** Conta pixels do canvas diferentes do canto (fundo), decodificando o PNG
 * do screenshot numa página em branco (sem a CSP do atlas). */
async function bodyPixels(app, frame) {
  const png = await frame.locator('#atlas-canvas canvas').screenshot();
  const blank = await app.context.newPage();
  try {
    return await blank.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      const [r0, g0, b0] = [data[0], data[1], data[2]];
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) > 60) n += 1;
      }
      return n / (c.width * c.height);
    }, png.toString('base64'));
  } finally {
    await blank.close();
  }
}

module.exports = async function atlasWebgl() {
  // 1) Sem WebGL 2
  {
    const app = await startApp({ role: 'member', viewport: { width: 390, height: 844 } });
    try {
      await app.context.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          return type === 'webgl2' ? null : orig.call(this, type, ...rest);
        };
      });
      await app.login();
      const frame = await app.openModule('anatomia');
      const fatal = await frame.waitForSelector('#atlas-fatal', { timeout: 20000 })
        .then(() => frame.evaluate(() => document.getElementById('atlas-fatal').textContent))
        .catch(() => null);
      check(!!fatal && /WebGL 2/.test(fatal) && /Atualize o navegador/.test(fatal),
        `sem WebGL 2 o atlas explica o motivo e o que fazer (${fatal})`);
    } finally {
      await app.close();
    }
  }

  // 2) Contexto perdido e recuperado
  {
    const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 } });
    try {
      await app.login();
      const frame = await app.openModule('anatomia');
      await frame.waitForFunction(() => {
        const I = window.__atlasInternals;
        return !!I && (I.BACKGROUND_SYSTEMS || []).every((s) => I.store.get().loadedSystems.includes(s));
      }, null, { timeout: 30000 });
      await frame.evaluate(() => {
        const I = window.__atlasInternals;
        I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:femur-r', source: 'search' });
      });
      await frame.waitForFunction(() => {
        const n = document.getElementById('organ-name');
        return n && n.textContent && n.textContent !== '---';
      }, null, { timeout: 15000 });
      await frame.waitForTimeout(1500); // tween de foco assenta
      const pixelsBefore = await bodyPixels(app, frame);
      const before = await frame.evaluate(() => {
        const I = window.__atlasInternals;
        return {
          sid: I.store.get().selectedSid,
          cam: I.engine.camera.position.toArray().map((v) => +v.toFixed(4)),
          name: document.getElementById('organ-name').textContent,
          systems: [...I.store.get().loadedSystems].sort().join(','),
        };
      });
      const lost = await frame.evaluate(async () => {
        const canvas = document.querySelector('#atlas-canvas canvas');
        const gl = canvas.getContext('webgl2');
        const ext = gl && gl.getExtension('WEBGL_lose_context');
        if (!ext) return { skipped: true };
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        ext.loseContext();
        await wait(300);
        const shown = !!document.querySelector('.atlas-webgl-lost');
        ext.restoreContext();
        await wait(1500);
        return { shown, gone: !document.querySelector('.atlas-webgl-lost') };
      });
      if (lost.skipped) {
        console.log('  · WEBGL_lose_context indisponível neste navegador — recuperação não testada (skip)');
      } else {
        const after = await frame.evaluate(() => {
          const I = window.__atlasInternals;
          return {
            sid: I.store.get().selectedSid,
            cam: I.engine.camera.position.toArray().map((v) => +v.toFixed(4)),
            name: document.getElementById('organ-name').textContent,
            systems: [...I.store.get().loadedSystems].sort().join(','),
          };
        });
        const pixelsAfter = await bodyPixels(app, frame);
        check(lost.shown && lost.gone, `WebGL perdido mostra "Recarregando o 3D…" e o aviso some ao voltar (${JSON.stringify(lost)})`);
        check(after.sid === before.sid && after.name === before.name, `depois de recuperar, a seleção e a ficha continuam (${before.sid} → ${after.sid}, "${after.name}")`);
        check(JSON.stringify(after.cam) === JSON.stringify(before.cam), `depois de recuperar, a câmera fica onde estava (${before.cam} → ${after.cam})`);
        check(after.systems === before.systems, `depois de recuperar, os sistemas carregados continuam (${after.systems})`);
        check(pixelsBefore > 0.02 && pixelsAfter >= pixelsBefore * 0.8,
          `depois de recuperar, o corpo volta a aparecer no canvas (pixels de corpo: ${(pixelsBefore * 100).toFixed(1)}% → ${(pixelsAfter * 100).toFixed(1)}%)`);
      }
      check(app.errors.length === 0, 'atlas-webgl: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
    } finally {
      await app.close();
    }
  }
};
