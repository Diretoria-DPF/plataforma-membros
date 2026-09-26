/**
 * SIMULADOR DE FARMACOLOGIA LAIFT — MOTOR PRINCIPAL (VERSÃO RESILIENTE)
 */

// 1. Definição Segura do Gateway (Evita SyntaxError de redeclaração)
var APPS_SCRIPT_GATEWAY = window.APPS_SCRIPT_GATEWAY || 'https://script.google.com/macros/s/AKfycbyXvBYrHBIXNjHYItuq2LXKt1vkmh2m_CME-5aZqkxUJhl7ktJjemuasbvdEweH95k/exec';

// 2. Estado Global da Aplicação
let selectedTopics = new Set();
let currentMode = "study"; 
let filteredQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let score = 0;
let timeLeft = 0; 
let timerInterval = null;
let quizActive = false;
let quizCompleted = false;
let quizStartTime = null;
let smilesDrawerInstance = null;
let bancoQuestoesUnificado = [];

// 3. Captura dos Elementos do DOM
const topicsGrid = document.getElementById('topicsGrid');
const startQuizBtn = document.getElementById('startQuiz');
const selectAllBtn = document.getElementById('selectAll');
const deselectAllBtn = document.getElementById('deselectAll');
const continueBtn = document.getElementById('continueBtn');
const resetProgressBtn = document.getElementById('resetProgressBtn');
const modeButtons = document.querySelectorAll('.mode-btn');
const startScreen = document.getElementById('startScreen');
const quizContainer = document.getElementById('quizContainer');
const resultsContainer = document.getElementById('resultsContainer');
const currentTopicElement = document.getElementById('currentTopic');
const timerElement = document.getElementById('timer');
const currentQuestionElement = document.getElementById('currentQuestion');
const totalQuestionsElement = document.getElementById('totalQuestions');
const progressBar = document.getElementById('progress');
const questionText = document.getElementById('questionText');
const optionsContainer = document.getElementById('optionsContainer');
const explanation = document.getElementById('explanation');
const explanationText = document.getElementById('explanationText');
const feedbackAnalogia = document.getElementById('feedbackAnalogia');
const btnVerDossie = document.getElementById('btnVerDossie');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const finishBtn = document.getElementById('finishBtn');
const totalTopicsElement = document.getElementById('totalTopics');
const selectedTopicsElement = document.getElementById('selectedTopics');
const totalQsElement = document.getElementById('totalQs');
const answeredStatElement = document.getElementById('answeredStat');
const correctStatElement = document.getElementById('correctStat');
const progressStatElement = document.getElementById('progressStat');
const totalQuestionsStatElement = document.getElementById('totalQuestionsStat');

const infoBtn = document.getElementById('infoBtn');
const instructionsModal = document.getElementById('instructionsModal');
const closeModal = document.getElementById('closeModal');

