/**
 * SIMULADOR DE TOXICOLOGIA CLÍNICA & FORENSE (LAIFT) — configuração do módulo
 *
 * O ciclo do simulado vive no motor único ../shared/quiz-engine.js
 * (compartilhado com a Farmacologia). Aqui ficam só:
 * - o banco (questions.js) e a chave de progresso 'toxicoQuizProgress' (a
 *   mesma de sempre — ninguém perde o que já respondeu);
 * - a consulta ao OpenFDA (bula oficial) para fármacos e antídotos, com
 *   timeout de 3 s e tolerância a falha.
 *
 * O texto do OpenFDA é dado externo: entra só por textContent (antes ia por
 * innerHTML, o que permitiria injetar marcação na origem da plataforma).
 * O resultado do simulado agora é registrado na plataforma pelo motor
 * (apiLearnSubmitQuizAttempt) — a toxicologia nunca enviava.
 */
(function () {
    'use strict';

    var OPENFDA_SEARCH_URL = 'https://api.fda.gov/drug/label.json';
    var OPENFDA_TIMEOUT_MS = 3000;
    var FDA_EXCERPT_CHARS = 320;

    // Mapeamento de termos para consulta oficial OpenFDA
    var DRUG_LOOKUP_MAP = {
        'paracetamol': 'acetaminophen',
        'acetaminofeno': 'acetaminophen',
        'naloxona': 'naloxone',
        'flumazenil': 'flumazenil',
        'atropina': 'atropine',
        'fomepizol': 'fomepizole',
        'digoxina': 'digoxin',
        'deferoxamina': 'deferoxamine',
        'dantroleno': 'dantrolene',
        'cocaína': 'cocaine',
        'morfina': 'morphine',
        'fentanil': 'fentanyl',
        'metanol': 'methanol',
        'amitriptilina': 'amitriptyline',
        'teofilina': 'theophylline',
        'lítio': 'lithium',
        'aspirina': 'aspirin',
        'salicilatos': 'aspirin',
        'fenitoína': 'phenytoin',
        'metformina': 'metformin',
        'isoniazida': 'isoniazid'
    };

    // Consulta de dados oficiais de bula OpenFDA com tolerância a falha
    async function fetchOpenFdaWarning(queryTerm) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, OPENFDA_TIMEOUT_MS);
        try {
            // URLSearchParams cuida da codificação (aspas, dois-pontos e espaços) —
            // o campo é uma frase exata entre aspas, então o termo nunca deve levar
            // aspas próprias.
            var params = new URLSearchParams({
                search: 'openfda.generic_name:"' + String(queryTerm).replace(/"/g, '') + '"',
                limit: '1'
            });
            var url = OPENFDA_SEARCH_URL + '?' + params.toString();
            var res = await fetch(url, { signal: controller.signal });
            // OpenFDA responde 404 com {error:{code:"NOT_FOUND"}} quando não há
            // resultado para a busca — trata como "sem dado", não como falha.
            if (!res.ok) return null;
            var data = await res.json();
            if (!data.results || !data.results.length) return null;
            var record = data.results[0];
            // boxed_warning/warnings/warnings_and_cautions/overdosage vêm sempre
            // como array de strings (uma por seção da bula, quando existe).
            var pick = function (field) { return Array.isArray(record[field]) && typeof record[field][0] === 'string' ? record[field][0] : null; };
            return pick('boxed_warning') || pick('overdosage') || pick('warnings') || pick('warnings_and_cautions') || null;
        } catch (e) {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    function extractDrugKey(question) {
        if (question.apiDrugQuery) return question.apiDrugQuery;
        var combined = (question.question + ' ' + question.options.join(' ')).toLowerCase();
        var keys = Object.keys(DRUG_LOOKUP_MAP);
        for (var i = 0; i < keys.length; i++) {
            if (combined.includes(keys[i])) return DRUG_LOOKUP_MAP[keys[i]];
        }
        return null;
    }

    function setSourceTag(text, source) {
        var tag = document.getElementById('apiDataSourceTag');
        if (!tag) return;
        if (!text) { tag.hidden = true; return; }
        tag.hidden = false;
        tag.textContent = text;
        tag.dataset.source = source || '';
    }

    /** Antepõe o alerta oficial do FDA à explicação (texto puro). */
    async function enriquecerComOpenFda(question, ui) {
        var drugKey = extractDrugKey(question);
        if (!drugKey) { setSourceTag(null); return; }
        setSourceTag('Consultando OpenFDA...', 'loading');

        var liveWarning = await fetchOpenFdaWarning(drugKey);
        if (!ui.isCurrent()) return; // a pessoa já está em outra questão

        if (liveWarning) {
            setSourceTag('OpenFDA Alerta Oficial', 'fda');
            var alerta = LaiftDom.h('span', { className: 'fda-alert' }, [
                LaiftDom.h('strong', { text: '[Alerta Toxicológico FDA]: ' }),
                liveWarning.substring(0, FDA_EXCERPT_CHARS) + '...'
            ]);
            ui.explanationText.insertBefore(alerta, ui.explanationText.firstChild);
        } else {
            setSourceTag('LAIFT Base Toxicológica', 'local');
        }
    }

    function desempenho(percentage) {
        if (percentage >= 90) return '🎉 Desempenho excelente! Domínio completo dos protocolos de intoxicação e antídotos.';
        if (percentage >= 70) return '👍 Muito bom! Raciocínio clínico toxicológico bem consolidado.';
        if (percentage >= 50) return '📚 Bom aproveitamento, mas recomenda-se revisar dosagens, antídotos e espécies peçonhentas.';
        return '🔁 Recomenda-se refazer os tópicos de toxicocinética, defensivos e condutas de urgência.';
    }

    window.LaiftQuiz = LaiftQuizEngine.create({
        module: 'toxicologia',
        storageKey: 'toxicoQuizProgress',
        questions: function () {
            if (typeof allQuestions === 'undefined' || !Array.isArray(allQuestions)) {
                console.error('Banco allQuestions de toxicologia não encontrado.');
                return [];
            }
            return allQuestions;
        },
        labels: {
            noTopic: 'Selecione ao menos um tópico para iniciar o simulado de toxicologia!',
            noQuestions: 'Nenhuma questão localizada para os tópicos selecionados.',
            emptyBank: 'Banco de questões de toxicologia não encontrado.',
            resetConfirm: 'Deseja apagar o progresso salvo de Toxicologia? Os registros locais serão zerados.',
            resultsTitle: '🎯 RESULTADOS DE TOXICOLOGIA',
            topicsTitle: '📊 Desempenho por Tópico Especializado:',
            homeLabel: '🏠 Selecionar Novos Tópicos',
            performance: desempenho,
        },
        onQuestion: function () { setSourceTag(null); },
        onExplanation: enriquecerComOpenFda,
    });
})();
