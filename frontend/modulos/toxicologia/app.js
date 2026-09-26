/**
 * MOTOR DO SIMULADOR DE TOXICOLOGIA CLÍNICA & FORENSE (LAIFT)
 * - Armazenamento isolado sob chave dedicada: 'toxicoQuizProgress'
 * - Consulta live ao OpenFDA para fármacos e antídotos com timeout seguro de 3s
 * - Suporte a 10 tópicos de toxicologia e 240 questões
 */

const STORAGE_PROGRESS_KEY = 'toxicoQuizProgress';
const OPENFDA_SEARCH_URL = 'https://api.fda.gov/drug/label.json';

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

// Mapeamento de termos para consulta oficial OpenFDA
const DRUG_LOOKUP_MAP = {
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

// Elementos do DOM
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
const apiDataSourceTag = document.getElementById('apiDataSourceTag');
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

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Consulta de dados oficiais de bula OpenFDA com tolerância a falha
async function fetchOpenFdaWarning(queryTerm) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    try {
        const url = `${OPENFDA_SEARCH_URL}?search=openfda.generic_name:"${encodeURIComponent(queryTerm)}"&limit=1`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;

        const data = await res.json();
        if (!data.results || !data.results.length) return null;

        const record = data.results[0];
        const boxed = record.boxed_warning?.[0];
        const warnings = record.warnings?.[0];
        const overdosage = record.overdosage?.[0];

        return boxed || overdosage || warnings || null;
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function extractDrugKey(question) {
    if (question.apiDrugQuery) return question.apiDrugQuery;
    const combined = `${question.question} ${question.options.join(' ')}`.toLowerCase();
    for (const [key, val] of Object.entries(DRUG_LOOKUP_MAP)) {
        if (combined.includes(key)) return val;
    }
    return null;
}

function initializeApp() {
    if (typeof allQuestions === 'undefined' || !Array.isArray(allQuestions)) {
        console.error('Banco allQuestions de toxicologia não encontrado.');
        return;
    }

    const topics = [...new Set(allQuestions.map(q => q.topic))];
    totalTopicsElement.textContent = topics.length;
    totalQsElement.textContent = allQuestions.length;
    totalQuestionsStatElement.textContent = allQuestions.length;
    
    topicsGrid.innerHTML = '';
    topics.forEach(topic => {
        const count = allQuestions.filter(q => q.topic === topic).length;
        const button = document.createElement('button');
        button.className = 'topic-btn';
        button.innerHTML = `<span>${topic}</span><span class="topic-count">${count}</span>`;
        button.dataset.topic = topic;
        button.addEventListener('click', () => toggleTopic(topic));
        topicsGrid.appendChild(button);
    });
    
    const savedProgress = localStorage.getItem(STORAGE_PROGRESS_KEY);
    if (savedProgress) {
        try {
            const progress = JSON.parse(savedProgress);
            if (progress.userAnswers && progress.userAnswers.length > 0) {
                continueBtn.style.display = 'block';
            }
        } catch (e) {
            console.error('Erro ao ler progresso:', e);
        }
    }
    updateStats();
    updateDynamicButtons(); 
}

function updateDynamicButtons() {
    const totalAvailableTopics = document.querySelectorAll('.topic-btn').length;
    
    if (selectedTopics.size > 0) {
        deselectAllBtn.classList.remove('secondary');
        deselectAllBtn.classList.add('active-clear');
    } else {
        deselectAllBtn.classList.add('secondary');
        deselectAllBtn.classList.remove('active-clear');
    }

    if (selectedTopics.size < totalAvailableTopics && totalAvailableTopics > 0) {
        selectAllBtn.classList.remove('secondary');
        selectAllBtn.classList.add('active-select');
    } else {
        selectAllBtn.classList.add('secondary');
        selectAllBtn.classList.remove('active-select');
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
    selectedTopicsElement.textContent = selectedTopics.size;
}

function selectAllTopics() {
    const topics = [...new Set(allQuestions.map(q => q.topic))];
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
    const savedProgress = localStorage.getItem(STORAGE_PROGRESS_KEY);
    if (savedProgress) {
        try {
            const progress = JSON.parse(savedProgress);
            if (progress.userAnswers) {
                answered = progress.userAnswers.filter(a => a !== null).length;
                correct = progress.userAnswers.reduce((acc, answer, index) => {
                    if (answer !== null && allQuestions[index] && answer === allQuestions[index].correct) {
                        return acc + 1;
                    }
                    return acc;
                }, 0);
            }
        } catch (e) {}
    }
    
    answeredStatElement.textContent = answered;
    correctStatElement.textContent = correct;
    const progressPercentage = allQuestions.length > 0 ? Math.round((answered / allQuestions.length) * 100) : 0;
    progressStatElement.textContent = `${progressPercentage}%`;

    if (answered > 0) {
        resetProgressBtn.style.display = 'block';
    } else {
        resetProgressBtn.style.display = 'none';
    }
}

function resetProgress() {
    if (confirm("Deseja apagar o progresso salvo de Toxicologia? Os registros locais serão zerados.")) {
        localStorage.removeItem(STORAGE_PROGRESS_KEY);
        userAnswers = [];
        continueBtn.style.display = 'none';
        resetProgressBtn.style.display = 'none';
        
        if (quizActive || quizContainer.style.display === 'flex') {
            quizActive = false;
            clearInterval(timerInterval);
            quizContainer.style.display = 'none';
            resultsContainer.style.display = 'none';
            startScreen.style.display = 'flex';
        }
        updateStats();
    }
}

function startQuiz() {
    if (selectedTopics.size === 0) { 
        alert('Selecione ao menos um tópico para iniciar o simulado de toxicologia!'); 
        return; 
    }
    
    filteredQuestions = [...allQuestions.filter(q => selectedTopics.has(q.topic))];
    if (filteredQuestions.length === 0) { 
        alert('Nenhuma questão localizada para os tópicos selecionados.'); 
        return; 
    }
    
    if (currentMode === 'exam') {
        shuffleArray(filteredQuestions);
    }

    userAnswers = new Array(filteredQuestions.length).fill(null);
    
    const savedProgress = localStorage.getItem(STORAGE_PROGRESS_KEY);
    if (savedProgress && currentMode === 'study') {
        try {
            const progress = JSON.parse(savedProgress);
            filteredQuestions.forEach((q, index) => {
                const originalIndex = allQuestions.findIndex(item => item.id === q.id);
                if (originalIndex !== -1 && progress.userAnswers[originalIndex] !== null) {
                    userAnswers[index] = progress.userAnswers[originalIndex];
                }
            });
        } catch (e) {}
    }
    
    startScreen.style.display = 'none';
    quizContainer.style.display = 'flex';
    resultsContainer.style.display = 'none';
    
    clearInterval(timerInterval); 
    
    if (currentMode === 'exam') {
        timeLeft = filteredQuestions.length * 90; 
        startTimer();
    } else {
        timerElement.textContent = 'Modo Estudo';
        timerElement.style.animation = 'none';
    }
    
    quizActive = true;
    currentQuestionIndex = 0;
    loadQuestion();
}

function continueQuiz() {
    filteredQuestions = [...allQuestions];
    userAnswers = new Array(filteredQuestions.length).fill(null);
    
    const savedProgress = localStorage.getItem(STORAGE_PROGRESS_KEY);
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
    
    startScreen.style.display = 'none';
    quizContainer.style.display = 'flex';
    resultsContainer.style.display = 'none';
    
    currentMode = 'study';
    setMode('study');
    
    clearInterval(timerInterval);
    timerElement.textContent = 'Modo Estudo';
    timerElement.style.animation = 'none';
    
    quizActive = true;
    loadQuestion();
}

async function loadQuestion() {
    if (!quizActive || currentQuestionIndex >= filteredQuestions.length) return;
    
    const question = filteredQuestions[currentQuestionIndex];
    currentTopicElement.textContent = question.topic;
    currentQuestionElement.textContent = currentQuestionIndex + 1;
    totalQuestionsElement.textContent = filteredQuestions.length;
    questionText.textContent = question.question;
    
    const progress = ((currentQuestionIndex + 1) / filteredQuestions.length) * 100;
    progressBar.style.width = `${progress}%`;
    optionsContainer.innerHTML = '';
    
    question.options.forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option';
        optionElement.tabIndex = 0;
        
        if (userAnswers[currentQuestionIndex] === index) optionElement.classList.add('selected');
        
        const optionLetter = document.createElement('div');
        optionLetter.className = 'option-letter';
        optionLetter.textContent = String.fromCharCode(65 + index);
        
        const optionTextEl = document.createElement('div');
        optionTextEl.className = 'option-text';
        optionTextEl.textContent = option;
        
        optionElement.appendChild(optionLetter);
        optionElement.appendChild(optionTextEl);
        
        optionElement.addEventListener('click', () => selectOption(index));
        optionElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectOption(index);
            }
        });
        
        optionsContainer.appendChild(optionElement);
    });
    
    prevBtn.disabled = currentQuestionIndex === 0;
    if (currentQuestionIndex === filteredQuestions.length - 1) {
        nextBtn.style.display = 'none';
        finishBtn.style.display = 'block';
    } else {
        nextBtn.style.display = 'block';
        finishBtn.style.display = 'none';
    }
    
    explanation.classList.remove('show');
    if (userAnswers[currentQuestionIndex] !== null && currentMode === 'study') {
        await showExplanation();
    }
}