// 4. Normalizador de Banco de Dados (Suporta questions.js e quiz-database.js)
function obterQuestoesDisponiveis() {
    if (typeof allQuestions !== 'undefined' && Array.isArray(allQuestions) && allQuestions.length > 0) {
        return allQuestions;
    }
    
    if (typeof QUIZ_FARMACOLOGIA_DB !== 'undefined' && Array.isArray(QUIZ_FARMACOLOGIA_DB) && QUIZ_FARMACOLOGIA_DB.length > 0) {
        return QUIZ_FARMACOLOGIA_DB.map((q, idx) => ({
            id: q.id || idx + 1,
            topic: q.modulo || q.topic || "Farmacologia Clínica",
            farmacoAlvo: q.farmacoAlvo || null,
            smiles: q.smiles || null,
            pubchemCid: q.pubchemCid || null,
            question: q.enunciado || q.question,
            options: Array.isArray(q.options) ? q.options : (q.alternativas ? q.alternativas.map(a => a.texto) : []),
            correct: typeof q.correct === 'number' ? q.correct : (q.alternativas ? q.alternativas.findIndex(a => a.correta) : 0),
            explanation: q.explanation || (q.alternativas && q.alternativas.find(a => a.correta) ? q.alternativas.find(a => a.correta).feedback : ""),
            analogiaDidatica: q.analogiaDidatica || ""
        }));
    }
    
    return [];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function initSmilesDrawer() {
    if (typeof SmilesDrawer !== 'undefined' && !smilesDrawerInstance) {
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
}

// 5. Inicialização da Interface
function initializeApp() {
    bancoQuestoesUnificado = obterQuestoesDisponiveis();
    
    // Força a visibilidade da tela inicial
    if (startScreen) startScreen.style.display = 'block';
    if (quizContainer) quizContainer.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'none';

    if (bancoQuestoesUnificado.length === 0) {
        if (topicsGrid) {
            topicsGrid.innerHTML = '<p style="color: #ef4444; font-size: 0.85rem; padding: 10px;">⚠ Nenhuma questão foi carregada. Verifique se o arquivo questions.js ou quiz-database.js está na mesma pasta.</p>';
        }
        return;
    }

    initSmilesDrawer();

    const topics = [...new Set(bancoQuestoesUnificado.map(q => q.topic).filter(Boolean))];
    
    if (totalTopicsElement) totalTopicsElement.textContent = topics.length;
    if (totalQsElement) totalQsElement.textContent = bancoQuestoesUnificado.length;
    if (totalQuestionsStatElement) totalQuestionsStatElement.textContent = bancoQuestoesUnificado.length;
    
    if (topicsGrid) {
        topicsGrid.innerHTML = '';
        topics.forEach(topic => {
            const count = bancoQuestoesUnificado.filter(q => q.topic === topic).length;
            const button = document.createElement('button');
            button.className = 'topic-btn';
            button.innerHTML = `<span>${topic}</span><span class="topic-count">${count}</span>`;
            button.dataset.topic = topic;
            button.addEventListener('click', () => toggleTopic(topic));
            topicsGrid.appendChild(button);
        });
    }
    
    const savedProgress = localStorage.getItem('pharmaQuizProgress');
    if (savedProgress && continueBtn) {
        try {
            const progress = JSON.parse(savedProgress);
            if (progress.userAnswers && progress.userAnswers.length > 0) {
                continueBtn.style.display = 'block';
            }
        } catch (e) {}
    }
    
    updateStats();
    updateDynamicButtons(); 
}

function updateDynamicButtons() {
    const totalAvailableTopics = document.querySelectorAll('.topic-btn').length;
    
    if (deselectAllBtn) {
        if (selectedTopics.size > 0) {
            deselectAllBtn.classList.remove('secondary');
            deselectAllBtn.classList.add('active-clear');
        } else {
            deselectAllBtn.classList.add('secondary');
            deselectAllBtn.classList.remove('active-clear');
        }
    }

    if (selectAllBtn) {
        if (selectedTopics.size < totalAvailableTopics && totalAvailableTopics > 0) {
            selectAllBtn.classList.remove('secondary');
            selectAllBtn.classList.add('active-select');
        } else {
            selectAllBtn.classList.add('secondary');
            selectAllBtn.classList.remove('active-select');
        }
    }
}

function toggleTopic(topic) {
    if (selectedTopics.has(topic)) {
        selectedTopics.delete(topic);
    } else {
        selectedTopics.add(topic);
    }
    updateTopicButtons();
    updateStats();
    updateDynamicButtons(); 
}

function updateTopicButtons() {
    document.querySelectorAll('.topic-btn').forEach(btn => {
        const topic = btn.dataset.topic;
        if (selectedTopics.has(topic)) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    if (selectedTopicsElement) selectedTopicsElement.textContent = selectedTopics.size;
}

function selectAllTopics() {
    const topics = [...new Set(bancoQuestoesUnificado.map(q => q.topic).filter(Boolean))];
    selectedTopics = new Set(topics);
    updateTopicButtons();
    updateStats();
    updateDynamicButtons(); 
}

function deselectAllTopics() {
    selectedTopics.clear();
    updateTopicButtons();
    updateStats();
    updateDynamicButtons(); 
}

function setMode(mode) {
    currentMode = mode;
    modeButtons.forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
            if (mode === 'exam') btn.classList.add('warning');
            else btn.classList.remove('warning');
        } else {
            btn.classList.remove('active', 'warning');
        }
    });
}

function updateStats() {
    let answered = 0;
    let correct = 0;
    const savedProgress = localStorage.getItem('pharmaQuizProgress');
    if (savedProgress) {
        try {
            const progress = JSON.parse(savedProgress);
            if (progress.userAnswers) {
                answered = progress.userAnswers.filter(a => a !== null).length;
                correct = progress.userAnswers.reduce((acc, answer, index) => {
                    if (answer !== null && bancoQuestoesUnificado[index] && answer === bancoQuestoesUnificado[index].correct) {
                        return acc + 1;
                    }
                    return acc;
                }, 0);
            }
        } catch (e) {}
    }
    
    if (answeredStatElement) answeredStatElement.textContent = answered;
    if (correctStatElement) correctStatElement.textContent = correct;
    const progressPercentage = bancoQuestoesUnificado.length > 0 ? Math.round((answered / bancoQuestoesUnificado.length) * 100) : 0;
    if (progressStatElement) progressStatElement.textContent = `${progressPercentage}%`;

    if (resetProgressBtn) {
        resetProgressBtn.style.display = answered > 0 ? 'block' : 'none';
    }
}

function resetProgress() {
    if (confirm("Tem certeza que deseja apagar todo o seu progresso salvo?")) {
        localStorage.removeItem('pharmaQuizProgress');
        userAnswers = [];
        if (continueBtn) continueBtn.style.display = 'none';
        if (resetProgressBtn) resetProgressBtn.style.display = 'none';
        
        quizActive = false;
        clearInterval(timerInterval);
        if (quizContainer) quizContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (startScreen) startScreen.style.display = 'block';
        updateStats();
    }
}

function startQuiz() {
    if (selectedTopics.size === 0) { 
        alert('Por favor, selecione pelo menos um tópico no menu lateral!'); 
        return; 
    }
    
    filteredQuestions = [...bancoQuestoesUnificado.filter(q => selectedTopics.has(q.topic))];
    
    if (filteredQuestions.length === 0) { 
        alert('Nenhuma questão encontrada para os tópicos selecionados.'); 
        return; 
    }
    
    if (currentMode === 'exam') {
        shuffleArray(filteredQuestions);
    }

    userAnswers = new Array(filteredQuestions.length).fill(null);
    quizStartTime = Date.now();
    
    if (startScreen) startScreen.style.display = 'none';
    if (quizContainer) quizContainer.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';
    
    clearInterval(timerInterval); 
    
    if (currentMode === 'exam') {
        timeLeft = filteredQuestions.length * 90; 
        startTimer();
    } else {
        if (timerElement) {
            timerElement.textContent = 'Modo Estudo';
            timerElement.style.animation = 'none';
        }
    }
    
    quizActive = true;
    currentQuestionIndex = 0;
    loadQuestion();
}

function continueQuiz() {
    filteredQuestions = [...bancoQuestoesUnificado];
    userAnswers = new Array(filteredQuestions.length).fill(null);
    quizStartTime = Date.now();
    
    const savedProgress = localStorage.getItem('pharmaQuizProgress');
    if (savedProgress) {
        try {
            const progress = JSON.parse(savedProgress);
            userAnswers = [...progress.userAnswers];
            currentQuestionIndex = userAnswers.findIndex(answer => answer === null);
            if (currentQuestionIndex === -1) currentQuestionIndex = 0;
        } catch (e) { 
            currentQuestionIndex = 0; 
        }
    }
    
    if (startScreen) startScreen.style.display = 'none';
    if (quizContainer) quizContainer.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';
    
    currentMode = 'study';
    setMode('study');
    
    clearInterval(timerInterval);
    if (timerElement) {
        timerElement.textContent = 'Modo Estudo';
        timerElement.style.animation = 'none';
    }
    
    quizActive = true;
    loadQuestion();
}

async function renderMolecularStructure(question) {
    const canvas = document.getElementById('quizMolCanvas');
    const label = document.getElementById('quizMolLabel');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    const farmacoAlvo = question.farmacoAlvo || question.drug || null;
    let smiles = question.smiles || null;

    if (label) label.textContent = farmacoAlvo || (smiles ? 'Estrutura Química' : '--');

    if (!smiles && farmacoAlvo && typeof QuizAPIEngine !== 'undefined') {
        if (label) label.textContent = `${farmacoAlvo} (Buscando...)`;
        const info = await QuizAPIEngine.buscarEstruturaMolecular(farmacoAlvo);
        if (info && info.smiles) {
            smiles = info.smiles;
            if (label) label.textContent = `${farmacoAlvo} ${info.cid ? `(CID: ${info.cid})` : ''}`;
        }
    }

    if (smiles && typeof SmilesDrawer !== 'undefined') {
        initSmilesDrawer();
        SmilesDrawer.parse(smiles, (tree) => {
            if (smilesDrawerInstance) smilesDrawerInstance.draw(tree, canvas, 'dark', false);
        }, (err) => {
            console.warn('[SmilesDrawer] Erro ao renderizar SMILES:', err);
        });
    }
}

function loadQuestion() {
    if (!quizActive || currentQuestionIndex >= filteredQuestions.length) return;
    
    const question = filteredQuestions[currentQuestionIndex];
    if (currentTopicElement) currentTopicElement.textContent = question.topic;
    if (currentQuestionElement) currentQuestionElement.textContent = currentQuestionIndex + 1;
    if (totalQuestionsElement) totalQuestionsElement.textContent = filteredQuestions.length;
    if (questionText) questionText.textContent = question.question;
    
    const progress = ((currentQuestionIndex + 1) / filteredQuestions.length) * 100;
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (optionsContainer) optionsContainer.innerHTML = '';
    
    renderMolecularStructure(question);

    question.options.forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option';
        optionElement.tabIndex = 0;
        
        if (userAnswers[currentQuestionIndex] === index) optionElement.classList.add('selected');
        
        const optionLetter = document.createElement('div');
        optionLetter.className = 'option-letter';
        optionLetter.textContent = String.fromCharCode(65 + index);
        
        const optionText = document.createElement('div');
        optionText.textContent = option;
        
        optionElement.appendChild(optionLetter);
        optionElement.appendChild(optionText);
        
        optionElement.addEventListener('click', () => selectOption(index));
        optionElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectOption(index);
            }
        });
        
        if (optionsContainer) optionsContainer.appendChild(optionElement);
    });
    
    if (prevBtn) prevBtn.disabled = currentQuestionIndex === 0;
    if (currentQuestionIndex === filteredQuestions.length - 1) {
        if (nextBtn) nextBtn.style.display = 'none';
        if (finishBtn) finishBtn.style.display = 'block';
    } else {
        if (nextBtn) nextBtn.style.display = 'block';
        if (finishBtn) finishBtn.style.display = 'none';
    }
    
    if (explanation) {
        explanation.style.display = 'none';
        explanation.classList.remove('show');
    }
    
    if (userAnswers[currentQuestionIndex] !== null && currentMode === 'study') {
        showExplanation();
    }
}

