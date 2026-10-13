// @ts-check
/**
 * Presenter-side remote synchronization for Audience mode (I-002: Phone as Remote Control).
 *
 * Responsibilities:
 *   1. Generates session ID and pairing token.
 *   2. Detects local relay server and LAN IP via /api/remote/info.
 *   3. Displays pairing modal with embedded SVG QR Code and copyable URL.
 *   4. Establishes presenter WebSocket connection to tools/relay.js.
 *   5. Relays commands (next/prev/blackout/goto) from mobile phone to Reveal deck.
 *   6. Broadcasts real-time slide state (notes, title, index, pause) on slide change.
 *   7. Lazily loaded only when requested via shortcut ('P') or toolbar button.
 */

import { createQrSvg } from '../../vendor/qrcode.js';

export { createQrSvg };

/**
 * @typedef {object} RemoteSlideState
 * @property {'state'} type
 * @property {string} slideId
 * @property {number} index
 * @property {number} total
 * @property {string} title
 * @property {string | null} nextTitle
 * @property {string | null} chapter
 * @property {string} notes
 * @property {boolean} isPaused
 */

/**
 * Extract slide state from current Reveal deck and show context.
 * @param {any} deck
 * @param {import('../../shared/load.js').ShowContext} [ctx]
 * @returns {RemoteSlideState}
 */
export function buildSlideState(deck, ctx) {
  const current = deck?.getCurrentSlide?.();
  const slideId = current?.dataset?.slideId ?? current?.id ?? '';
  const chapter = current?.dataset?.chapter ?? null;

  // Presenter notes: Reveal places aside.notes inside the section
  const notesEl = current?.querySelector?.('aside.notes');
  const notes = notesEl?.innerHTML ?? '';

  // Current title: check ctx.show.slides first, fallback to DOM heading
  const slideObj = ctx?.show?.slides?.find((s) => s.id === slideId);
  let title = slideObj?.content?.title ?? '';
  if (!title && current) {
    const heading = current.querySelector?.('h1, h2, h3, .slipr-title, [data-id="title"], [data-slot="title"]');
    title = heading?.textContent?.trim() ?? '';
  }

  // Next slide title (for upcoming preview on phone)
  let nextTitle = null;
  const nextSection = current?.nextElementSibling;
  if (nextSection && !nextSection.classList?.contains?.('slipr-backup')) {
    const nextSlideId = nextSection.dataset?.slideId ?? nextSection.id;
    const nextSlideObj = ctx?.show?.slides?.find((s) => s.id === nextSlideId);
    nextTitle = nextSlideObj?.content?.title ?? null;
    if (!nextTitle) {
      const nextHeading = nextSection.querySelector?.('h1, h2, h3, .slipr-title, [data-id="title"], [data-slot="title"]');
      nextTitle = nextHeading?.textContent?.trim() ?? null;
    }
  }

  const indices = typeof deck?.getIndices === 'function' ? deck.getIndices() : { h: 0, v: 0 };
  const total = typeof deck?.getTotalSlides === 'function' ? deck.getTotalSlides() : 1;
  const isPaused = typeof deck?.isPaused === 'function' ? deck.isPaused() : false;

  return {
    type: 'state',
    slideId,
    index: (indices?.h ?? 0) + 1,
    total,
    title,
    nextTitle,
    chapter,
    notes,
    isPaused,
  };
}

/**
 * Dispatch incoming mobile remote commands to Reveal deck.
 * @param {any} deck
 * @param {{ type: string, action?: string, slideIndex?: number }} cmd
 */
export function handleRemoteCommand(deck, cmd) {
  if (!cmd || !deck) return;
  if (cmd.type === 'command') {
    switch (cmd.action) {
      case 'next':
        deck.next?.();
        break;
      case 'prev':
        deck.prev?.();
        break;
      case 'blackout':
        deck.togglePause?.();
        break;
      case 'first':
        deck.slide?.(0);
        break;
      case 'last':
        deck.slide?.((deck.getTotalSlides?.() ?? 1) - 1);
        break;
    }
  } else if (cmd.type === 'goto' && typeof cmd.slideIndex === 'number') {
    deck.slide?.(cmd.slideIndex - 1);
  }
}

/**
 * Generate a random short pairing token.
 * @param {number} [len]
 * @returns {string}
 */
export function generateToken(len = 8) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, len * 2);
  }
  return Math.random().toString(36).slice(2, 2 + len * 2);
}

/**
 * Generate a unique session ID.
 * @returns {string}
 */
