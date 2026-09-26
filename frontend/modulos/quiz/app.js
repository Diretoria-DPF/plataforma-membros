/**
 * SIMULADOR DE FARMACOLOGIA LAIFT — configuração do módulo
 *
 * O ciclo do simulado (tópicos, modos estudo/prova, cronômetro, navegação,
 * progresso e resultados) vive no motor único ../shared/quiz-engine.js,
 * compartilhado com a Toxicologia. Aqui ficam só as partes deste módulo:
 * o banco de questões, a chave de progresso (pharmaQuizProgress, a mesma de
 * sempre), o desenho 2D da molécula (SmilesDrawer + PubChem) e a ficha
 * farmacológica (RxNav/ChEBI/PubChem, via quiz-apis.js).
 *
 * O banco de questions.js não vem com farmacoAlvo/smiles em nenhuma questão,
 * então obterQuestoesDisponiveis() completa cada questão sem esse campo com
 * o fármaco detectado no enunciado/alternativa correta/explicação, via
 * detectarFarmacoAlvo() (farmacos-lexicon.js) — é isso que liga a projeção
 * molecular e a ficha farmacológica às APIs científicas em uso normal.
 *
 * As métricas deixaram de ir ao Apps Script legado: o motor envia
 * apiLearnSubmitQuizAttempt pela ponte da plataforma (window.LaiftApi).
 */