function selectOption(optionIndex) {
    userAnswers[currentQuestionIndex] = optionIndex;
    saveProgress();
    updateStats();
    loadQuestion();
    if (currentMode === 'study') showExplanation();
}

function showExplanation() {
    const question = filteredQuestions[currentQuestionIndex];
    const userAnswer = userAnswers[currentQuestionIndex];
    const options = document.querySelectorAll('.option');
    
    options.forEach((option, index) => {
        option.classList.remove('correct', 'incorrect');
        if (index === question.correct) option.classList.add('correct');
        else if (index === userAnswer && userAnswer !== question.correct) option.classList.add('incorrect');
    });
    
    if (explanationText) explanationText.textContent = question.explanation;

    if (feedbackAnalogia) {
        if (question.analogiaDidatica) {
            feedbackAnalogia.innerHTML = `💡 <strong>Analogia Didática:</strong> ${question.analogiaDidatica}`;
            feedbackAnalogia.style.display = 'block';
        } else {
            feedbackAnalogia.style.display = 'none';
        }
    }

    if (btnVerDossie) {
        const farmacoAlvo = question.farmacoAlvo || question.drug || null;
        if (farmacoAlvo) {
            btnVerDossie.style.display = 'inline-block';
            btnVerDossie.onclick = () => abrirDossieClinico(farmacoAlvo);
        } else {
            btnVerDossie.style.display = 'none';
        }
    }

    if (explanation) {
        explanation.style.display = 'block';
        explanation.classList.add('show');
    }
}

