/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Catálogo único dos módulos de estudo (TRA-13/16): nome, ícone, descrição, caminho e contexto da Guia.
// Usado pelo Aprender (learning.js), pelo Aprender v2 (learn-v2.js), pela Início v3 (home-v3.js), pelo retorno
// de engajamento (engagement.js) e pela Guia (assistant-hints.js). Os números de questões vêm de
// QUESTION_COUNTS; o teste scripts/catalogo.test.mjs confere que batem com os bancos de questões reais.
// Expõe window.LaiftModules (ou module.exports, no Node). Sem dado pessoal e sem rede.
(function (root) {
  'use strict';

  /** Questões por módulo (quiz/questions.js e toxicologia/questions.js; conferido por teste). */
  var QUESTION_COUNTS = Object.freeze({ farmaco: 240, toxico: 240 });

  var LIST = [
    { id: 'farmaco', stat: 'farmacologia', icon: '💊', name: 'Farmacologia', path: 'modulos/quiz/index.html', subBase: 'Simulador', context: 'pharma',
      desc: 'Mecanismos de ação, farmacocinética clínica, receptores e farmacodinâmica comparada.', tags: ['Simulador'] },
    { id: 'toxico', stat: 'toxicologia', icon: '🧪', name: 'Toxicologia', path: 'modulos/toxicologia/index.html', subBase: 'Antídotos', context: 'toxic',
      desc: 'Intoxicações agudas, defensivos agrícolas, animais peçonhentos e antídotos.', tags: ['Antídotos'] },
    { id: 'clinica', stat: 'clinica', icon: '🩺', name: 'Clínica virtual', path: 'modulos/clinica/index.html', subBase: 'Casos e plantão', context: 'clinic',
      desc: 'Plantão multipaciente, acervo da liga, roteiro semiológico e preceptor com IA.', tags: ['Preceptor IA', 'Acervo e plantão'] },
    { id: 'lab', stat: 'laboratorio', icon: '🔬', name: 'Laboratório virtual', path: 'modulos/laboratorio/index.html', subBase: 'Bancada e moléculas 3D', context: 'lab',
      desc: 'Ensaios de bancada, sínteses, identificação de compostos e estúdio molecular 3D.', tags: ['Bancada', 'Estúdio 3D'] },
    { id: 'anatomia', stat: 'anatomia', icon: '🧬', name: 'Anatomia e PK 3D', path: 'modulos/anatomia-3d/index.html', subBase: 'Corpo humano e vias', context: 'atlas',
      desc: 'Corpo humano 3D, farmacocinética visual e vias metabólicas.', tags: ['Simulação PK', 'Atlas 3D'] },
  ];

  function questionText(id) {
    var n = QUESTION_COUNTS[id];
    return n ? n + ' questões' : '';
  }

  var MODULES = Object.freeze(LIST.map(function (m) {
    var q = questionText(m.id);
    return Object.freeze({
      id: m.id, stat: m.stat, icon: m.icon, name: m.name, path: m.path, desc: m.desc, context: m.context,
      sub: q ? m.subBase + ' · ' + q : m.subBase,
      tags: Object.freeze(q ? m.tags.concat([q]) : m.tags.slice()),
    });
  }));

  function byId(id) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === id) return MODULES[i];
    return null;
  }

  function byStat(stat) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].stat === stat) return MODULES[i];
    return null;
  }

  function nameOf(id) { var m = byId(id); return m ? m.name : ''; }

  var api = { QUESTION_COUNTS: QUESTION_COUNTS, MODULES: MODULES, byId: byId, byStat: byStat, nameOf: nameOf };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftModules = api;
})(typeof window !== 'undefined' ? window : globalThis);
