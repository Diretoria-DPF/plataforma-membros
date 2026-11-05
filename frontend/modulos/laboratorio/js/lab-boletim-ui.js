/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — tela "Desempenho" da trilha (O8), baixada junto com o tutor (sob demanda, chave labMotor). Guarda cada
 * evento 'lab:competencia' no aparelho (laift_lab_boletim_v1, o mesmo armazenamento que o cartão "Desempenho" do
 * Perfil da plataforma lê). Texto só por textContent. Nada sai do aparelho. `ponte` vem de lab-tutor-ui.js:
 * { h, montar(), cabecalho(t, id, titulo, comTrilha), armazenamento() }.
 */
(function (raiz) {
  'use strict';

  const doc = raiz.document;
  const B = raiz.LabBoletim;
  let rubrica = null;
  let apagarPendente = false;

  function configurar(trilha) { rubrica = trilha && trilha.boletim ? trilha.boletim : null; }

  doc.addEventListener('lab:competencia', (e) => {
    if (!rubrica) return;
    let arm = null;
    try { arm = raiz.localStorage; } catch (err) { arm = null; }
    if (arm) B.salvar(arm, B.registrar(B.ler(arm), e.detail, rubrica));
  });

  function abrirBoletim(p) {
    apagarPendente = false;
    const h = p.h;
    const t = p.montar();
    p.cabecalho(t, 'tbTitulo', 'Desempenho', true);
    t.appendChild(h('p', { className: 'lmt-nota', text: 'Só você vê este desempenho. Ele fica neste aparelho e não tem nota, posição nem comparação com outras pessoas. O Perfil da plataforma mostra o mesmo painel.' }));
    const b = B.ler(p.armazenamento());
    const itens = B.resumo(b, rubrica).map((g) => h('li', { className: 'lmt-boletim-item', dataset: { grupo: g.id, nivel: g.nivel } }, [
      h('h4', { text: g.nome }),
      h('meter', { min: '0', max: '4', value: String(B.ORDEM.indexOf(g.nivel)), 'aria-label': `${g.nome}: ${g.rotulo}` }),
      h('p', { className: 'lmt-boletim-nivel', text: g.rotulo }),
      h('p', { className: 'lmt-boletim-texto', text: g.texto })
    ]));
    const sug = B.sugestao(b, rubrica);
    t.appendChild(h('div', { className: 'lmt-boletim' }, [
      sug ? h('p', { id: 'tbSugestao', className: 'lmt-guia-trilha', text: `Próximo treino sugerido: praticar ${sug.nome}.` }) : null,
      h('ul', { id: 'tbLista', className: 'lmt-boletim-lista' }, itens)
    ]));
    t.appendChild(h('div', { className: 'lmt-acoes' }, [h('button', { type: 'button', id: 'tbApagar', className: 'btn btn-clear', text: 'Apagar o desempenho deste aparelho', onClick: () => apagar(p) })]));
    const f = doc.getElementById('tbTitulo');
    if (f) { f.tabIndex = -1; f.focus(); }
  }

  /** Dois toques: o primeiro pede confirmação, o segundo apaga. */
  function apagar(p) {
    const b = doc.getElementById('tbApagar');
    if (!apagarPendente) { apagarPendente = true; if (b) b.textContent = 'Confirmar: apagar o desempenho'; return; }
    apagarPendente = false;
    B.apagar(p.armazenamento());
    abrirBoletim(p);
  }

  raiz.LabBoletimUI = { configurar, abrirBoletim };
})(window);
