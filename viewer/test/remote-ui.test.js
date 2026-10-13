// @ts-check
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { formatTimer } from '../remote/js/app.js';
import { detectSwipeDirection } from '../remote/js/gestures.js';
import { createRelayServer } from '../../tools/relay.js';

describe('Mobile Remote UI & Gestures (I-002: M3)', () => {
  describe('Timer formatting', () => {
    test('formats seconds into MM:SS correctly', () => {
      assert.equal(formatTimer(0), '00:00');
      assert.equal(formatTimer(5), '00:05');
      assert.equal(formatTimer(59), '00:59');
      assert.equal(formatTimer(60), '01:00');
      assert.equal(formatTimer(125), '02:05');
      assert.equal(formatTimer(3600), '60:00');
    });
  });

  describe('Swipe gesture detection', () => {
    test('detects swipe left as next slide', () => {
      const dir = detectSwipeDirection(-75, 10, { minDistance: 50, maxOffAxis: 80 });
      assert.equal(dir, 'left');
    });

    test('detects swipe right as previous slide', () => {
      const dir = detectSwipeDirection(80, -15, { minDistance: 50, maxOffAxis: 80 });
      assert.equal(dir, 'right');
    });

    test('ignores small jitters below threshold distance', () => {
      const dir = detectSwipeDirection(-30, 5, { minDistance: 50, maxOffAxis: 80 });
      assert.equal(dir, null);
    });

    test('ignores vertical scrolling so notes can scroll without triggering slide navigation', () => {
      // Large vertical delta indicates the user is scrolling notes
      const dir = detectSwipeDirection(-60, 95, { minDistance: 50, maxOffAxis: 80 });
      assert.equal(dir, null);
    });
  });

  describe('Remote to Presenter two-way interaction flow', () => {
    /** @type {Awaited<ReturnType<typeof createRelayServer>>} */
    let server;
    let wsUrl;

    before(async () => {
      server = await createRelayServer({ port: 0 });
      wsUrl = `ws://127.0.0.1:${server.port}/ws/remote`;
    });

    after(async () => {
      await server.close();
    });

    test('phone remote communicates actions and receives real-time speaker notes', async () => {
      const sessionId = 'test-session-m3';
      const token = 'tok-m3-secret';

      // 1. Presenter establishes session
      const presenterWs = new WebSocket(`${wsUrl}?session=${sessionId}&token=${token}&role=presenter`);
      const presenterMessages = [];
      presenterWs.onmessage = (e) => presenterMessages.push(JSON.parse(e.data));
      await new Promise((resolve) => { presenterWs.onopen = resolve; });

      // 2. Mobile remote connects
      const remoteWs = new WebSocket(`${wsUrl}?session=${sessionId}&token=${token}&role=remote`);
      const remoteMessages = [];
      remoteWs.onmessage = (e) => remoteMessages.push(JSON.parse(e.data));
      await new Promise((resolve) => { remoteWs.onopen = resolve; });

      // Wait a tick for status exchange
      await new Promise((resolve) => setTimeout(resolve, 50));

      const remoteStatus = remoteMessages.find((m) => m.type === 'status');
      assert.ok(remoteStatus, 'remote received status');
      assert.equal(remoteStatus.paired, true);

      // 3. Mobile remote sends "next" action
      const nextPromise = new Promise((resolve) => {
        const orig = presenterWs.onmessage;
        presenterWs.onmessage = (e) => {
          // @ts-ignore
          orig?.(e);
          const data = JSON.parse(e.data);
          if (data.type === 'command' && data.action === 'next') resolve(data);
        };
      });

      remoteWs.send(JSON.stringify({ type: 'command', action: 'next' }));
      const receivedCmd = await nextPromise;
      assert.equal(receivedCmd.action, 'next');

      // 4. Presenter updates slide state with rich speaker notes and next slide preview
      const statePromise = new Promise((resolve) => {
        const orig = remoteWs.onmessage;
        remoteWs.onmessage = (e) => {
          // @ts-ignore
          orig?.(e);
          const data = JSON.parse(e.data);
          if (data.type === 'state') resolve(data);
        };
      });

      const slideState = {
        type: 'state',
        slideId: 's-architecture',
        index: 4,
        total: 15,
        title: 'System Architecture',
        nextTitle: 'Data Flow Details',
        chapter: 'Engineering',
        notes: '<p>Emphasize zero-dependency client and WebSocket relay architecture.</p>',
        isPaused: false,
      };

      presenterWs.send(JSON.stringify(slideState));
      const receivedState = await statePromise;
      assert.deepEqual(receivedState, slideState);
      assert.ok(receivedState.notes.includes('zero-dependency client'));

      // 5. Mobile remote sends blackout pause action
      const blackoutPromise = new Promise((resolve) => {
        const orig = presenterWs.onmessage;
        presenterWs.onmessage = (e) => {
          // @ts-ignore
          orig?.(e);
          const data = JSON.parse(e.data);
          if (data.type === 'command' && data.action === 'blackout') resolve(data);
        };
      });

      remoteWs.send(JSON.stringify({ type: 'command', action: 'blackout' }));
      const receivedBlackout = await blackoutPromise;
      assert.equal(receivedBlackout.action, 'blackout');

      presenterWs.close();
      remoteWs.close();
    });
  });
});
