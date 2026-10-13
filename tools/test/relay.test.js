// @ts-check
import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { getLanIp, createRelayServer } from '../relay.js';

/**
 * Test client helper that buffers messages so rapid-succession messages are never dropped.
 * @param {string} url
 */
function createClient(url) {
  const ws = new WebSocket(url);
  /** @type {any[]} */
  const queue = [];
  /** @type {((msg: any) => void)[]} */
  const waiting = [];

  ws.addEventListener('message', (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      data = e.data;
    }
    if (waiting.length > 0) {
      const resolve = waiting.shift();
      resolve?.(data);
    } else {
      queue.push(data);
    }
  });

  return {
    ws,
    /**
     * @param {string} [label]
     * @param {number} [timeoutMs]
     * @returns {Promise<any>}
     */
    nextMessage(label = 'msg', timeoutMs = 3000) {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift());
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiting.indexOf(resolver);
          if (idx !== -1) waiting.splice(idx, 1);
          reject(new Error(`Timeout waiting for ws message: [${label}]`));
        }, timeoutMs);
        const resolver = (data) => {
          clearTimeout(timer);
          resolve(data);
        };
        waiting.push(resolver);
      });
    },
    /**
     * @param {any} data
     */
    send(data) {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    },
    close() {
      ws.close();
    },
  };
}

/**
 * @param {WebSocket} ws
 * @param {number} [timeoutMs]
 */
function waitForOpen(ws, timeoutMs = 3000) {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ws open')), timeoutMs);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(undefined); }, { once: true });
    ws.addEventListener('error', (err) => { clearTimeout(timer); reject(err); }, { once: true });
  });
}

describe('Local relay server & LAN discovery (I-002: M1)', () => {
  /** @type {Awaited<ReturnType<typeof createRelayServer>>} */
  let app;
  let baseUrl;
  let wsUrl;

  before(async () => {
    // Start on ephemeral port 0
    app = await createRelayServer({ port: 0 });
    baseUrl = `http://127.0.0.1:${app.port}`;
    wsUrl = `ws://127.0.0.1:${app.port}/ws/remote`;
  });

  after(async () => {
    await app.close();
  });

  test('getLanIp returns a valid IPv4 address', () => {
    const ip = getLanIp();
    assert.match(ip, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });

  test('HTTP /api/remote/info returns JSON with ip, port, and sessions', async () => {
    const res = await fetch(`${baseUrl}/api/remote/info`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.port, app.port);
    assert.ok(typeof data.ip === 'string');
    assert.ok(typeof data.sessions === 'number');
  });

  test('presenter connects and receives status payload', async () => {
    const sessionId = 'test-session-1';
    const token = 'token-secret-1';

    const client = createClient(`${wsUrl}?session=${sessionId}&token=${token}&role=presenter`);
    const statusMsg = await client.nextMessage('presenter-status');

    assert.equal(statusMsg.type, 'status');
    assert.equal(statusMsg.role, 'presenter');
    assert.equal(statusMsg.session, sessionId);
    assert.equal(statusMsg.token, token);
    assert.equal(statusMsg.paired, false);
    assert.equal(statusMsg.remotesCount, 0);

    client.close();
  });

  test('remote with bad token is rejected', async () => {
    const sessionId = 'test-session-2';
    const token = 'valid-token';

    // 1. Establish presenter
    const presenter = new WebSocket(`${wsUrl}?session=${sessionId}&token=${token}&role=presenter`);
    await waitForOpen(presenter);

    // 2. Connect remote with invalid token
    const badRemote = new WebSocket(`${wsUrl}?session=${sessionId}&token=wrong-token&role=remote`);
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ type: 'timeout' }), 2000);
      badRemote.onmessage = (e) => {
        clearTimeout(timer);
        resolve(JSON.parse(e.data));
      };
      badRemote.onclose = () => {
        clearTimeout(timer);
        resolve({ type: 'closed' });
      };
      badRemote.onerror = () => {
        clearTimeout(timer);
        resolve({ type: 'error' });
      };
    });

    assert.ok(result.type === 'error' || result.type === 'closed');

    badRemote.close();
    presenter.close();
  });

  test('two-way command relay and state broadcast with late-joining cache', async () => {
    const sessionId = 'test-session-3';
    const token = 'tok-sync-3';

    // 1. Presenter connects
    const presenter = createClient(`${wsUrl}?session=${sessionId}&token=${token}&role=presenter`);
    const initialPresenterStatus = await presenter.nextMessage('1-initialPresenterStatus');
    assert.equal(initialPresenterStatus.role, 'presenter');
    assert.equal(initialPresenterStatus.paired, false);

    // 2. Remote connects
    const remote = createClient(`${wsUrl}?session=${sessionId}&token=${token}&role=remote`);
    const initialRemoteStatus = await remote.nextMessage('2-initialRemoteStatus');
    assert.equal(initialRemoteStatus.role, 'remote');
    assert.equal(initialRemoteStatus.paired, true);

    // Presenter receives updated status that remote joined
    const presenterStatus = await presenter.nextMessage('2-presenterRemoteJoined');
    assert.equal(presenterStatus.paired, true);
    assert.equal(presenterStatus.remotesCount, 1);

    // 3. Remote sends a navigation command (e.g. Next) -> Presenter receives it
    const commandPromise = presenter.nextMessage('3-commandPromise');
    remote.send({ type: 'command', action: 'next' });
    const receivedCommand = await commandPromise;
    assert.deepEqual(receivedCommand, { type: 'command', action: 'next' });

    // 4. Presenter broadcasts slide state -> Remote receives it
    const statePromise = remote.nextMessage('4-statePromise');
    const slideState = {
      type: 'state',
      slideId: 's-intro',
      index: 2,
      total: 10,
      title: 'Introduction',
      notes: '<p>Welcome everyone.</p>',
    };
    presenter.send(slideState);
    const receivedState = await statePromise;
    assert.deepEqual(receivedState, slideState);

    // 5. Late-joining remote connects: it should receive status then cached slide state!
    const lateRemote = createClient(`${wsUrl}?session=${sessionId}&token=${token}&role=remote`);
    const lateStatus = await lateRemote.nextMessage('5-lateStatus');
    assert.equal(lateStatus.type, 'status');
    const lateState = await lateRemote.nextMessage('5-lateState');
    assert.deepEqual(lateState, slideState, 'late-joining remote must get current slide state immediately');

    // 6. Presenter disconnects -> remotes notified paired: false
    const remoteDisconnectPromise = remote.nextMessage('6-remoteDisconnect');
    presenter.close();
    const disconnectNotice = await remoteDisconnectPromise;
    assert.equal(disconnectNotice.type, 'status');
    assert.equal(disconnectNotice.paired, false);

    remote.close();
    lateRemote.close();
  });
});
