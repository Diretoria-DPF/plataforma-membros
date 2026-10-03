/**
 * study.js — modo "Meu estudo" para o Atlas 3D.
 *
 * Implementa a interface Mode: histórico, fixadores e anotações de estruturas.
 * Integra-se com o barramento de eventos para registrar seleções e respostas de quiz.
 */

import { EVENTS } from '../core/bus.js';
import { ATLAS_FLAGS } from '../core/flags.js';
import { buildExport, validateImport, planMerge, summarize } from './study-io.js';

// CSS para impressão de PDF
const DOSSIE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    padding: 2rem;
    background: white;
  }
  h1 { font-size: 2rem; margin: 1rem 0; }
  h2 { font-size: 1.5rem; margin: 1.5rem 0 0.75rem; }
  h3 { font-size: 1.1rem; margin: 1rem 0 0.5rem; }
  p { margin: 0.5rem 0; }
  ul, ol { margin: 0.5rem 0 0.5rem 1.5rem; }
  li { margin: 0.25rem 0; }
  .header {
    text-align: center;
    border-bottom: 2px solid var(--laift-border);
    padding-bottom: 1rem;
    margin-bottom: 2rem;
  }
  .section {
    margin: 2rem 0;
    break-inside: avoid;
  }
  .footer {
    margin-top: 3rem;
    text-align: center;
    font-size: 0.9rem;
    color: #666;
    border-top: 1px solid var(--laift-border);
    padding-top: 1rem;
  }
  @media print {
    body { padding: 1rem; }
    .section { break-inside: avoid; }
  }