export function generateSessionId() {
  return 's-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Discover relay endpoint and LAN IP.
 * @returns {Promise<{ ip: string, port: number, available: boolean }>}
 */
export async function detectRelayInfo() {
  const defaultPort = (typeof location !== 'undefined' && location.port)
    ? Number.parseInt(location.port, 10)
    : 8080;
  const defaultHost = (typeof location !== 'undefined' && location.hostname)
    ? location.hostname
    : '127.0.0.1';

  try {
    const res = await fetch('/api/remote/info', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return {
        ip: data.ip || defaultHost,
        port: data.port || defaultPort,
        available: true,
      };
    }
  } catch {}

  return {
    ip: defaultHost,
    port: defaultPort,
    available: false,
  };
}

/**
 * Active remote sync session singleton.
 * @type {{
 *   sessionId: string,
 *   token: string,
 *   ws: WebSocket | null,
 *   deck: any,
 *   ctx: import('../../shared/load.js').ShowContext | undefined,
 *   container: HTMLElement | null,
 *   backdropEl: HTMLElement | null,
 *   remoteUrl: string,
 *   paired: boolean,
 *   remotesCount: number,
 *   available: boolean,
 * } | null}
 */
let activeSession = null;

/**
 * Get current sync state (for UI or test inspection).
 */
export function getRemoteSyncState() {
  if (!activeSession) return null;
  return {
    sessionId: activeSession.sessionId,
    token: activeSession.token,
    remoteUrl: activeSession.remoteUrl,
    paired: activeSession.paired,
    remotesCount: activeSession.remotesCount,
    available: activeSession.available,
  };
}

/**
 * Initialize or toggle the remote sync dialog and presenter connection.
 * @param {any} deck
 * @param {import('../../shared/load.js').ShowContext} [ctx]
 * @param {HTMLElement} [container]
 */
export async function toggleRemoteSync(deck, ctx, container) {
  if (!activeSession) {
    await initRemoteSync(deck, ctx, container);
  } else {
    toggleModal();
  }
}

/**
 * Initialize remote sync: starts WebSocket presenter connection and builds modal.
 * @param {any} deck
 * @param {import('../../shared/load.js').ShowContext} [ctx]
 * @param {HTMLElement} [container]
 */
export async function initRemoteSync(deck, ctx, container) {
  const sessionId = generateSessionId();
  const token = generateToken(6);
  const info = await detectRelayInfo();

  const originProto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'https:' : 'http:';
  const remoteUrl = `${originProto}//${info.ip}:${info.port}/viewer/remote/?session=${sessionId}&token=${token}`;

  const wsProto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss:' : 'ws:';
  const wsHost = (typeof location !== 'undefined' && location.hostname)
    ? `${location.hostname}:${info.port}`
    : `127.0.0.1:${info.port}`;
  const wsUrl = `${wsProto}//${wsHost}/ws/remote?session=${sessionId}&token=${token}&role=presenter`;

  activeSession = {
    sessionId,
    token,
    ws: null,
    deck,
    ctx,
    container: container ?? document.body,
    backdropEl: null,
    remoteUrl,
    paired: false,
    remotesCount: 0,
    available: info.available,
  };

  createModalDOM(activeSession);
  connectPresenterWs(wsUrl);

  // Hook Reveal events to send state changes
  const sendState = () => {
    if (activeSession?.ws && activeSession.ws.readyState === WebSocket.OPEN) {
      activeSession.ws.send(JSON.stringify(buildSlideState(deck, ctx)));
    }
  };

  deck.on('slidechanged', sendState);
  deck.on('fragmentshown', sendState);
  deck.on('fragmenthidden', sendState);
  deck.on('paused', sendState);
  deck.on('resumed', sendState);

  // Keyboard shortcut listener to close modal on Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeSession?.backdropEl?.classList.contains('is-open')) {
      closeModal();
    }
  });

  openModal();
}

/**
 * Establish presenter WebSocket connection to relay server.
 * @param {string} wsUrl
 */
function connectPresenterWs(wsUrl) {
  if (!activeSession) return;
  try {
    const ws = new WebSocket(wsUrl);
    activeSession.ws = ws;

    ws.onopen = () => {
      // Send initial slide state upon connection
      if (activeSession?.deck) {
        ws.send(JSON.stringify(buildSlideState(activeSession.deck, activeSession.ctx)));
      }
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'status') {
        if (activeSession) {
          activeSession.paired = Boolean(data.paired);
          activeSession.remotesCount = data.remotesCount ?? 0;
          updateStatusUI(activeSession.paired, activeSession.remotesCount);
        }
      } else if (data.type === 'command' || data.type === 'goto') {
        if (activeSession?.deck) {
          handleRemoteCommand(activeSession.deck, data);
        }
      }
    };

    ws.onclose = () => {
      if (activeSession) {
        activeSession.paired = false;
        activeSession.remotesCount = 0;
        updateStatusUI(false, 0);
      }
    };

    ws.onerror = () => {
      if (activeSession) {
        updateStatusUI(false, 0, true);
      }
    };
  } catch (err) {
    console.warn('Slipr: could not connect to relay WebSocket:', err);
  }
}

/**
 * Construct modal DOM and inject into document.
 * @param {NonNullable<typeof activeSession>} session
 */