async function abrirDossieClinico(farmacoAlvo) {
    const modal = document.getElementById('modalDossieQuiz');
    const content = document.getElementById('dossieContent');
    if (!modal || !content) return;

    modal.style.display = 'flex';
    content.innerHTML = `<p style="color: #94a3b8;">Consultando bases biomédicas (RxNav / ChEBI / PubChem) para <strong>${farmacoAlvo}</strong>...</p>`;

    if (typeof QuizAPIEngine !== 'undefined') {
        const dossie = await QuizAPIEngine.gerarDossieFarmaco(farmacoAlvo);
        content.innerHTML = `
            <h3 style="color: #38bdf8; margin-top: 0;">📋 Ficha Farmacológica: ${dossie.farmaco}</h3>
            <div style="font-size: 0.85rem; line-height: 1.5; color: #cbd5e1; text-align: left;">
                <p><strong>Classe Terapêutica (ATC):</strong> <span style="color: #4ade80;">${dossie.classesATC}</span></p>
                <p><strong>Identificador RxCUI:</strong> <code>${dossie.rxcui}</code></p>
                <p><strong>Nomenclatura IUPAC:</strong> <span style="font-family: monospace; color: #94a3b8;">${dossie.iupac}</span></p>
                <p><strong>Fórmula / Massa:</strong> ${dossie.formula} • ${dossie.pesoMolecular} g/mol</p>
                <p><strong>Papel Biológico (ChEBI):</strong><br><em>${dossie.definicao}</em></p>
            </div>
            <button class="control-btn secondary" style="margin-top: 14px; width: 100%;" onclick="document.getElementById('modalDossieQuiz').style.display='none'">Fechar Ficha</button>
        `;
    } else {
        content.innerHTML = `
            <p>Serviço de consulta de APIs científicas não carregado.</p>
            <button class="control-btn secondary" style="margin-top: 10px;" onclick="document.getElementById('modalDossieQuiz').style.display='none'">Fechar</button>
        `;
    }
}

