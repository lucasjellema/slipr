// @ts-check
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createQrSvg,
  generateToken,
  generateSessionId,
  buildSlideState,
  handleRemoteCommand,
} from '../audience/remote-sync.js';
import { createRelayServer } from '../../tools/relay.js';

describe('Audience remote sync & QR pairing (I-002: M2)', () => {
  describe('SVG QR code generation', () => {
    test('createQrSvg generates a valid standalone SVG', () => {
      const url = 'http://192.168.1.100:8080/viewer/remote/?session=s-test123&token=abc456';
      const svg = createQrSvg(url, { width: 200, height: 200 });

      assert.ok(svg.includes('<svg'), 'must contain opening <svg> tag');
      assert.ok(svg.includes('</svg>'), 'must contain closing </svg> tag');
      assert.ok(svg.includes('<path') || svg.includes('<rect'), 'must contain modules path or rects');
      assert.ok(svg.includes('viewBox="0 0 200 200"'), 'must include viewBox dimension');
    });

    test('createQrSvg respects custom options', () => {
      const svg = createQrSvg('https://slipr.example', {
        width: 150,
        height: 150,
        color: '#ff0000',
        background: '#000000',
      });
      assert.ok(svg.includes('fill:#ff0000') || svg.includes('fill="#ff0000"'));
      assert.ok(svg.includes('fill:#000000') || svg.includes('fill="#000000"'));
    });
  });

  describe('Tokens and session identifiers', () => {
    test('generateToken produces unique non-empty tokens', () => {
      const t1 = generateToken(6);
      const t2 = generateToken(6);
      assert.equal(typeof t1, 'string');
      assert.ok(t1.length >= 8);
      assert.notEqual(t1, t2);
    });

    test('generateSessionId produces prefix s- and random identifier', () => {
      const s1 = generateSessionId();
      const s2 = generateSessionId();
      assert.ok(s1.startsWith('s-'));
      assert.notEqual(s1, s2);
    });
  });

  describe('Slide state extraction (buildSlideState)', () => {
    test('extracts slide state, speaker notes, and upcoming slide title', () => {
      // Mock slide DOM elements
      const asideNotes = { innerHTML: '<p>Speaker notes for intro.</p>' };
      const currentSlide = {
        id: 's-intro',
        dataset: { slideId: 's-intro', chapter: 'intro' },
        querySelector: (/** @type {string} */ sel) => (sel === 'aside.notes' ? asideNotes : null),
        nextElementSibling: {
          id: 's-details',
          dataset: { slideId: 's-details' },
          classList: { contains: () => false },
          querySelector: () => null,
        },
      };

      const mockDeck = {
        getCurrentSlide: () => currentSlide,
        getIndices: () => ({ h: 2, v: 0 }),
        getTotalSlides: () => 12,
        isPaused: () => false,
      };

      const mockCtx = {
        show: {
          slides: [
            { id: 's-intro', content: { title: 'Welcome to Slipr' } },
            { id: 's-details', content: { title: 'Deep Dive Details' } },
          ],
        },
      };

      // @ts-ignore
      const state = buildSlideState(mockDeck, mockCtx);

      assert.equal(state.type, 'state');
      assert.equal(state.slideId, 's-intro');
      assert.equal(state.index, 3);
      assert.equal(state.total, 12);
      assert.equal(state.title, 'Welcome to Slipr');
      assert.equal(state.nextTitle, 'Deep Dive Details');
      assert.equal(state.chapter, 'intro');
      assert.equal(state.notes, '<p>Speaker notes for intro.</p>');
      assert.equal(state.isPaused, false);
    });

    test('handles last slide gracefully without nextTitle', () => {
      const currentSlide = {
        id: 's-outro',
        dataset: { slideId: 's-outro' },
        querySelector: () => null,
        nextElementSibling: null,
      };

      const mockDeck = {
        getCurrentSlide: () => currentSlide,
        getIndices: () => ({ h: 9, v: 0 }),
        getTotalSlides: () => 10,
        isPaused: () => true,
      };

      const mockCtx = {
        show: {
          slides: [{ id: 's-outro', content: { title: 'Conclusion' } }],
        },
      };

      // @ts-ignore
      const state = buildSlideState(mockDeck, mockCtx);
      assert.equal(state.index, 10);
      assert.equal(state.title, 'Conclusion');
      assert.equal(state.nextTitle, null);
      assert.equal(state.notes, '');
      assert.equal(state.isPaused, true);
    });
  });

  describe('Remote command handling (handleRemoteCommand)', () => {
    test('routes commands to appropriate deck methods', () => {
      let nextCalled = 0;
      let prevCalled = 0;
      let blackoutCalled = 0;
      let slideCalledWith = null;

      const mockDeck = {
        next: () => { nextCalled++; },
        prev: () => { prevCalled++; },
        togglePause: () => { blackoutCalled++; },
        slide: (/** @type {number} */ idx) => { slideCalledWith = idx; },
        getTotalSlides: () => 8,
      };

      handleRemoteCommand(mockDeck, { type: 'command', action: 'next' });
      assert.equal(nextCalled, 1);

      handleRemoteCommand(mockDeck, { type: 'command', action: 'prev' });
      assert.equal(prevCalled, 1);

      handleRemoteCommand(mockDeck, { type: 'command', action: 'blackout' });
      assert.equal(blackoutCalled, 1);

      handleRemoteCommand(mockDeck, { type: 'command', action: 'first' });
      assert.equal(slideCalledWith, 0);

      handleRemoteCommand(mockDeck, { type: 'command', action: 'last' });
      assert.equal(slideCalledWith, 7);

      handleRemoteCommand(mockDeck, { type: 'goto', slideIndex: 4 });
      assert.equal(slideCalledWith, 3, 'slideIndex 4 translates to 0-based index 3');
    });

    test('ignores unknown or null commands safely', () => {
      const mockDeck = {};
      assert.doesNotThrow(() => {
        // @ts-ignore
        handleRemoteCommand(mockDeck, null);
        handleRemoteCommand(mockDeck, { type: 'unknown' });
      });
    });
  });

  describe('Presenter and remote relay communication', () => {
    /** @type {Awaited<ReturnType<typeof createRelayServer>>} */
    let serverApp;
    let wsUrl;

    before(async () => {
      serverApp = await createRelayServer({ port: 0 });
      wsUrl = `ws://127.0.0.1:${serverApp.port}/ws/remote`;
    });

    after(async () => {
      await serverApp.close();
    });

    test('presenter connects, handles incoming remote commands, and broadcasts state', async () => {
      const sessionId = 'test-session-m2';
      const token = 'tok-m2-xyz';

      // 1. Presenter connects
      const presenterWs = new WebSocket(`${wsUrl}?session=${sessionId}&token=${token}&role=presenter`);
      const presenterMessages = [];
      presenterWs.onmessage = (e) => presenterMessages.push(JSON.parse(e.data));

      await new Promise((resolve) => { presenterWs.onopen = resolve; });

      // 2. Remote connects
      const remoteWs = new WebSocket(`${wsUrl}?session=${sessionId}&token=${token}&role=remote`);
      const remoteMessages = [];
      remoteWs.onmessage = (e) => remoteMessages.push(JSON.parse(e.data));

      await new Promise((resolve) => { remoteWs.onopen = resolve; });

      // Give event loop a tick to process status notifications
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.ok(presenterMessages.length >= 2, 'presenter received initial status and remote join status');
      const latestPresenterStatus = presenterMessages[presenterMessages.length - 1];
      assert.equal(latestPresenterStatus.paired, true);
      assert.equal(latestPresenterStatus.remotesCount, 1);

      // 3. Remote dispatches 'next' command
      let nextCalled = false;
      const mockDeck = {
        next: () => { nextCalled = true; },
      };

      // Set up presenter handler on incoming message
      const commandReceived = new Promise((resolve) => {
        const orig = presenterWs.onmessage;
        presenterWs.onmessage = (e) => {
          // @ts-ignore
          orig?.(e);
          const data = JSON.parse(e.data);
          if (data.type === 'command') {
            handleRemoteCommand(mockDeck, data);
            resolve(data);
          }
        };
      });

      remoteWs.send(JSON.stringify({ type: 'command', action: 'next' }));
      const receivedCmd = await commandReceived;
      assert.equal(receivedCmd.action, 'next');
      assert.equal(nextCalled, true, 'mockDeck.next was invoked on presenter');

      // 4. Presenter broadcasts new slide state
      const stateReceived = new Promise((resolve) => {
        const orig = remoteWs.onmessage;
        remoteWs.onmessage = (e) => {
          // @ts-ignore
          orig?.(e);
          const data = JSON.parse(e.data);
          if (data.type === 'state') resolve(data);
        };
      });

      const newState = {
        type: 'state',
        slideId: 's-agenda',
        index: 2,
        total: 10,
        title: 'Agenda',
        nextTitle: 'Details',
        chapter: 'overview',
        notes: '<p>Talk about goals.</p>',
        isPaused: false,
      };

      presenterWs.send(JSON.stringify(newState));
      const remoteGotState = await stateReceived;
      assert.deepEqual(remoteGotState, newState);

      presenterWs.close();
      remoteWs.close();
    });
  });
});