function createModalDOM(session) {
  const backdrop = document.createElement('div');
  backdrop.className = 'slipr-remote-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Phone remote pairing');

  const modal = document.createElement('div');
  modal.className = 'slipr-remote-modal';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'slipr-remote-close';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  closeBtn.textContent = '✕';
  closeBtn.onclick = closeModal;

  const title = document.createElement('h2');
  title.className = 'slipr-remote-title';
  title.textContent = '📱 Phone Remote';

  const subtitle = document.createElement('p');
  subtitle.className = 'slipr-remote-subtitle';
  subtitle.textContent = 'Scan QR code with your phone camera';

  const qrBox = document.createElement('div');
  qrBox.className = 'slipr-remote-qr-box';
  try {
    qrBox.innerHTML = createQrSvg(session.remoteUrl, { width: 190, height: 190, padding: 2 });
  } catch {
    qrBox.textContent = 'QR Code generation failed';
  }

  const urlRow = document.createElement('div');
  urlRow.className = 'slipr-remote-url-row';

  const urlInput = document.createElement('input');
  urlInput.className = 'slipr-remote-url-input';
  urlInput.type = 'text';
  urlInput.readOnly = true;
  urlInput.value = session.remoteUrl;
  urlInput.onclick = () => urlInput.select();

  const copyBtn = document.createElement('button');
  copyBtn.className = 'slipr-remote-copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(session.remoteUrl);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    } catch {
      urlInput.select();
    }
  };

  urlRow.append(urlInput, copyBtn);

  const statusEl = document.createElement('div');
  statusEl.className = 'slipr-remote-status is-waiting';

  const statusDot = document.createElement('span');
  statusDot.className = 'slipr-remote-status-dot';

  const statusLabel = document.createElement('span');
  statusLabel.className = 'slipr-remote-status-label';
  statusLabel.textContent = 'Waiting for phone to scan…';

  statusEl.append(statusDot, statusLabel);

  const metaRow = document.createElement('div');
  metaRow.className = 'slipr-remote-meta-row';
  metaRow.innerHTML = `<span>Session: <strong class="slipr-remote-meta-code">${session.sessionId}</strong></span>` +
    (session.token ? `<span>Token: <strong class="slipr-remote-meta-code">${session.token}</strong></span>` : '');

  // Expandable conference Wi-Fi tip (client isolation workaround)
  const tipDetails = document.createElement('details');
  tipDetails.className = 'slipr-remote-tip';
  const tipSummary = document.createElement('summary');
  tipSummary.textContent = 'Conference Wi-Fi or cannot connect?';
  const tipP = document.createElement('p');
  tipP.innerHTML = 'Many guest networks block device-to-device connections. To bypass this, turn on your phone’s <strong>Personal Hotspot</strong> and connect your laptop to it.';
  tipDetails.append(tipSummary, tipP);

  modal.append(closeBtn, title, subtitle, qrBox, urlRow, statusEl, metaRow, tipDetails);

  // If local relay server is not running, append friendly hint banner
  if (!session.available) {
    const offlineBanner = document.createElement('div');
    offlineBanner.className = 'slipr-remote-offline-banner';
    offlineBanner.innerHTML = '<strong>⚠️ Local relay server not detected</strong><br>' +
      'Run the relay server on your computer to connect your phone:<br>' +
      '<code>npm run remote</code>' +
      '<div class="slipr-remote-offline-sub">Keyboard shortcuts and the speaker window (press <strong>S</strong>) work without a relay.</div>';
    modal.append(offlineBanner);
  }

  backdrop.append(modal);

  // Clicking backdrop outside modal closes it
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeModal();
  };

  session.backdropEl = backdrop;
  document.body.append(backdrop);
}

/**
 * Update connection status in dialog and toolbar button.
 * @param {boolean} paired
 * @param {number} remotesCount
 * @param {boolean} [hasError]
 */
function updateStatusUI(paired, remotesCount, hasError = false) {
  const statusEl = document.querySelector('.slipr-remote-status');
  const labelEl = document.querySelector('.slipr-remote-status-label');
  const remoteBtn = document.querySelector('.slipr-remote-btn');

  if (statusEl && labelEl) {
    if (paired && remotesCount > 0) {
      statusEl.className = 'slipr-remote-status is-connected';
      labelEl.textContent = `🟢 Phone connected (${remotesCount} remote${remotesCount > 1 ? 's' : ''})`;
    } else if (hasError) {
      statusEl.className = 'slipr-remote-status is-error';
      labelEl.textContent = '⚠️ Relay connection error';
    } else {
      statusEl.className = 'slipr-remote-status is-waiting';
      labelEl.textContent = 'Waiting for phone to scan…';
    }
  }

  if (remoteBtn) {
    remoteBtn.classList.toggle('is-connected', paired && remotesCount > 0);
    if (paired && remotesCount > 0) {
      remoteBtn.setAttribute('title', `Phone remote: ${remotesCount} connected (P)`);
    } else {
      remoteBtn.setAttribute('title', 'Phone remote control (P)');
    }
  }
}

export function openModal() {
  if (activeSession?.backdropEl) {
    activeSession.backdropEl.classList.add('is-open');
  }
}

export function closeModal() {
  if (activeSession?.backdropEl) {
    activeSession.backdropEl.classList.remove('is-open');
  }
}

export function toggleModal() {
  if (activeSession?.backdropEl) {
    activeSession.backdropEl.classList.toggle('is-open');
  }
}
