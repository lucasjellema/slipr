// @ts-check
/**
 * Mobile Remote application logic (I-002: Phone as Remote Control).
 */

import { vibrate, requestWakeLock, setupWakeLockAutoRenew, attachSwipeHandler } from './gestures.js';

/**
 * @typedef {object} RemoteState
 * @property {string} sessionId
 * @property {string} token
 * @property {WebSocket | null} ws
 * @property {boolean} isConnected
 * @property {boolean} isPaired
 * @property {number} retryDelay
 * @property {number | null} retryTimer
 * @property {number} timerSeconds
 * @property {number | null} timerInterval
 * @property {boolean} timerRunning
 * @property {number} fontSize
 */

/** @type {RemoteState} */
const state = {
  sessionId: '',
  token: '',
  ws: null,
  isConnected: false,
  isPaired: false,
  retryDelay: 1000,
  retryTimer: null,
  timerSeconds: 0,
  timerInterval: null,
  timerRunning: false,
  fontSize: 18,
};

/**
 * Helper to get DOM references safely in browser and Node environments.
 * @returns {Record<string, any>}
 */
export function getDom() {
  if (typeof document === 'undefined') return {};
  return {
    app: document.getElementById('remote-app'),
    noSession: document.getElementById('no-session-card'),
    statusBadge: document.getElementById('status-badge'),
    statusLabel: document.getElementById('status-label'),
    reconnectBanner: document.getElementById('reconnect-banner'),
    reconnectText: document.getElementById('reconnect-text'),
    slideIndex: document.getElementById('slide-index'),
    slideTitle: document.getElementById('slide-title'),
    nextTitle: document.getElementById('next-title'),
    notesContent: document.getElementById('notes-content'),
    timerBox: document.getElementById('timer-box'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    btnBlackout: document.getElementById('btn-blackout'),
    btnFontPlus: document.getElementById('btn-font-plus'),
    btnFontMinus: document.getElementById('btn-font-minus'),
  };
}

/** @type {ReturnType<typeof getDom>} */
let dom = {};

/**
 * Format elapsed seconds into MM:SS.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTimer(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Start presentation elapsed timer.
 */
function startTimer() {
  if (state.timerRunning) return;
  state.timerRunning = true;
  state.timerInterval = /** @type {any} */ (setInterval(() => {
    state.timerSeconds++;
    if (dom.timerBox) dom.timerBox.textContent = formatTimer(state.timerSeconds);
  }, 1000));
}

/**
 * Pause or toggle presentation timer.
 */
function toggleTimer() {
  if (state.timerRunning) {
    state.timerRunning = false;
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;
    if (dom.timerBox) dom.timerBox.style.opacity = '0.5';
  } else {
    startTimer();
    if (dom.timerBox) dom.timerBox.style.opacity = '1';
  }
}

/**
 * Update notes font size.
 * @param {number} delta
 */
function changeFontSize(delta) {
  state.fontSize = Math.min(32, Math.max(14, state.fontSize + delta));
  document.documentElement.style.setProperty('--notes-font-size', `${state.fontSize}px`);
  try {
    localStorage.setItem('slipr-remote-font-size', String(state.fontSize));
  } catch {}
}

/**
 * Send an action command over WebSocket to laptop slideshow.
 * @param {'next' | 'prev' | 'blackout' | 'first' | 'last'} action
 */
export function sendCommand(action) {
  vibrate(35);
  requestWakeLock();

  // Auto-start timer on first slide navigation if not yet started
  if (!state.timerRunning && state.timerSeconds === 0 && (action === 'next' || action === 'prev')) {
    startTimer();
  }

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'command', action }));
  }
}

/**
 * Update UI connection status indicators.
 * @param {'connected' | 'waiting' | 'offline'} status
 * @param {string} text
 */
function setStatus(status, text) {
  if (!dom.statusBadge || !dom.statusLabel) return;
  dom.statusBadge.className = `status-badge is-${status}`;
  dom.statusLabel.textContent = text;

  if (status === 'connected') {
    if (dom.reconnectBanner) dom.reconnectBanner.classList.remove('is-visible');
  } else if (status === 'offline') {
    if (dom.reconnectBanner) dom.reconnectBanner.classList.add('is-visible');
    if (dom.reconnectText) dom.reconnectText.textContent = text;
  }
}

/**
 * Apply incoming slide state to the UI.
 * @param {import('../../audience/remote-sync.js').RemoteSlideState} payload
 */