async function selectOption(optionIndex) {
    userAnswers[currentQuestionIndex] = optionIndex;
    saveProgress();
    updateStats();
    await loadQuestion();
    if (currentMode === 'study') await showExplanation();
}

async function showExplanation() {
    const question = filteredQuestions[currentQuestionIndex];
    const userAnswer = userAnswers[currentQuestionIndex];
    const options = document.querySelectorAll('.option');
    
    options.forEach((option, index) => {
        option.classList.remove('correct', 'incorrect');
        if (index === question.correct) option.classList.add('correct');
        else if (index === userAnswer && userAnswer !== question.correct) option.classList.add('incorrect');
    });
    
    let baseText = question.explanation;
    const drugKey = extractDrugKey(question);

    if (drugKey) {
        if (apiDataSourceTag) {
            apiDataSourceTag.classList.remove('hidden');
            apiDataSourceTag.textContent = 'Consultando OpenFDA...';
        }

        const liveWarning = await fetchOpenFdaWarning(drugKey);
        if (liveWarning && apiDataSourceTag) {
            apiDataSourceTag.textContent = 'OpenFDA Alerta Oficial';
            apiDataSourceTag.style.background = 'var(--accent)';
            baseText = `<strong>[Alerta Toxicológico FDA]:</strong> ${liveWarning.substring(0, 320)}...<br><br>${baseText}`;
        } else if (apiDataSourceTag) {
            apiDataSourceTag.textContent = 'LAIFT Base Toxicológica';
            apiDataSourceTag.style.background = 'var(--secondary)';
        }
    } else if (apiDataSourceTag) {
        apiDataSourceTag.classList.add('hidden');
    }

    explanationText.innerHTML = baseText;
    explanation.classList.add('show');
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
    
    showResults(score, topicScores, topicCounts);
}