function nextQuestion() {
    if (currentQuestionIndex < filteredQuestions.length - 1) {
        currentQuestionIndex++;
        loadQuestion();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        loadQuestion();
    }
}

async function persistirMetricasQuiz(scoreTotal, totalQuestoes, tempoGasto) {
    let alunoIdentificador = "Visitante";
    let alunoNome = "Aluno Virtual";
    try {
        const sessao = JSON.parse(localStorage.getItem('laift_student_session') || '{}');
        if (sessao.identifier) alunoIdentificador = sessao.identifier;
        if (sessao.name) alunoNome = sessao.name;
    } catch (e) {}

    const topicosArray = Array.from(selectedTopics);
    const modulo = topicosArray.length > 0 ? topicosArray.slice(0, 3).join(', ') : "Farmacologia";

    const payload = {
        acao: "registrarMetricasQuiz",
        identificador: alunoIdentificador,
        nome: alunoNome,
        modulo: modulo,
        modo: currentMode === 'exam' ? "Modo Prova" : "Modo Estudo",
        acertos: scoreTotal,
        total: totalQuestoes,
        aproveitamento: totalQuestoes > 0 ? Math.round((scoreTotal / totalQuestoes) * 100) : 0,
        tempoGasto: tempoGasto,
        topicos: topicosArray.join(', ') || "Geral"
    };

    try {
        await fetch(APPS_SCRIPT_GATEWAY, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.warn("[Quiz Engine] Falha na persistência das métricas:", err);
    }
}

function finishQuiz() {
    quizActive = false;
    quizCompleted = true;
    clearInterval(timerInterval);
    
    score = 0;
    const topicScores = {};
    const topicCounts = {};
    
    filteredQuestions.forEach((question, index) => {
        const topic = question.topic;
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        
        if (userAnswers[index] === question.correct) {
            score++;
            topicScores[topic] = (topicScores[topic] || 0) + 1;
        } else {
            topicScores[topic] = topicScores[topic] || 0;
        }
    });
    
    const tempoGasto = quizStartTime ? Math.max(1, Math.round((Date.now() - quizStartTime) / 1000)) : 0;
    persistirMetricasQuiz(score, filteredQuestions.length, tempoGasto);
    showResults(score, topicScores, topicCounts);
}

function showResults(score, topicScores, topicCounts) {
    if (quizContainer) quizContainer.style.display = 'none';
    if (resultsContainer) {
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = '';
        
        const percentage = (score / filteredQuestions.length) * 100;
        
        const header = document.createElement('h2');
        header.textContent = '🎯 RESULTADOS DO SIMULADO';
        resultsContainer.appendChild(header);
        
        const scoreDisplay = document.createElement('div');
        scoreDisplay.className = 'score-display';
        scoreDisplay.textContent = `${score}/${filteredQuestions.length}`;
        resultsContainer.appendChild(scoreDisplay);
        
        const scoreText = document.createElement('div');
        scoreText.className = 'score-text';
        scoreText.textContent = `${percentage.toFixed(1)}% de aproveitamento.`;
        resultsContainer.appendChild(scoreText);
        
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        actionButtons.style.marginTop = '20px';

        const restartBtn = document.createElement('button');
        restartBtn.className = 'home-btn';
        restartBtn.textContent = '🏠 Voltar aos Tópicos';
        restartBtn.addEventListener('click', () => {
            localStorage.removeItem('pharmaQuizProgress');
            userAnswers = [];
            if (resultsContainer) resultsContainer.style.display = 'none';
            if (startScreen) startScreen.style.display = 'block';
            selectedTopics.clear();
            updateTopicButtons();
            updateStats();
            updateDynamicButtons();
        });

        actionButtons.appendChild(restartBtn);
        resultsContainer.appendChild(actionButtons);
    }
}

function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (quizActive) finishQuiz();
        }
    }, 1000); 
}

