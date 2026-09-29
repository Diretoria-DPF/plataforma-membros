/**
 * study.js — modo "Meu estudo" para o Atlas 3D.
 *
 * Implementa a interface Mode: histórico, fixadores e anotações de estruturas.
 * Integra-se com o barramento de eventos para registrar seleções e respostas de quiz.
 */

import { EVENTS } from '../core/bus.js';

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

  const offSelect = bus.on(EVENTS.STRUCTURE_SELECT, onSelect);
  const offQuiz = bus.on(EVENTS.QUIZ_ANSWER, onQuizAnswer);

  // Retorna função para desligar ambos
  return () => {
    offSelect();
    offQuiz();
  };
}

/**
 * Cria o modo "Meu estudo" (estudo).
 */
export function createStudyMode({ bus, store: studyStore, getLabel } = {}) {
  let unsubscribeRecorder = null;

  // Estado local
  let currentTab = 'history'; // 'history', 'pins', 'notes'

  return {
    id: 'estudo',
    label: 'Meu estudo',
    icon: 'bookmark',

    async enter(ctx) {
      // Anexa o gravador de eventos
      if (bus && studyStore) {
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