function showResults(scoreValue, topicScores, topicCounts) {
    quizContainer.style.display = 'none';
    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '';
    
    const percentage = (scoreValue / filteredQuestions.length) * 100;
    
    const header = document.createElement('h2');
    header.textContent = '🎯 RESULTADOS DE TOXICOLOGIA';
    resultsContainer.appendChild(header);
    
    const scoreDisplay = document.createElement('div');
    scoreDisplay.className = 'score-display';
    scoreDisplay.textContent = `${scoreValue}/${filteredQuestions.length}`;
    resultsContainer.appendChild(scoreDisplay);
    
    const scoreText = document.createElement('div');
    scoreText.className = 'score-text';
    
    let performanceText = '';
    if (percentage >= 90) performanceText = '🎉 Desempenho excelente! Domínio completo dos protocolos de intoxicação e antídotos.';
    else if (percentage >= 70) performanceText = '👍 Muito bom! Raciocínio clínico toxicológico bem consolidado.';
    else if (percentage >= 50) performanceText = '📚 Bom aproveitamento, mas recomenda-se revisar dosagens, antídotos e espécies peçonhentas.';
    else performanceText = '🔁 Recomenda-se refazer os tópicos de toxicocinética, defensivos e condutas de urgência.';
    
    scoreText.textContent = `${percentage.toFixed(1)}% de acertos. ${performanceText}`;
    resultsContainer.appendChild(scoreText);
    
    const topicsTitle = document.createElement('h3');
    topicsTitle.textContent = '📊 Desempenho por Tópico Especializado:';
    topicsTitle.style.marginBottom = '12px';
    resultsContainer.appendChild(topicsTitle);
    
    const topicsContainer = document.createElement('div');
    topicsContainer.className = 'topic-performance';
    
    for (const topic in topicCounts) {
        const tScore = topicScores[topic] || 0;
        const tTotal = topicCounts[topic];
        const tPercentage = (tScore / tTotal) * 100;
        
        const topicDiv = document.createElement('div');
        topicDiv.style.marginBottom = '14px';
        
        const topicHeader = document.createElement('div');
        topicHeader.style.display = 'flex';
        topicHeader.style.justifyContent = 'space-between';
        topicHeader.style.marginBottom = '4px';
        
        const topicName = document.createElement('span');
        topicName.textContent = topic;
        topicName.style.fontWeight = 'bold';
        
        const topicScoreElement = document.createElement('span');
        topicScoreElement.textContent = `${tScore}/${tTotal} (${tPercentage.toFixed(0)}%)`;
        topicScoreElement.style.color = tPercentage >= 70 ? 'var(--success)' : 
                                      tPercentage >= 50 ? 'var(--warning)' : 
                                      'var(--danger)';
        
        topicHeader.appendChild(topicName);
        topicHeader.appendChild(topicScoreElement);
        
        const bar = document.createElement('div');
        bar.className = 'performance-bar';
        
        const fill = document.createElement('div');
        fill.className = 'performance-fill';
        fill.style.width = `${tPercentage}%`;
        fill.style.background = tPercentage >= 70 ? 'var(--success)' : 
                                tPercentage >= 50 ? 'var(--warning)' : 
                                'var(--danger)';
        
        bar.appendChild(fill);
        topicDiv.appendChild(topicHeader);
        topicDiv.appendChild(bar);
        topicsContainer.appendChild(topicDiv);
    }
    
    resultsContainer.appendChild(topicsContainer);
    
    const actionButtons = document.createElement('div');
    actionButtons.className = 'action-buttons';

    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'restart-btn';
    reviewBtn.textContent = '🔍 Revisar Questões Erradas';
    reviewBtn.addEventListener('click', reviewWrongQuestions);

    const retryBtn = document.createElement('button');
    retryBtn.className = 'restart-btn';
    retryBtn.style.background = 'var(--secondary)';
    retryBtn.textContent = '🔄 Refazer Este Simulado';
    retryBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_PROGRESS_KEY);
        userAnswers = new Array(filteredQuestions.length).fill(null);
        currentQuestionIndex = 0;
        
        resultsContainer.style.display = 'none';
        quizContainer.style.display = 'flex';
        quizActive = true;
        
        if (currentMode === 'exam') {
            timeLeft = filteredQuestions.length * 90;
            startTimer();
        } else {
            timerElement.textContent = 'Modo Estudo';
            timerElement.style.animation = 'none';
        }
        
        loadQuestion();
        updateStats();
    });
    
    const restartBtn = document.createElement('button');
    restartBtn.className = 'home-btn';
    restartBtn.textContent = '🏠 Selecionar Novos Tópicos';
    restartBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_PROGRESS_KEY);
        userAnswers = [];
        continueBtn.style.display = 'none';
        resetProgressBtn.style.display = 'none';
        
        resultsContainer.style.display = 'none';
        startScreen.style.display = 'flex';
        selectedTopics.clear();
        updateTopicButtons();
        updateStats();
        updateDynamicButtons();
    });

    actionButtons.appendChild(reviewBtn);
    actionButtons.appendChild(retryBtn);
    actionButtons.appendChild(restartBtn);
    resultsContainer.appendChild(actionButtons);
}