(function () {
    'use strict';

    var h = LaiftDom.h;
    var smilesDrawerInstance = null;

    // Enriquece questões sem farmacoAlvo explícito com o fármaco detectado no
    // enunciado/alternativa correta/explicação (farmacos-lexicon.js), para que
    // a projeção molecular e a ficha farmacológica tenham o que consultar
    // mesmo no banco de questions.js (que não vem com farmacoAlvo/smiles).
    function comFarmacoDetectado(q) {
        if (q.farmacoAlvo || typeof detectarFarmacoAlvo !== 'function') return q;
        var achado = detectarFarmacoAlvo(q);
        if (!achado) return q;
        q.farmacoAlvo = achado.farmacoAlvo;
        q.farmacoConsulta = achado.farmacoConsulta;
        return q;
    }

    // Normalizador de banco (suporta questions.js e quiz-database.js)
    function obterQuestoesDisponiveis() {
        if (typeof allQuestions !== 'undefined' && Array.isArray(allQuestions) && allQuestions.length > 0) {
            return allQuestions.map(comFarmacoDetectado);
        }
        if (typeof QUIZ_FARMACOLOGIA_DB !== 'undefined' && Array.isArray(QUIZ_FARMACOLOGIA_DB) && QUIZ_FARMACOLOGIA_DB.length > 0) {
            return QUIZ_FARMACOLOGIA_DB.map(function (q, idx) {
                var correta = q.alternativas ? q.alternativas.find(function (a) { return a.correta; }) : null;
                return comFarmacoDetectado({
                    id: q.id || idx + 1,
                    topic: q.modulo || q.topic || 'Farmacologia Clínica',
                    farmacoAlvo: q.farmacoAlvo || null,
                    smiles: q.smiles || null,
                    pubchemCid: q.pubchemCid || null,
                    question: q.enunciado || q.question,
                    options: Array.isArray(q.options) ? q.options : (q.alternativas ? q.alternativas.map(function (a) { return a.texto; }) : []),
                    correct: typeof q.correct === 'number' ? q.correct : (q.alternativas ? q.alternativas.findIndex(function (a) { return a.correta; }) : 0),
                    explanation: q.explanation || (correta ? correta.feedback : ''),
                    analogiaDidatica: q.analogiaDidatica || ''
                });
            });
        }
        return [];
    }

    function initSmilesDrawer() {
        if (typeof SmilesDrawer === 'undefined' || smilesDrawerInstance) return;
        try {
            smilesDrawerInstance = new SmilesDrawer.Drawer({
                width: 220,
                height: 140,
                bondThickness: 1.4,
                compactDrawing: true,
                themes: {
                    dark: {
                        C: '#e2e8f0', O: '#ef4444', N: '#38bdf8', F: '#4ade80',
                        CL: '#facc15', BR: '#fb923c', I: '#c084fc', BACKGROUND: 'transparent'
                    }
                }
            });
        } catch (e) {
            console.warn('[SmilesDrawer] Falha na inicialização do motor gráfico:', e);
        }
    }

    var renderToken = 0;
    async function renderMolecularStructure(question) {
        var canvas = document.getElementById('quizMolCanvas');
        var label = document.getElementById('quizMolLabel');
        if (!canvas) return;
        var token = ++renderToken;

        var ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

        var farmacoAlvo = question.farmacoAlvo || question.drug || null;
        var farmacoConsulta = question.farmacoConsulta || farmacoAlvo;
        var smiles = question.smiles || null;
        if (label) label.textContent = farmacoAlvo || (smiles ? 'Estrutura Química' : '--');

        if (!smiles && farmacoAlvo && typeof QuizAPIEngine !== 'undefined') {
            if (label) label.textContent = farmacoAlvo + ' (Buscando...)';
            var info = await QuizAPIEngine.buscarEstruturaMolecular(farmacoConsulta);
            if (token !== renderToken) return; // a pessoa já mudou de questão
            if (info && info.smiles) {
                smiles = info.smiles;
                if (label) label.textContent = farmacoAlvo + (info.cid ? ' (CID: ' + info.cid + ')' : '');
            } else if (label) {
                label.textContent = farmacoAlvo;
            }
        }

        if (smiles && typeof SmilesDrawer !== 'undefined') {
            initSmilesDrawer();
            SmilesDrawer.parse(smiles, function (tree) {
                if (smilesDrawerInstance && token === renderToken) smilesDrawerInstance.draw(tree, canvas, 'dark', false);
            }, function (err) {
                console.warn('[SmilesDrawer] Erro ao renderizar SMILES:', err);
            });
        }
    }

    // ------------------------------------------------------------------
    // Ficha farmacológica (dados de APIs públicas → sempre textContent)
    // ------------------------------------------------------------------
    var modalDossie = document.getElementById('modalDossieQuiz');
    var dossieContent = document.getElementById('dossieContent');
    var btnVerDossie = document.getElementById('btnVerDossie');
    var closeDossie = document.getElementById('closeDossie');
    var returnFocus = null;

    function fecharDossie() {
        if (!modalDossie || modalDossie.hidden) return;
        modalDossie.hidden = true;
        modalDossie.classList.remove('open');
        if (returnFocus && returnFocus.focus) returnFocus.focus();
    }

    function linha(rotulo, valor, className) {
        return h('p', null, [h('strong', { text: rotulo + ' ' }), h('span', { className: className || null, text: valor })]);
    }

    async function abrirDossieClinico(farmacoAlvo, farmacoConsulta) {
        if (!modalDossie || !dossieContent) return;
        returnFocus = document.activeElement;
        modalDossie.hidden = false;
        modalDossie.classList.add('open');
        if (closeDossie) closeDossie.focus();

        LaiftDom.clear(dossieContent);
        dossieContent.appendChild(h('p', { className: 'loading' }, [
            'Consultando bases biomédicas (RxNav / ChEBI / PubChem) para ', h('strong', { text: farmacoAlvo }), '...'
        ]));

        if (typeof QuizAPIEngine === 'undefined') {
            LaiftDom.clear(dossieContent);
            dossieContent.appendChild(h('p', { text: 'Serviço de consulta de APIs científicas não carregado.' }));
            return;
        }

        // As APIs são consultadas pelo termo em inglês (farmacoConsulta, do
        // léxico) quando existir, mas a ficha exibe sempre o nome em PT.
        var dossie = await QuizAPIEngine.gerarDossieFarmaco(farmacoConsulta || farmacoAlvo);
        LaiftDom.clear(dossieContent);
        dossieContent.appendChild(h('h3', { text: '📋 Ficha Farmacológica: ' + farmacoAlvo }));
        dossieContent.appendChild(linha('Classe Terapêutica (ATC):', dossie.classesATC, 'atc'));
        dossieContent.appendChild(linha('Identificador RxCUI:', dossie.rxcui, 'mono'));
        dossieContent.appendChild(linha('Nomenclatura IUPAC:', dossie.iupac, 'mono'));
        dossieContent.appendChild(linha('Fórmula / Massa:', dossie.formula + ' • ' + dossie.pesoMolecular + ' g/mol'));
        dossieContent.appendChild(h('p', null, [h('strong', { text: 'Papel Biológico (ChEBI):' }), h('br'), h('em', { text: dossie.definicao })]));
        dossieContent.appendChild(h('button', { type: 'button', className: 'control-btn secondary', text: 'Fechar Ficha', onClick: fecharDossie }));
    }

    if (closeDossie) closeDossie.addEventListener('click', fecharDossie);

    // Analogia didática + botão da ficha, depois da explicação padrão.
    function enriquecerExplicacao(question) {
        var analogia = document.getElementById('feedbackAnalogia');
        if (analogia) {
            LaiftDom.clear(analogia);
            if (question.analogiaDidatica) {
                analogia.appendChild(document.createTextNode('💡 '));
                analogia.appendChild(h('strong', { text: 'Analogia Didática:' }));
                analogia.appendChild(document.createTextNode(' ' + question.analogiaDidatica));
                analogia.hidden = false;
            } else {
                analogia.hidden = true;
            }
        }
        if (btnVerDossie) {
            var farmacoAlvo = question.farmacoAlvo || question.drug || null;
            var farmacoConsulta = question.farmacoConsulta || farmacoAlvo;
            btnVerDossie.hidden = !farmacoAlvo;
            btnVerDossie.onclick = farmacoAlvo ? function () { abrirDossieClinico(farmacoAlvo, farmacoConsulta); } : null;
        }
    }

    initSmilesDrawer();

    window.LaiftQuiz = LaiftQuizEngine.create({
        module: 'farmacologia',
        storageKey: 'pharmaQuizProgress',
        questions: obterQuestoesDisponiveis,
        labels: {
            noTopic: 'Por favor, selecione pelo menos um tópico no menu lateral!',
            noQuestions: 'Nenhuma questão encontrada para os tópicos selecionados.',
            emptyBank: 'Nenhuma questão foi carregada. Verifique se o arquivo questions.js ou quiz-database.js está na mesma pasta.',
            resetConfirm: 'Tem certeza que deseja apagar todo o seu progresso salvo?',
            resultsTitle: '🎯 RESULTADOS DO SIMULADO',
            topicsTitle: '📊 Desempenho por Tópico:',
            homeLabel: '🏠 Voltar aos Tópicos',
        },
        onQuestion: renderMolecularStructure,
        onExplanation: enriquecerExplicacao,
    });
})();