export function renderSlideState(payload) {
  if (!payload) return;
  if (!dom.slideIndex) dom = getDom();

  if (dom.slideIndex) {
    dom.slideIndex.textContent = `Slide ${payload.index || 1} of ${payload.total || 1}`;
  }

  if (dom.slideTitle) {
    dom.slideTitle.textContent = payload.title || `Slide ${payload.index || 1}`;
  }

  if (dom.nextTitle) {
    if (payload.nextTitle) {
      dom.nextTitle.innerHTML = `Up next: <strong>${payload.nextTitle}</strong>`;
    } else {
      dom.nextTitle.textContent = 'Last slide of presentation';
    }
  }

  if (dom.notesContent) {
    if (payload.notes && payload.notes.trim()) {
      dom.notesContent.innerHTML = payload.notes;
    } else {
      dom.notesContent.innerHTML = '<div class="notes-empty">No notes for this slide</div>';
    }
    // Scroll notes back to top on slide change
    dom.notesContent.scrollTop = 0;
  }

  if (dom.btnBlackout) {
    dom.btnBlackout.classList.toggle('is-paused', Boolean(payload.isPaused));
    dom.btnBlackout.textContent = payload.isPaused ? '▶ Resume' : '⏸ Pause';
  }
}

/**
 * Connect to local WebSocket relay server.
 */
function connect() {
  if (!state.sessionId) return;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${location.host}/ws/remote?session=${encodeURIComponent(state.sessionId)}&token=${encodeURIComponent(state.token)}&role=remote`;

  setStatus('waiting', 'Connecting…');

  try {
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.onopen = () => {
      state.isConnected = true;
      state.retryDelay = 1000;
      setStatus('waiting', 'Waiting for presenter…');
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'status') {
        state.isPaired = Boolean(data.paired);
        if (state.isPaired) {
          setStatus('connected', 'Connected');
        } else {
          setStatus('waiting', 'Slideshow offline');
        }
      } else if (data.type === 'state') {
        renderSlideState(data);
      }
    };

    ws.onclose = () => {
      state.isConnected = false;
      state.isPaired = false;
      setStatus('offline', 'Disconnected. Reconnecting…');
      scheduleReconnect();
    };

    ws.onerror = () => {
      state.isConnected = false;
      setStatus('offline', 'Connection error');
    };
  } catch (err) {
    setStatus('offline', 'Could not open connection');
    scheduleReconnect();
  }
}

/**
 * Schedule reconnect with exponential backoff.
 */
function scheduleReconnect() {
  if (state.retryTimer) return;
  state.retryTimer = /** @type {any} */ (setTimeout(() => {
    state.retryTimer = null;
    state.retryDelay = Math.min(8000, state.retryDelay * 1.5);
    connect();
  }, state.retryDelay));
}

/**
 * Initialize mobile remote app.
 */
export function init() {
  dom = getDom();
  const urlParams = new URLSearchParams(location.search);
  const sessionId = urlParams.get('session');
  const token = urlParams.get('token');

  if (!sessionId) {
    if (dom.noSession) dom.noSession.style.display = 'flex';
    if (dom.app) dom.app.style.display = 'none';

    const form = document.getElementById('manual-pair-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const sessInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-session'));
      const tokInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-token'));
      const s = sessInput?.value.trim();
      const t = tokInput?.value.trim();
      if (s) {
        const url = new URL(location.href);
        url.searchParams.set('session', s);
        if (t) url.searchParams.set('token', t);
        else url.searchParams.delete('token');
        location.href = url.href;
      }
    });
    return;
  }

  state.sessionId = sessionId;
  state.token = token || '';

  // Load saved font size preference
  try {
    const savedSize = localStorage.getItem('slipr-remote-font-size');
    if (savedSize) {
      state.fontSize = Number.parseInt(savedSize, 10);
      document.documentElement.style.setProperty('--notes-font-size', `${state.fontSize}px`);
    }
  } catch {}

  // Button listeners
  dom.btnNext?.addEventListener('click', () => sendCommand('next'));
  dom.btnPrev?.addEventListener('click', () => sendCommand('prev'));
  dom.btnBlackout?.addEventListener('click', () => sendCommand('blackout'));

  dom.btnFontPlus?.addEventListener('click', () => changeFontSize(2));
  dom.btnFontMinus?.addEventListener('click', () => changeFontSize(-2));

  dom.timerBox?.addEventListener('click', toggleTimer);

  // Swipe gesture navigation on the remote shell
  if (dom.app) {
    attachSwipeHandler(
      dom.app,
      () => sendCommand('next'), // swipe left -> advance next
      () => sendCommand('prev'), // swipe right -> go prev
    );
  }

  setupWakeLockAutoRenew();
  connect();
}

// Start app when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
