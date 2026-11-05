/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — telas do boletim e do certificado (O8), baixadas junto com o tutor (sob demanda, chave labMotor).
 * Guarda cada evento 'lab:competencia' no aparelho. Texto só por textContent. Nada sai do aparelho; o
 * certificado é impresso ou salvo em PDF pelo navegador. `ponte` vem de lab-tutor-ui.js:
 * { h, montar(), cabecalho(t, id, titulo, comTrilha), armazenamento(), progresso(), trilha(), certificado }.
 */
(function (raiz) {
  'use strict';

  const doc = raiz.document;
  const B = raiz.LabBoletim;
  const Ce = raiz.LabCertificado;
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
    p.cabecalho(t, 'tbTitulo', 'Boletim por competência', true);
    t.appendChild(h('p', { className: 'lmt-nota', text: 'Só você vê este boletim. Ele fica neste aparelho e não tem nota, posição nem comparação com outras pessoas.' }));
    const itens = B.resumo(B.ler(p.armazenamento()), rubrica).map((g) => h('li', { className: 'lmt-boletim-item', dataset: { grupo: g.id, nivel: g.nivel } }, [
      h('h4', { text: g.nome }),
      h('meter', { min: '0', max: '4', value: String(['sem_registro', 'iniciando', 'em_desenvolvimento', 'proficiente', 'dominio'].indexOf(g.nivel)), 'aria-label': `${g.nome}: ${g.rotulo}` }),
      h('p', { className: 'lmt-boletim-nivel', text: g.rotulo }),
      h('p', { className: 'lmt-boletim-texto', text: g.texto })
    ]));
    t.appendChild(h('div', { className: 'lmt-boletim' }, [h('ul', { id: 'tbLista', className: 'lmt-boletim-lista' }, itens)]));
    const acoes = [h('button', { type: 'button', id: 'tbApagar', className: 'btn btn-clear', text: 'Apagar o boletim deste aparelho', onClick: () => apagar(p) })];
    if (p.certificado) acoes.unshift(h('button', { type: 'button', id: 'tbCertificados', className: 'btn btn-play', text: 'Certificados', onClick: () => abrirCertificados(p) }));
    t.appendChild(h('div', { className: 'lmt-acoes' }, acoes));
    const f = doc.getElementById('tbTitulo');
    if (f) { f.tabIndex = -1; f.focus(); }
  }

  /** Dois toques: o primeiro pede confirmação, o segundo apaga. */
  function apagar(p) {
    const b = doc.getElementById('tbApagar');
    if (!apagarPendente) { apagarPendente = true; if (b) b.textContent = 'Confirmar: apagar o boletim'; return; }
    apagarPendente = false;
    B.apagar(p.armazenamento());
    abrirBoletim(p);
  }

  function abrirCertificados(p) {
    const h = p.h;
    const t = p.montar();
    p.cabecalho(t, 'tcTitulo', 'Certificados', true);
    const lista = Ce.elegiveis(p.trilha(), p.progresso());
    t.appendChild(h('p', { className: 'lmt-nota', text: lista.length ? 'Um certificado por nível concluído com lote conforme em todas as missões jogáveis.' : 'Conclua todas as missões jogáveis de um nível, com lote conforme, para emitir o certificado dele.' }));
    t.appendChild(h('ul', { id: 'tcLista', className: 'lmt-cartoes' }, lista.map((n) => h('li', { className: 'lmt-cartao' }, [
      h('h4', { text: `Nível ${n.nivel}: ${n.nome}` }),
      h('button', { type: 'button', id: `tcVer-${n.nivel}`, className: 'btn btn-play', text: 'Ver certificado', onClick: () => ver(p, n) })
    ]))));
    t.appendChild(h('div', { className: 'lmt-acoes' }, [h('button', { type: 'button', className: 'btn btn-clear', text: 'Voltar ao boletim', onClick: () => abrirBoletim(p) })]));
  }

  function ver(p, nivel) {
    const h = p.h;
    const t = p.montar();
    p.cabecalho(t, 'tcTitulo', 'Certificado', true);
    const c = Ce.montar({ nome: Ce.nomeDaIdentidade(raiz), nivel, data: new Date() });
    const tela = h('div', { className: 'lmt-certificado-tela' });
    if (!c) {
      tela.appendChild(h('p', { id: 'tcSemNome', role: 'alert', text: 'Não foi possível ler o seu nome na plataforma. Entre na sua conta e abra o Laboratório de novo para emitir o certificado.' }));
    } else {
      tela.appendChild(h('div', { id: 'tcFolha', className: 'lmt-certificado-folha' }, [
        h('h3', { text: c.titulo }), h('p', { text: c.corpo }), h('ul', {}, c.linhas.slice(0, -1).map((l) => h('li', { text: l }))), h('p', { text: c.linhas[c.linhas.length - 1] })
      ]));
      tela.appendChild(h('div', { className: 'lmt-acoes' }, [h('button', { type: 'button', id: 'tcImprimir', className: 'btn btn-play', text: 'Imprimir ou salvar em PDF', onClick: () => raiz.print() })]));
    }
    tela.appendChild(h('div', { className: 'lmt-acoes' }, [h('button', { type: 'button', className: 'btn btn-clear', text: 'Voltar aos certificados', onClick: () => abrirCertificados(p) })]));
    t.appendChild(tela);
  }

  raiz.LabBoletimUI = { configurar, abrirBoletim, abrirCertificados };
})(window);