function updateTimerDisplay() {
    if (!timerElement) return;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    if (timeLeft < 300) timerElement.style.animation = 'pulse 1s infinite';
    else timerElement.style.animation = 'none';
}

function saveProgress() {
    if (currentMode === 'exam') return;

    const allUserAnswers = new Array(bancoQuestoesUnificado.length).fill(null);
    filteredQuestions.forEach((q, filteredIndex) => {
        const originalIndex = bancoQuestoesUnificado.findIndex(item => item.id === q.id);
        if (originalIndex !== -1) {
            allUserAnswers[originalIndex] = userAnswers[filteredIndex];
        }
    });
    
    const progress = {
        userAnswers: allUserAnswers,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('pharmaQuizProgress', JSON.stringify(progress));
}

// 6. Vinculação de Eventos
if (infoBtn) infoBtn.addEventListener('click', () => { if (instructionsModal) instructionsModal.style.display = 'flex'; });
if (closeModal) closeModal.addEventListener('click', () => { if (instructionsModal) instructionsModal.style.display = 'none'; });
window.addEventListener('click', (e) => {
    if (e.target === instructionsModal) instructionsModal.style.display = 'none';
    const modalDossie = document.getElementById('modalDossieQuiz');
    if (e.target === modalDossie) modalDossie.style.display = 'none';
});

if (startQuizBtn) startQuizBtn.addEventListener('click', startQuiz);
if (continueBtn) continueBtn.addEventListener('click', continueQuiz);
if (resetProgressBtn) resetProgressBtn.addEventListener('click', resetProgress);
if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllTopics);
if (deselectAllBtn) deselectAllBtn.addEventListener('click', deselectAllTopics);
if (prevBtn) prevBtn.addEventListener('click', prevQuestion);
if (nextBtn) nextBtn.addEventListener('click', nextQuestion);
if (finishBtn) finishBtn.addEventListener('click', finishQuiz);

modeButtons.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

document.addEventListener('keydown', (e) => {
    if (!quizActive) return;
    if (document.activeElement.classList.contains('option') && (e.key === 'Enter' || e.key === ' ')) return;
    
    switch(e.key) {
        case 'ArrowLeft': if (prevBtn && !prevBtn.disabled) prevQuestion(); break;
        case 'ArrowRight': if (nextBtn && !nextBtn.disabled && nextBtn.style.display !== 'none') nextQuestion(); break;
        case '1': case '2': case '3': case '4':
            const optionIndex = parseInt(e.key) - 1;
            if (optionIndex >= 0 && optionIndex < 4) selectOption(optionIndex);
            break;
    }
});

// Inicialização imediata assim que o HTML estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