`;

/**
 * Registra seleções de estrutura e respostas de quiz no histórico.
 * Chamado uma única vez ao inicializar a aplicação.
 */
export function attachRecorder(bus, studyStore) {
  // Não usa `this`, é uma função pura
  const onSelect = ({ sid, source }) => {
    if (sid) {
      // Tenta obter o label (sid é suficiente; label é opcionalmente passado)
      studyStore.addHistory({
        type: 'select',
        sid,
        label: sid,
        at: Date.now(),
      });
    }
  };

  const onQuizAnswer = ({ caseId, sid, correct }) => {
    studyStore.addHistory({
      type: 'quiz',
      sid,
      label: `Quiz: ${caseId}`,
      at: Date.now(),
    });
  };

  // Estudo de via/processo concluído (PR 3.2, Bloco D).
  const onStudyPath = ({ kind, id, label, sid }) => {
    if (!id) return;
    studyStore.addHistory({
      type: kind === 'route' ? 'route' : 'process',
      kind,
      refId: id,
      sid: sid || null,
      label: `${kind === 'route' ? 'Via' : 'Processo'}: ${label || id}`,
      at: Date.now(),
    });
  };

  const offSelect = bus.on(EVENTS.STRUCTURE_SELECT, onSelect);
  const offQuiz = bus.on(EVENTS.QUIZ_ANSWER, onQuizAnswer);
  const offStudy = bus.on(EVENTS.STUDY_PATH, onStudyPath);

  // Retorna função para desligar ambos
  return () => {
    offSelect();
    offQuiz();
    offStudy();
  };
}

/**
 * Cria o modo "Meu estudo" (estudo).
 */
export function createStudyMode({ bus, store: studyStore, getLabel, recordOwnHistory = true, getReviewed = null } = {}) {
  let unsubscribeRecorder = null;

  // Estado local
  let currentTab = 'history'; // 'history', 'pins', 'notes'

  return {
    id: 'estudo',
    label: 'Meu estudo',
    icon: 'bookmark',

    async enter(ctx) {
      // Anexa o gravador de eventos (js/main.js já grava o tempo todo e
      // passa recordOwnHistory: false — gravar aqui também duplicaria).
      if (bus && studyStore && recordOwnHistory) {
        unsubscribeRecorder = attachRecorder(bus, studyStore);
      }
    },

    async exit() {
      if (unsubscribeRecorder) {
        unsubscribeRecorder();
        unsubscribeRecorder = null;
      }
    },

    sheetContent() {
      const { h, html, setHtml, clear, appendHtml, escapeHtml } = window.LaiftDom;
      const root = h('div', { className: 'study-sheet' }, []);

      // M4 (PR 3.2): progresso nas fichas revisadas pelo conselho.
      if (typeof getReviewed === 'function') {
        Promise.resolve(getReviewed()).then((p) => {
          if (!p || !(p.total > 0)) return;
          const pct = Math.round((100 * p.visited) / p.total);
          const card = h('section', { className: 'study-reviewed', 'aria-label': 'Fichas revisadas', style: { padding: '0.75rem', border: '1px solid var(--laift-border)', borderRadius: '6px', margin: '0 0 0.75rem' } }, [
            h('div', { style: { fontWeight: '600', marginBottom: '0.25rem' }, text: 'Explore as fichas revisadas' }),
            h('div', { className: 'study-reviewed-count', style: { fontSize: '0.85rem', color: 'var(--laift-muted)', marginBottom: '0.4rem' }, text: `${p.visited} de ${p.total} fichas revisadas pelo conselho já exploradas` }),
            h('div', { role: 'progressbar', 'aria-label': 'Fichas revisadas exploradas', 'aria-valuemin': '0', 'aria-valuemax': String(p.total), 'aria-valuenow': String(p.visited), style: { height: '6px', background: 'var(--laift-border)', borderRadius: '3px', overflow: 'hidden' } }, [
              h('span', { style: { display: 'block', height: '100%', width: `${pct}%`, background: 'var(--laift-primary)' } }),
            ]),
          ]);
          root.insertBefore(card, root.firstChild);
        }).catch(() => {});
      }

      // Aba de navegação
      const tabBar = h('div', { className: 'study-tabs', style: { display: 'flex', borderBottom: '1px solid var(--laift-border)' } }, [
        h('button', {
          className: 'study-tab-btn',
          text: 'Histórico',
          style: { flex: 1, padding: '0.75rem', border: 'none', background: currentTab === 'history' ? 'var(--laift-primary-soft)' : 'transparent', cursor: 'pointer' },
          onClick: () => {
            currentTab = 'history';
            updateContent();
          },
        }),
        h('button', {
          className: 'study-tab-btn',
          text: 'Fixados',
          style: { flex: 1, padding: '0.75rem', border: 'none', background: currentTab === 'pins' ? 'var(--laift-primary-soft)' : 'transparent', cursor: 'pointer' },
          onClick: () => {
            currentTab = 'pins';
            updateContent();
          },
        }),
        h('button', {
          className: 'study-tab-btn',
          text: 'Anotações',
          style: { flex: 1, padding: '0.75rem', border: 'none', background: currentTab === 'notes' ? 'var(--laift-primary-soft)' : 'transparent', cursor: 'pointer' },
          onClick: () => {
            currentTab = 'notes';
            updateContent();
          },
        }),
      ]);

      root.appendChild(tabBar);

      // Conteúdo das abas
      const content = h('div', { className: 'study-content', style: { padding: '1rem 0' } });
      root.appendChild(content);

      // Botão de exportação
      const exportBtn = h('button', {
        text: 'Exportar dossiê (PDF)',
        style: { width: '100%', padding: '0.75rem', background: '#4285f4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '1rem' },
        onClick: async () => {
          await exportarDossie();
        },
      });
      root.appendChild(exportBtn);

      // A.3 (Onda 3.5): levar o progresso para outro aparelho (arquivo JSON do aluno).
      const ioMsg = h('p', { className: 'study-io-msg', role: 'status', 'aria-live': 'polite', style: { fontSize: '0.875rem', margin: '0.5rem 0 0' } });
      const ioBtnStyle = { flex: '1', minHeight: '44px', padding: '0.5rem', background: 'var(--laift-surface)', color: 'var(--laift-text)', border: '1px solid var(--laift-border)', borderRadius: '4px', cursor: 'pointer' };
      const snapshot = async () => ({ history: await studyStore.listHistory(), pins: await studyStore.listPins(), notes: await studyStore.listNotes() });
      const fileInput = h('input', { type: 'file', accept: 'application/json,.json', className: 'study-io-file', 'aria-label': 'Escolher arquivo de progresso', style: { display: 'none' } });
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
          const parsed = validateImport(JSON.parse(await file.text()));
          if (!parsed.ok) { ioMsg.textContent = parsed.error; return; }
          const plan = planMerge(await snapshot(), parsed.data);
          for (const e of plan.history) await studyStore.addHistory(e);
          for (const p of plan.pins) await studyStore.putPin(p);
          for (const n of plan.notes) await studyStore.putNote(n);
          ioMsg.textContent = summarize(plan);
          if (typeof updateContent === 'function') await updateContent();
        } catch (err) {
          ioMsg.textContent = 'Não consegui ler esse arquivo.';
        }
      });
      const ioRow = h('div', { className: 'study-io', style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } }, [
        h('button', {
          type: 'button', className: 'study-io-export', text: 'Exportar progresso (JSON)', style: ioBtnStyle,
          onClick: async () => {
            const blob = new Blob([JSON.stringify(buildExport(await snapshot()), null, 1)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = h('a', { href: url, download: `atlas-progresso-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            ioMsg.textContent = 'Progresso exportado.';
          },
        }),
        h('button', { type: 'button', className: 'study-io-import', text: 'Importar', style: ioBtnStyle, onClick: () => fileInput.click() }),
        fileInput,
      ]);
      root.appendChild(ioRow);
      root.appendChild(ioMsg);
      if (ATLAS_FLAGS.telemetry) {
        root.appendChild(h('p', { className: 'study-privacy', text: 'O atlas conta usos de forma anônima (sem nome, e-mail nem o texto das buscas) para melhorar o conteúdo.', style: { fontSize: '0.8125rem', margin: '0.75rem 0 0', opacity: '0.85' } }));
      }

      // Aviso de persistência
      if (!studyStore.isPersistent()) {
        const warning = h('div', {
          style: { padding: '0.75rem', background: '#fff3cd', color: '#856404', borderRadius: '4px', marginTop: '0.75rem', fontSize: '0.875rem' },
          text: 'Seu histórico fica só neste aparelho.',
        });
        root.appendChild(warning);
      }

      // Função para atualizar conteúdo
      async function updateContent() {
        clear(content);

        if (currentTab === 'history') {
          await renderHistorico(content);
        } else if (currentTab === 'pins') {
          await renderPins(content);
        } else if (currentTab === 'notes') {
          await renderNotas(content);
        }

        // Atualiza background das abas
        Array.from(tabBar.querySelectorAll('button')).forEach((btn, i) => {
          const tabs = ['history', 'pins', 'notes'];
          btn.style.background = tabs[i] === currentTab ? 'var(--laift-primary-soft)' : 'transparent';
        });
      }

      async function renderHistorico(container) {
        const entries = await studyStore.listHistory({ limit: 100 });
        if (entries.length === 0) {
          container.appendChild(h('p', { style: { padding: '1rem', color: 'var(--laift-muted)' }, text: 'Nenhum item no histórico.' }));
          return;
        }

        // Agrupa por data
        const grouped = {};
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        entries.forEach(entry => {
          const entryDate = new Date(entry.at);
          let group;

          if (entryDate.toDateString() === today.toDateString()) {
            group = 'Hoje';
          } else if (entryDate.toDateString() === yesterday.toDateString()) {
            group = 'Ontem';
          } else {
            group = 'Anteriores';
          }

          if (!grouped[group]) grouped[group] = [];
          grouped[group].push(entry);
        });

        const groups = ['Hoje', 'Ontem', 'Anteriores'];
        groups.forEach(group => {
          if (!grouped[group]) return;

          const groupTitle = h('h3', { style: { marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--laift-muted)' }, text: group });
          container.appendChild(groupTitle);

          grouped[group].forEach(entry => {
            const item = h('div', {
              className: 'history-item',
              style: { padding: '0.75rem', borderBottom: '1px solid #eee', cursor: 'pointer' },
              onClick: () => {
                if (bus && entry.sid) {
                  bus.emit(EVENTS.STRUCTURE_SELECT, { sid: entry.sid, source: 'api' });
                }
              },
            }, [
              h('div', { style: { fontWeight: '500' }, text: escapeHtml(entry.label) }),
              h('div', { style: { fontSize: '0.75rem', color: 'var(--laift-muted)' }, text: new Date(entry.at).toLocaleTimeString('pt-BR') }),
            ]);
            container.appendChild(item);
          });
        });
      }

      async function renderPins(container) {
        const pins = await studyStore.listPins();
        if (pins.length === 0) {
          container.appendChild(h('p', { style: { padding: '1rem', color: 'var(--laift-muted)' }, text: 'Nenhuma estrutura fixada.' }));
          return;
        }

        pins.forEach(pin => {
          const item = h('div', {
            style: { padding: '0.75rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
          }, [
            h('div', [
              h('div', { style: { fontWeight: '500' }, text: escapeHtml(pin.label) }),
              h('div', { style: { fontSize: '0.75rem', color: 'var(--laift-muted)' }, text: pin.sid }),
            ]),
            h('button', {
              text: '✕',
              style: { background: '#ff4444', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer' },
              onClick: async () => {
                await studyStore.togglePin({ sid: pin.sid, label: pin.label });
                await updateContent();
              },
            }),
          ]);
          container.appendChild(item);
        });
      }

      async function renderNotas(container) {
        const pins = await studyStore.listPins();
        if (pins.length === 0) {
          container.appendChild(h('p', { style: { padding: '1rem', color: 'var(--laift-muted)' }, text: 'Nenhuma estrutura fixada com anotações.' }));
          return;
        }

        for (const pin of pins) {
          const noteText = await studyStore.getNote(pin.sid);
          const noteSection = h('div', { style: { padding: '0.75rem', borderBottom: '1px solid #eee' } }, [
            h('div', { style: { fontWeight: '500', marginBottom: '0.5rem' }, text: escapeHtml(pin.label) }),
            h('textarea', {
              value: noteText || '',
              style: { width: '100%', padding: '0.5rem', border: '1px solid var(--laift-border)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.875rem' },
              onBlur: async (evt) => {
                const newText = evt.target.value;
                await studyStore.setNote(pin.sid, newText);
              },
            }),
          ]);
          container.appendChild(noteSection);
        }
      }

      async function exportarDossie() {
        const history = await studyStore.listHistory({ limit: 500 });
        const pins = await studyStore.listPins();
        const pdfWindow = window.open('', '_blank');

        if (!pdfWindow) {
          alert('Não foi possível abrir a janela de impressão.');
          return;
        }

        // Constrói o documento usando DOM puro
        const doc = pdfWindow.document;
        doc.open();

        // Escreve o head com CSS
        doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Dossiê - Meu Estudo</title>
<style>${DOSSIE_CSS}</style>
</head>
<body>`);

        // Cabeçalho
        doc.write(`<div class="header">
  <h1>Dossiê - Meu Estudo</h1>
  <p>LAIFT — Atlas Anatômico</p>
  <p>${new Date().toLocaleDateString('pt-BR')}</p>
</div>`);

        // Histórico
        doc.write('<div class="section"><h2>Histórico</h2>');
        if (history.length === 0) {
          doc.write('<p>Nenhum item no histórico.</p>');
        } else {
          doc.write('<ol>');
          history.forEach(entry => {
            const time = new Date(entry.at).toLocaleString('pt-BR');
            doc.write(`<li>${escapeHtml(entry.label)} — ${escapeHtml(entry.type)} (${escapeHtml(time)})</li>`);
          });
          doc.write('</ol>');
        }
        doc.write('</div>');

        // Fixadores
        doc.write('<div class="section"><h2>Estruturas Fixadas</h2>');
        if (pins.length === 0) {
          doc.write('<p>Nenhuma estrutura fixada.</p>');
        } else {
          doc.write('<ul>');
          pins.forEach(pin => {
            doc.write(`<li>${escapeHtml(pin.label)}</li>`);
          });
          doc.write('</ul>');
        }
        doc.write('</div>');

        // Anotações
        doc.write('<div class="section"><h2>Anotações</h2>');
        let hasNotes = false;
        for (const pin of pins) {
          const noteText = await studyStore.getNote(pin.sid);
          if (noteText) {
            hasNotes = true;
            doc.write(`<h3>${escapeHtml(pin.label)}</h3>`);
            doc.write(`<p>${escapeHtml(noteText).replace(/\n/g, '<br>')}</p>`);
          }
        }
        if (!hasNotes) {
          doc.write('<p>Nenhuma anotação.</p>');
        }
        doc.write('</div>');

        // Rodapé
        doc.write(`<div class="footer">
  <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
</div>`);

        doc.write('</body></html>');
        doc.close();

        // Abre o diálogo de impressão
        setTimeout(() => {
          pdfWindow.print();
        }, 250);
      }

      // Renderiza a aba inicial
      updateContent();

      return root;
    },
  };
}