function reviewWrongQuestions() {
    const wrongQuestions = filteredQuestions.filter((q, index) => userAnswers[index] !== q.correct);
    
    if (wrongQuestions.length === 0) {
        alert('Parabéns! Você acertou todas as questões!');
        return;
    }
    
    filteredQuestions = wrongQuestions;
    userAnswers = new Array(wrongQuestions.length).fill(null);
    currentQuestionIndex = 0;
    currentMode = 'study';
    
    resultsContainer.style.display = 'none';
    quizContainer.style.display = 'flex';
    quizActive = true;
    
    clearInterval(timerInterval);
    timerElement.textContent = 'Modo Estudo (Revisão)';
    timerElement.style.animation = 'none';
    
    loadQuestion();
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
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    if (timeLeft < 300) timerElement.style.animation = 'pulse 1s infinite';
    else timerElement.style.animation = 'none';
}

function saveProgress() {
    if (currentMode === 'exam') return;

    const allUserAnswers = new Array(allQuestions.length).fill(null);
    filteredQuestions.forEach((q, filteredIndex) => {
        const originalIndex = allQuestions.findIndex(item => item.id === q.id);
        if (originalIndex !== -1) {
            allUserAnswers[originalIndex] = userAnswers[filteredIndex];
        }
    });
    
    const progress = {
        userAnswers: allUserAnswers,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(progress));
}

