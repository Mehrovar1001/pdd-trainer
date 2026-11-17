// PDD Trainer Application Logic
(function () {
  'use strict';

  const STORAGE_KEY = 'pdd_trainer_v1';
  let state = {
    theme: 'dark',
    history: {}, // ticketId -> { score, total, passed }
    mistakes: [], // list of question IDs
    favorites: [], // list of question IDs
    marathonIndex: 0,
    totalAnswered: 0,
    totalCorrect: 0
  };

  // Load state from localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      state = Object.assign(state, JSON.parse(saved));
    }
  } catch (e) {
    console.error('Storage error', e);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // Audio effects via Web Audio API
  let audioCtx = null;
  function initAudio() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    } catch (e) {}
  }
  document.addEventListener('click', initAudio);
  document.addEventListener('touchstart', initAudio);

  function playTone(type) {
    try {
      initAudio();
      if (!audioCtx) return;
      const ctx = audioCtx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'correct') {
        // Melodic 3-tone arpeggio
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'wrong') {
        // Descending error tone
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.linearRampToValueAtTime(140, now + 0.25);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      }
    } catch (e) {
      console.warn('Audio error', e);
    }
  }

  // Active quiz session
  let session = null;

  // DOM Elements
  const viewEl = document.getElementById('view');
  const topbar = document.getElementById('topbar');
  const zoomModal = document.getElementById('zoom');
  const zoomImg = zoomModal ? zoomModal.querySelector('img') : null;
  const confirmModal = document.getElementById('confirmModal');
  const confirmTitleEl = document.getElementById('confirmTitle');
  const confirmMsgEl = document.getElementById('confirmMessage');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const toastEl = document.getElementById('toast');
  let confirmCallback = null;

  function showConfirm(title, message, onOk) {
    playTone('click');
    if (confirmTitleEl) confirmTitleEl.textContent = title;
    if (confirmMsgEl) confirmMsgEl.textContent = message;
    confirmCallback = onOk;
    if (confirmModal) confirmModal.classList.add('active');
  }

  function hideConfirm() {
    if (confirmModal) confirmModal.classList.remove('active');
    confirmCallback = null;
  }

  if (confirmOkBtn) {
    confirmOkBtn.onclick = () => {
      playTone('click');
      const cb = confirmCallback;
      hideConfirm();
      if (typeof cb === 'function') {
        cb();
      }
    };
  }
  if (confirmCancelBtn) {
    confirmCancelBtn.onclick = () => {
      playTone('click');
      hideConfirm();
    };
  }
  if (confirmModal) {
    confirmModal.onclick = (e) => {
      if (e.target === confirmModal) {
        hideConfirm();
      }
    };
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2800);
  }

  function applyTheme() {
    if (state.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  applyTheme();

  // Navigation and Views
  function renderHeader(title, showBack = false, rightContent = '') {
    topbar.innerHTML = `
      <div class="topbar-left">
        ${showBack ? `
          <button id="backBtn" class="icon-btn" aria-label="Назад">
            <svg viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        ` : ''}
        <div class="topbar-title">${title}</div>
      </div>
      <div class="topbar-right">
        ${rightContent}
        <button id="themeBtn" class="icon-btn" aria-label="Сменить тему">
          <svg viewBox="0 0 24 24"><path d="${state.theme === 'light' ? 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' : 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `;

    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.onclick = () => {
        playTone('click');
        showHome();
      };
    }
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
      themeBtn.onclick = () => {
        playTone('click');
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        saveState();
        applyTheme();
        renderHeader(title, showBack, rightContent);
      };
    }
  }

  // Home View
  function showHome() {
    session = null;
    const questions = window.PDD_QUESTIONS || [];
    const mistakesCount = state.mistakes.length;
    const favCount = state.favorites.length;
    const accuracy = state.totalAnswered > 0 ? Math.round((state.totalCorrect / state.totalAnswered) * 100) : 0;

    renderHeader('🚗 ПДД Тренажёр 2026', false);

    let ticketsHtml = '';
    for (let t = 1; t <= 40; t++) {
      const h = state.history[t];
      let cls = '';
      let scoreText = '10 вопр.';
      if (h) {
        if (h.passed) {
          cls = 'passed';
          scoreText = `✅ ${h.score}/10`;
        } else {
          cls = 'failed';
          scoreText = `❌ ${h.score}/10`;
        }
      }
      ticketsHtml += `
        <div class="ticket-cell ${cls}" data-ticket="${t}">
          <div class="ticket-num">${t}</div>
          <div class="ticket-score">${scoreText}</div>
        </div>
      `;
    }

    viewEl.innerHTML = `
      <div class="hero-card">
        <h1>Подготовка к экзамену ГАИ</h1>
        <p>400 официальных экзаменационных билетов. Индивидуальный разбор каждого ответа с объяснением ошибок и запоминалками.</p>
        <div class="hero-stats">
          <div class="hero-stat-item">
            <div class="hero-stat-val">${accuracy}%</div>
            <div class="hero-stat-lbl">Точность</div>
          </div>
          <div class="hero-stat-item">
            <div class="hero-stat-val">${state.totalAnswered}</div>
            <div class="hero-stat-lbl">Решено вопросов</div>
          </div>
          <div class="hero-stat-item">
            <div class="hero-stat-val">${mistakesCount}</div>
            <div class="hero-stat-lbl">Ошибок</div>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
          <button id="resetProgressBtn" style="background: rgba(255, 255, 255, 0.16); border: 1px solid rgba(255, 255, 255, 0.28); color: #ffffff; padding: 8px 14px; border-radius: 10px; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(4px); transition: all 0.15s;">
            🔄 Сбросить прогресс / Начать с нуля
          </button>
        </div>
      </div>

      <div class="mode-grid">
        <div class="mode-card" id="startExamBtn">
          <div class="mode-icon" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">⏱️</div>
          <div class="mode-info">
            <h3>Экзамен ГАИ</h3>
            <p>20 случайных вопросов, 20 минут, макс. 2 ошибки</p>
          </div>
        </div>

        <div class="mode-card" id="startMistakesBtn">
          <div class="mode-icon" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">🔁</div>
          <div class="mode-info">
            <h3>Работа над ошибками</h3>
            <p>${mistakesCount > 0 ? `${mistakesCount} вопросов для повторения` : 'Ошибок пока нет'}</p>
          </div>
        </div>

        <div class="mode-card" id="startMarathonBtn">
          <div class="mode-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">⚡</div>
          <div class="mode-info">
            <h3>Марафон 400</h3>
            <p>Все вопросы подряд без остановки</p>
          </div>
        </div>

        <div class="mode-card" id="startFavBtn">
          <div class="mode-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">⭐️</div>
          <div class="mode-info">
            <h3>Избранное</h3>
            <p>${favCount > 0 ? `${favCount} сохранённых вопросов` : 'Пусто'}</p>
          </div>
        </div>
      </div>

      <div class="section-header">
        <h2>Билеты (1 — 40)</h2>
      </div>
      <div class="tickets-grid">
        ${ticketsHtml}
      </div>
    `;

    // Event listeners
    document.querySelectorAll('.ticket-cell').forEach(cell => {
      cell.onclick = () => {
        playTone('click');
        const ticketNum = parseInt(cell.getAttribute('data-ticket'), 10);
        startTicketSession(ticketNum);
      };
    });

    document.getElementById('startExamBtn').onclick = () => { playTone('click'); startExamSession(); };
    document.getElementById('startMistakesBtn').onclick = () => { playTone('click'); startMistakesSession(); };
    document.getElementById('startMarathonBtn').onclick = () => { playTone('click'); startMarathonSession(); };
    document.getElementById('startFavBtn').onclick = () => { playTone('click'); startFavoritesSession(); };

    const resetBtn = document.getElementById('resetProgressBtn');
    if (resetBtn) {
      resetBtn.onclick = () => {
        showConfirm(
          'Сброс прогресса',
          'Сбросить весь пройденный прогресс, статистику и список ошибок, чтобы начать обучение заново с Дашей?',
          () => {
            state.history = {};
            state.mistakes = [];
            state.favorites = [];
            state.marathonIndex = 0;
            state.totalAnswered = 0;
            state.totalCorrect = 0;
            saveState();
            showHome();
            showToast('✅ Прогресс успешно сброшен!');
          }
        );
      };
    }
  }

  // Start Sessions
  function startTicketSession(ticketNum) {
    const all = window.PDD_QUESTIONS || [];
    const list = all.filter(q => q.ticket === ticketNum);
    session = {
      title: `Билет ${ticketNum}`,
      mode: 'ticket',
      ticketNum: ticketNum,
      questions: list,
      currentIndex: 0,
      userAnswers: {},
      correctCount: 0,
      hasFailedCurrent: false
    };
    renderQuestion();
  }

  function startExamSession() {
    const all = window.PDD_QUESTIONS || [];
    const shuffled = [...all].sort(() => 0.5 - Math.random()).slice(0, 20);
    session = {
      title: 'Экзамен ГАИ',
      mode: 'exam',
      questions: shuffled,
      currentIndex: 0,
      userAnswers: {},
      correctCount: 0,
      timeLeft: 20 * 60,
      timerId: null,
      hasFailedCurrent: false
    };

    session.timerId = setInterval(() => {
      if (!session) return;
      session.timeLeft--;
      const timerEl = document.getElementById('examTimer');
      if (timerEl) {
        const m = Math.floor(session.timeLeft / 60);
        const s = session.timeLeft % 60;
        timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
      }
      if (session.timeLeft <= 0) {
        clearInterval(session.timerId);
        showResults();
      }
    }, 1000);

    renderQuestion();
  }

  function startMistakesSession() {
    const all = window.PDD_QUESTIONS || [];
    const list = all.filter(q => state.mistakes.includes(q.id));
    if (list.length === 0) {
      showToast('У вас пока нет сохранённых ошибок!');
      return;
    }
    session = {
      title: 'Работа над ошибками',
      mode: 'mistakes',
      questions: list,
      currentIndex: 0,
      userAnswers: {},
      correctCount: 0,
      hasFailedCurrent: false
    };
    renderQuestion();
  }

  function startMarathonSession() {
    const all = window.PDD_QUESTIONS || [];
    session = {
      title: 'Марафон 400',
      mode: 'marathon',
      questions: all,
      currentIndex: state.marathonIndex || 0,
      userAnswers: {},
      correctCount: 0,
      hasFailedCurrent: false
    };
    renderQuestion();
  }

  function startFavoritesSession() {
    const all = window.PDD_QUESTIONS || [];
    const list = all.filter(q => state.favorites.includes(q.id));
    if (list.length === 0) {
      showToast('В избранном пусто. Добавляйте вопросы звёздочкой ⭐');
      return;
    }
    session = {
      title: 'Избранное',
      mode: 'favorites',
      questions: list,
      currentIndex: 0,
      userAnswers: {},
      correctCount: 0,
      hasFailedCurrent: false
    };
    renderQuestion();
  }

  // Render Current Question
  function renderQuestion() {
    if (!session || session.currentIndex >= session.questions.length) {
      showResults();
      return;
    }

    session.hasFailedCurrent = false;
    const q = session.questions[session.currentIndex];
    const total = session.questions.length;
    const progressPercent = ((session.currentIndex + 1) / total) * 100;
    const isFav = state.favorites.includes(q.id);

    let timerHtml = '';
    if (session.mode === 'exam') {
      const m = Math.floor(session.timeLeft / 60);
      const s = session.timeLeft % 60;
      timerHtml = `<div id="examTimer" class="quiz-badge" style="color: #ef4444; font-weight: 700;">⏱ ${m}:${s < 10 ? '0' : ''}${s}</div>`;
    }

    const rightActions = `
      ${timerHtml}
      <button id="favBtn" class="icon-btn" aria-label="В избранное" style="color: ${isFav ? '#eab308' : 'inherit'};">
        <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;

    renderHeader(`${session.title} (${session.currentIndex + 1}/${total})`, true, rightActions);

    const favBtn = document.getElementById('favBtn');
    if (favBtn) {
      favBtn.onclick = () => {
        playTone('click');
        if (state.favorites.includes(q.id)) {
          state.favorites = state.favorites.filter(id => id !== q.id);
        } else {
          state.favorites.push(q.id);
        }
        saveState();
        renderQuestion();
      };
    }

    let optionsHtml = '';
    q.options.forEach((optText, idx) => {
      const optNum = idx + 1;
      optionsHtml += `
        <button class="option-btn" data-index="${optNum}">
          <div class="option-num">${optNum}</div>
          <div class="option-text">${optText}</div>
          <span class="key-hint">${optNum}</span>
        </button>
      `;
    });

    viewEl.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-header">
          <div class="quiz-badge topic">${q.topic || 'Правила дорожного движения'}</div>
          <div class="quiz-progress-track">
            <div class="quiz-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
          <div class="quiz-badge">${session.currentIndex + 1} / ${total}</div>
        </div>

        <div class="card-box">
          <div class="question-img-wrap" id="qImgWrap">
            <img class="question-img" src="${q.image}" alt="Иллюстрация вопроса" loading="eager">
            <div class="zoom-hint">🔍 Нажмите для увеличения</div>
          </div>
          <div class="question-content">
            <div class="question-text">${q.question}</div>
            <div class="options-list" id="optionsList">
              ${optionsHtml}
            </div>
            <div id="explanationContainer"></div>
          </div>
        </div>
      </div>
    `;

    // Zoom setup
    const qImgWrap = document.getElementById('qImgWrap');
    if (qImgWrap && zoomModal && zoomImg) {
      qImgWrap.onclick = () => {
        playTone('click');
        zoomImg.src = q.image;
        zoomModal.classList.add('active');
      };
    }

    // Options click setup
    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.onclick = () => {
        const chosen = parseInt(btn.getAttribute('data-index'), 10);
        handleAnswer(chosen, btn);
      };
    });
  }

  function handleAnswer(chosen, clickedBtn) {
    const q = session.questions[session.currentIndex];
    const isCorrect = chosen === q.answer;
    const expContainer = document.getElementById('explanationContainer');

    // Get specific explanation for THIS option
    const optionExpls = q.option_explanations || [];
    const thisOptExpl = optionExpls[chosen - 1] || (isCorrect ? q.explanation : 'Этот ответ неверен в данной дорожной ситуации.');

    if (isCorrect) {
      // Correct answer!
      playTone('correct');
      clickedBtn.classList.remove('wrong');
      clickedBtn.classList.add('correct');

      // If answered correctly on first try, count as victory
      if (!session.hasFailedCurrent) {
        state.totalAnswered++;
        state.totalCorrect++;
        session.correctCount++;
        // Remove from mistakes if was there
        state.mistakes = state.mistakes.filter(id => id !== q.id);
      }

      if (session.mode === 'marathon') {
        state.marathonIndex = session.currentIndex + 1;
      }
      saveState();

      // Disable all options
      document.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
      });

      if (expContainer) {
        expContainer.innerHTML = `
          <div class="explanation-box" style="border-left-color: var(--success);">
            <div class="explanation-title ok">
              ✅ Правильно!
            </div>
            <div class="explanation-desc">
              <strong>Почему это верно:</strong> ${thisOptExpl}
            </div>
            ${q.tip ? `
              <div class="mnemonic-box">
                <span>💡</span>
                <div><strong>Запоминалка:</strong> ${q.tip}</div>
              </div>
            ` : ''}
            <div class="action-bar">
              <button id="nextQBtn" class="btn-primary">
                ${session.currentIndex + 1 < session.questions.length ? 'Следующий вопрос →' : 'Завершить тест'}
                <span class="key-hint" style="background: rgba(255,255,255,0.2); border: none;">Enter</span>
              </button>
            </div>
          </div>
        `;

        const nextBtn = document.getElementById('nextQBtn');
        if (nextBtn) {
          nextBtn.onclick = () => {
            playTone('click');
            session.currentIndex++;
            renderQuestion();
          };
        }
      }
    } else {
      // Wrong answer!
      playTone('wrong');
      clickedBtn.classList.add('wrong');
      clickedBtn.disabled = true; // disable only the wrong one so user can try again

      if (!session.hasFailedCurrent) {
        session.hasFailedCurrent = true;
        state.totalAnswered++;
        if (!state.mistakes.includes(q.id)) {
          state.mistakes.push(q.id);
        }
        saveState();
      }

      // DO NOT reveal the correct option!
      // Show specific explanation why the chosen option is wrong and allow them to choose another
      if (expContainer) {
        expContainer.innerHTML = `
          <div class="explanation-box" style="border-left-color: var(--danger);">
            <div class="explanation-title err">
              ❌ Неправильно! Вы выбрали вариант №${chosen}
            </div>
            <div class="explanation-desc">
              <strong>Почему это ошибка:</strong> ${thisOptExpl}
            </div>
            <p style="font-size: 0.88rem; color: var(--text-muted); margin-top: 6px;">
              Попробуйте выбрать другой вариант выше или нажмите «Сдаюсь»:
            </p>
            <div class="action-bar" style="justify-content: flex-start; gap: 10px;">
              <button id="giveUpBtn" class="btn-primary" style="background: var(--bg-hover); color: var(--text-primary); font-size: 0.9rem;">
                💡 Сдаюсь, показать правильный ответ
              </button>
            </div>
          </div>
        `;

        const giveUpBtn = document.getElementById('giveUpBtn');
        if (giveUpBtn) {
          giveUpBtn.onclick = () => {
            playTone('click');
            // Reveal the correct option
            document.querySelectorAll('.option-btn').forEach(btn => {
              btn.disabled = true;
              const idx = parseInt(btn.getAttribute('data-index'), 10);
              if (idx === q.answer) {
                btn.classList.add('correct');
              }
            });

            const correctExpl = optionExpls[q.answer - 1] || q.explanation;
            expContainer.innerHTML = `
              <div class="explanation-box" style="border-left-color: var(--warning);">
                <div class="explanation-title" style="color: var(--warning);">
                  💡 Правильный ответ №${q.answer}: «${q.options[q.answer - 1]}»
                </div>
                <div class="explanation-desc">
                  <strong>Объяснение:</strong> ${correctExpl}
                </div>
                ${q.tip ? `
                  <div class="mnemonic-box">
                    <span>💡</span>
                    <div><strong>Запоминалка:</strong> ${q.tip}</div>
                  </div>
                ` : ''}
                <div class="action-bar">
                  <button id="nextQBtn" class="btn-primary">
                    ${session.currentIndex + 1 < session.questions.length ? 'Следующий вопрос →' : 'Завершить тест'}
                    <span class="key-hint" style="background: rgba(255,255,255,0.2); border: none;">Enter</span>
                  </button>
                </div>
              </div>
            `;

            const nextBtn = document.getElementById('nextQBtn');
            if (nextBtn) {
              nextBtn.onclick = () => {
                playTone('click');
                session.currentIndex++;
                renderQuestion();
              };
            }
          };
        }
      }
    }
  }

  // Keyboard navigation for MacBook users
  window.addEventListener('keydown', (e) => {
    // Zoom close
    if (e.key === 'Escape' && zoomModal && zoomModal.classList.contains('active')) {
      zoomModal.classList.remove('active');
      return;
    }

    if (!session) return;

    // Number keys 1..5
    if (['1', '2', '3', '4', '5'].includes(e.key)) {
      const idx = parseInt(e.key, 10);
      const btn = document.querySelector(`.option-btn[data-index="${idx}"]`);
      if (btn && !btn.disabled) {
        btn.click();
      }
    }

    // Enter or Space for next question
    if (e.key === 'Enter' || e.key === ' ') {
      const nextBtn = document.getElementById('nextQBtn');
      if (nextBtn) {
        e.preventDefault();
        nextBtn.click();
      }
    }
  });

  if (zoomModal) {
    zoomModal.onclick = () => {
      zoomModal.classList.remove('active');
    };
  }

  // Results View
  function showResults() {
    if (session && session.timerId) {
      clearInterval(session.timerId);
    }

    const total = session.questions.length;
    const score = session.correctCount;
    const percent = Math.round((score / total) * 100);
    const passed = session.mode === 'exam' ? (total - score <= 2) : (percent >= 90);

    // Save ticket history
    if (session.mode === 'ticket') {
      state.history[session.ticketNum] = {
        score: score,
        total: total,
        passed: passed
      };
      saveState();
    }

    if (passed) {
      playTone('correct');
      triggerConfetti();
    } else {
      playTone('wrong');
    }

    renderHeader('Результат теста', true);

    viewEl.innerHTML = `
      <div class="result-card">
        <div class="result-badge">${passed ? '🎉' : '⚠️'}</div>
        <div class="result-title">${passed ? 'Тест успешно сдан!' : 'Экзамен не сдан'}</div>
        <div class="result-desc">
          ${passed
            ? `Отличная работа! Вы допустили всего ${total - score} ошибок из ${total}. Правила усвоены!`
            : `Вы допустили ${total - score} ошибок. Для сдачи экзамена требуется набрать не менее 90% правильных ответов.`}
        </div>

        <div class="result-stats-row">
          <div class="result-stat">
            <div class="result-stat-val" style="color: ${passed ? 'var(--success)' : 'var(--danger)'};">${score} / ${total}</div>
            <div class="result-stat-lbl">Правильных ответов</div>
          </div>
          <div class="result-stat">
            <div class="result-stat-val">${percent}%</div>
            <div class="result-stat-lbl">Успешность</div>
          </div>
        </div>

        <div class="result-actions">
          <button id="retryBtn" class="btn-primary" style="background: var(--bg-hover); color: var(--text-primary);">Повторить</button>
          <button id="finishBtn" class="btn-primary">На главную</button>
        </div>
      </div>
    `;

    document.getElementById('finishBtn').onclick = () => { playTone('click'); showHome(); };
    document.getElementById('retryBtn').onclick = () => {
      playTone('click');
      if (session.mode === 'ticket') {
        startTicketSession(session.ticketNum);
      } else if (session.mode === 'exam') {
        startExamSession();
      } else {
        showHome();
      }
    };
  }

  // Confetti effect
  function triggerConfetti() {
    const canvas = document.getElementById('confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

    for (let i = 0; i < 80; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        w: Math.random() * 10 + 6,
        h: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        vy: Math.random() * 4 + 2,
        vx: Math.random() * 2 - 1,
        rot: Math.random() * 360,
        vrot: Math.random() * 6 - 3
      });
    }

    let frame = 0;
    function anim() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.y += p.vy;
        p.x += p.vx;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      frame++;
      if (frame < 180) {
        requestAnimationFrame(anim);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    anim();
  }

  // Initialize
  showHome();
})();
