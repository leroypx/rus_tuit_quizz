/* quiz.js — shared utilities for all quiz pages */
'use strict';

const QuizUtils = (() => {

  /* ----------------------------------------------------------
     Theme
  ---------------------------------------------------------- */
  function initTheme() {
    const saved = localStorage.getItem('quizzer_theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    }
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = isDark() ? iconSun() : iconMoon();
      btn.addEventListener('click', toggleTheme);
    }
  }

  function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('quizzer_theme', isDark() ? 'dark' : 'light');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = isDark() ? iconSun() : iconMoon();
  }

  function isDark() {
    return document.documentElement.classList.contains('dark');
  }

  /* ----------------------------------------------------------
     Data loading
  ---------------------------------------------------------- */
  async function loadManifest() {
    const res = await fetch('data/manifest.json');
    if (!res.ok) throw new Error('manifest.json not found');
    return res.json();
  }

  async function loadQuestions(file) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`Could not load ${file}`);
    if (file.endsWith('.xlsx')) {
      const buf = await res.arrayBuffer();
      const wb  = XLSX.read(buf);
      const ws  = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, { defval: '' });
    }
    return res.json();
  }

  /* ----------------------------------------------------------
     Content rendering (text + LaTeX + img)
     allowZoom: true = question images are clickable to zoom
                false = option images, no zoom
  ---------------------------------------------------------- */
  function renderContent(el, text, allowZoom = true) {
    if (!text && text !== 0) { el.textContent = ''; return; }
    el.innerHTML = sanitizeContent(String(text));
    if (window.renderMathInElement) {
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$',  right: '$',  display: false },
        ],
        throwOnError: false,
      });
    }
    if (allowZoom) {
      el.querySelectorAll('img').forEach(img => {
        img.style.cursor = 'zoom-in';
        img.onclick = () => openImgOverlay(img.src);
      });
    }
  }

  function sanitizeContent(html) {
    return html.replace(/<(?!\/?(?:img|br)[\s>])[^>]+>/gi, match => {
      return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });
  }

  /* ----------------------------------------------------------
     Image zoom overlay
  ---------------------------------------------------------- */
  function openImgOverlay(src) {
    let overlay = document.getElementById('img-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'img-overlay';
      overlay.className = 'img-overlay hidden';
      overlay.innerHTML = '<img id="img-overlay-img" alt="">';
      overlay.addEventListener('click', () => overlay.classList.add('hidden'));
      document.body.appendChild(overlay);
    }
    document.getElementById('img-overlay-img').src = src;
    overlay.classList.remove('hidden');
  }

  /* ----------------------------------------------------------
     localStorage helpers
  ---------------------------------------------------------- */
  function saveSettings(key, obj) {
    localStorage.setItem('quizzer_settings_' + key, JSON.stringify(obj));
  }

  function loadSettings(key) {
    try { return JSON.parse(localStorage.getItem('quizzer_settings_' + key)) || {}; }
    catch { return {}; }
  }

  /* ----------------------------------------------------------
     History — stores full session for replay
     Schema: {date, mode, score, total, percent,
              questions:[...], answers:{idx: key}, shuffledOptions:{idx:[{key,text}]}}
  ---------------------------------------------------------- */
  function saveHistory(subjectId, result) {
    result.subjectId = subjectId;
    const history = loadGlobalHistory();
    history.unshift(result);
    if (history.length > 5) history.splice(5);
    localStorage.setItem('quizzer_global_history', JSON.stringify(history));
  }

  function loadGlobalHistory() {
    try {
      let globalHistory = JSON.parse(localStorage.getItem('quizzer_global_history'));
      if (globalHistory) return globalHistory;

      // Migrate old subject-specific histories if global history does not exist
      globalHistory = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('quizzer_history_')) {
          const sId = key.replace('quizzer_history_', '');
          try {
            const list = JSON.parse(localStorage.getItem(key)) || [];
            list.forEach(entry => {
              entry.subjectId = sId;
              globalHistory.push(entry);
            });
          } catch (e) {}
        }
      }
      globalHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
      globalHistory = globalHistory.slice(0, 5);
      localStorage.setItem('quizzer_global_history', JSON.stringify(globalHistory));
      return globalHistory;
    } catch {
      return [];
    }
  }

  function loadHistory(subjectId) {
    const globalHistory = loadGlobalHistory();
    return globalHistory.filter(entry => entry.subjectId === subjectId);
  }

  function saveAnswered(subjectId, ids) {
    localStorage.setItem('quizzer_answered_' + subjectId, JSON.stringify([...ids]));
  }

  function loadAnswered(subjectId) {
    try {
      const arr = JSON.parse(localStorage.getItem('quizzer_answered_' + subjectId)) || [];
      return new Set(arr);
    } catch { return new Set(); }
  }

  /* ----------------------------------------------------------
     Render a past session result into a container element
     Used by index.html history modal
  ---------------------------------------------------------- */
  function renderSessionResult(session, containerEl) {
    if (!session) { containerEl.innerHTML = '<p class="text-faint">Нет данных</p>'; return; }

    const { mode, score, total, percent, questions, answers, shuffledOptions } = session;
    // Score summary
    const passed = mode === 'exam'
      ? score >= total * 0.6
      : percent >= 60;
    const scoreHtml = `
      <div class="session-score-row">
        <span class="score-big-sm">${mode === 'exam' ? score + '/' + total : percent + '%'}</span>
        <span class="badge ${passed ? 'badge-success' : 'badge-danger'}" style="font-size:0.85rem;padding:4px 12px;">${passed ? 'Сдан' : 'Не сдан'}</span>
        ${mode !== 'exam' ? `<span class="text-muted text-sm">${score} из ${total} верных</span>` : ''}
      </div>`;

    // Mistakes
    if (!questions || !questions.length) {
      containerEl.innerHTML = scoreHtml + '<p class="text-faint text-sm mt-3">Детали сессии недоступны (старая запись)</p>';
      return;
    }

    const mistakes = [];
    questions.forEach((q, i) => {
      const chosen = answers ? answers[i] : undefined;
      const right  = normalizeAnswer(q['Правильный ответ']);
      if (normalizeAnswer(chosen) !== right) mistakes.push({ q, chosen, right, index: i });
    });

    let mistakesHtml = '';
    if (mistakes.length === 0) {
      mistakesHtml = '<p class="text-success text-sm mt-3">Нет ошибок — отличный результат!</p>';
    } else {
      const items = mistakes.map(({ q, chosen, right, index }) => {
        const opts = (shuffledOptions && shuffledOptions[index])
          || getAnswerKeys(q).map(k => ({ key: k, text: q[k] }));
        const optHtml = opts.map(({ key, text }, idx) => {
          const posLabel = ['A','B','C','D'][idx] || key;
          const isRight  = key === right;
          const isChosen = key === chosen;
          const cls = 'preview-option' + (isRight ? ' correct-opt' : '');
          const txt = String(text || '').replace(/<[^>]+>/g, '');
          return `<div class="${cls}">
            <span style="font-weight:700;min-width:20px;">${posLabel}</span>
            <span style="flex:1;">${isRight ? '<strong>' : ''}${txt}${isRight ? '</strong>' : ''}</span>
            ${isRight  ? '<span style="color:var(--success);font-size:0.72rem;font-weight:600;">верно</span>' : ''}
            ${isChosen && !isRight ? '<span style="color:var(--danger);font-size:0.72rem;font-weight:600;">ваш</span>' : ''}
          </div>`;
        }).join('');

        const preview = String(q['Вопрос'] || '').replace(/<[^>]+>/g, '').trim().slice(0, 70);
        return `<div class="mistake-item">
          <div class="mistake-header">
            <span class="badge badge-danger" style="flex-shrink:0;">№${index + 1}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" class="selectable">${preview || 'Вопрос ' + (index+1)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;transition:transform 150ms ease;"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="mistake-body hidden">
            <div class="preview-options">${optHtml}</div>
            <p class="text-sm text-muted mt-2">Верный: <strong class="text-success">${right}</strong>${chosen ? `, ваш: <strong class="text-danger">${chosen}</strong>` : ' (пропущен)'}</p>
          </div>
        </div>`;
      }).join('');
      mistakesHtml = `<div class="mt-4"><h3 class="mb-3">Ошибки (${mistakes.length})</h3>${items}</div>`;
    }

    containerEl.innerHTML = scoreHtml + mistakesHtml;

    // Wire collapse
    containerEl.querySelectorAll('.mistake-header').forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        body.classList.toggle('hidden');
        const chevron = header.querySelector('svg');
        if (chevron) chevron.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
      });
    });
  }

  /* ----------------------------------------------------------
     Toast notifications
  ---------------------------------------------------------- */
  function toast(message, type = '') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ` ${type}` : '');
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  /* ----------------------------------------------------------
     Sidebar toggle (mobile) — kept for editor.html compat
  ---------------------------------------------------------- */
  function initSidebarToggle() {
    const btn = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.app-sidebar');
    if (btn && sidebar) {
      btn.addEventListener('click', () => sidebar.classList.toggle('open'));
    }
  }

  /* ----------------------------------------------------------
     Tab switching
  ---------------------------------------------------------- */
  function initTabs(containerSelector) {
    const container = document.querySelector(containerSelector || '.tabs');
    if (!container) return;
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.tab;
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        container.querySelectorAll('.tab-panel').forEach(p => {
          p.classList.toggle('active', p.id === targetId);
        });
      });
    });
    const first = container.querySelector('.tab-btn');
    if (first) first.click();
  }

  /* ----------------------------------------------------------
     History display (compact bars — legacy, still used in results)
  ---------------------------------------------------------- */
  function renderHistory(subjectId, containerEl) {
    const history = loadHistory(subjectId);
    containerEl.innerHTML = '';
    if (!history.length) {
      containerEl.innerHTML = '<p class="text-faint text-sm">Нет истории</p>';
      return;
    }
    history.forEach(item => {
      const bar = document.createElement('div');
      bar.className = 'history-bar';
      const score = item.mode === 'exam'
        ? `${item.score}/${item.total}`
        : `${item.percent}%`;
      bar.innerHTML = `
        <span class="history-score">${score}</span>
        <span class="history-meta">${formatDate(item.date)} &middot; ${item.mode === 'exam' ? 'Экзамен' : 'Тренировка'}</span>
      `;
      containerEl.appendChild(bar);
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  /* ----------------------------------------------------------
     Quiz utilities
  ---------------------------------------------------------- */
  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getAnswerKeys(q) {
    return ['A', 'B', 'C', 'D'].filter(k => q[k] !== undefined && q[k] !== '');
  }

  function normalizeAnswer(val) {
    return String(val || '').trim().toUpperCase();
  }

  /* ----------------------------------------------------------
     SVG Icons
  ---------------------------------------------------------- */
  function iconMoon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;
  }

  function iconSun() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>`;
  }

  function iconMenu() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>`;
  }

  function iconEdit() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>`;
  }

  function iconTrash() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>`;
  }

  function iconChevron(dir) {
    const points = {
      left: '15 18 9 12 15 6',
      right: '9 18 15 12 9 6',
      up: '18 15 12 9 6 15',
      down: '6 9 12 15 18 9',
    };
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="${points[dir] || points.down}"/></svg>`;
  }

  function iconDownload() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`;
  }

  function iconUpload() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>`;
  }

  function iconCopy() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;
  }

  function iconCheck() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`;
  }

  function iconPlus() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`;
  }

  function iconTable() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="3" x2="9" y2="21"/>
    </svg>`;
  }

  function iconGrid() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>`;
  }

  function iconBook() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`;
  }

  function iconInfo() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>`;
  }

  function iconSettings() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`;
  }

  function iconHistory() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.54"/>
    </svg>`;
  }

  function iconClose() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
  }

  /* ----------------------------------------------------------
     Public API
  ---------------------------------------------------------- */
  return {
    initTheme, toggleTheme, isDark,
    loadManifest, loadQuestions,
    renderContent, openImgOverlay,
    saveSettings, loadSettings,
    saveHistory, loadHistory, loadGlobalHistory,
    saveAnswered, loadAnswered,
    renderHistory, renderSessionResult,
    toast,
    initSidebarToggle, initTabs,
    shuffleArray, getAnswerKeys, normalizeAnswer,
    formatDate,
    icons: {
      moon: iconMoon, sun: iconSun, menu: iconMenu,
      edit: iconEdit, trash: iconTrash, chevron: iconChevron,
      download: iconDownload, upload: iconUpload, copy: iconCopy,
      check: iconCheck, plus: iconPlus, table: iconTable,
      grid: iconGrid, book: iconBook, info: iconInfo,
      settings: iconSettings, history: iconHistory, close: iconClose,
    }
  };
})();