// Ouvintes
infoBtn?.addEventListener('click', () => { instructionsModal.style.display = 'flex'; });
closeModal?.addEventListener('click', () => { instructionsModal.style.display = 'none'; });
window.addEventListener('click', (e) => {
    if (e.target === instructionsModal) instructionsModal.style.display = 'none';
});

startQuizBtn?.addEventListener('click', startQuiz);
continueBtn?.addEventListener('click', continueQuiz);
resetProgressBtn?.addEventListener('click', resetProgress);
selectAllBtn?.addEventListener('click', selectAllTopics);
deselectAllBtn?.addEventListener('click', deselectAllTopics);
prevBtn?.addEventListener('click', prevQuestion);
nextBtn?.addEventListener('click', nextQuestion);
finishBtn?.addEventListener('click', finishQuiz);

modeButtons.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

document.addEventListener('keydown', (e) => {
    if (!quizActive) return;
    if (document.activeElement.classList.contains('option') && (e.key === 'Enter' || e.key === ' ')) return;
    
    switch(e.key) {
        case 'ArrowLeft': 
            if (!prevBtn.disabled) prevQuestion(); 
            break;
        case 'ArrowRight':
            if (!nextBtn.disabled && nextBtn.style.display !== 'none') nextQuestion(); 
            break;
        case '1': case '2': case '3': case '4':
            const optionIndex = parseInt(e.key) - 1;
            if (optionIndex >= 0 && optionIndex < 4) selectOption(optionIndex);
            break;
    }
});

window.addEventListener('DOMContentLoaded', initializeApp);
