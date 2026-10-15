// @ts-check
/**
 * Local WebSocket relay server and LAN discovery (I-002: Phone as Remote Control).
 *
 * Runs locally on the presenter's laptop:
 *   1. Relays commands (next/prev) from the phone to the presenter's slideshow.
 *   2. Broadcasts slide state (notes, title, index) from slideshow to the phone.
 *   3. Discovers LAN IP address for effortless QR-code phone pairing.
 *   4. Zero external npm dependencies (pure Node.js HTTP & RFC 6455 WebSockets).
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';

export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const DEFAULT_PORT = 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * Detect the primary non-internal IPv4 address for local network pairing.
 * @returns {string}
 */
export function getLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Generate a random short session code or token.
 * @param {number} [bytes]
 * @returns {string}
 */
export function generateToken(bytes = 6) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * RFC 6455 WebSocket Connection abstraction over net.Socket.
 */
export class WebSocketConnection extends EventEmitter {
  /**
   * @param {import('node:net').Socket} socket
   */
  constructor(socket) {
    super();
    this.socket = socket;
    /** @type {Buffer} */
    this._incoming = Buffer.alloc(0);
    this._closed = false;

    this.socket.on('data', (chunk) => this._onData(chunk));
    this.socket.on('close', () => this._onClose());
    this.socket.on('error', (err) => this.emit('error', err));
  }

  /**
   * @param {Buffer} chunk
   */
  _onData(chunk) {
    this._incoming = Buffer.concat([this._incoming, chunk]);

    while (this._incoming.length >= 2) {
      const firstByte = this._incoming[0];
      const secondByte = this._incoming[1];

      const fin = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this._incoming.length < 4) return;
        payloadLen = this._incoming.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (this._incoming.length < 10) return;
        payloadLen = Number(this._incoming.readBigUInt64BE(offset));
        offset += 8;
      }

      let maskKey = null;
      if (masked) {
        if (this._incoming.length < offset + 4) return;
        maskKey = this._incoming.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this._incoming.length < offset + payloadLen) {
        return; // Wait for full frame
      }

      const rawPayload = this._incoming.subarray(offset, offset + payloadLen);
      const payload = Buffer.alloc(payloadLen);

      if (masked && maskKey) {
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = rawPayload[i] ^ maskKey[i % 4];
        }
      } else {
        rawPayload.copy(payload);
      }

      // Advance buffer past this frame
      this._incoming = this._incoming.subarray(offset + payloadLen);

      if (opcode === 0x1) {
        // Text frame
        this.emit('message', payload.toString('utf8'));
      } else if (opcode === 0x2) {
        // Binary frame
        this.emit('message', payload);
      } else if (opcode === 0x8) {
        // Close frame received: echo close frame and close socket
        if (!this._closing) {
          this._closing = true;
          this._sendFrame(0x8, payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0));
        }
        setImmediate(() => {
          this.socket.end();
          this._onClose();
        });
      } else if (opcode === 0x9) {
        // Ping -> Pong
        this._sendFrame(0xa, payload);
      }
    }
  }

  /**
   * Send a UTF-8 text message or JSON object.
   * @param {string | object} data
   */
  send(data) {
    if (this._closed || !this.socket.writable) return;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const buf = Buffer.from(text, 'utf8');
    this._sendFrame(0x1, buf);
  }

  /**
   * Encode and write an unmasked RFC 6455 server frame.
   * @param {number} opcode
   * @param {Buffer} payload
   */
  _sendFrame(opcode, payload) {
    if (this._closed || !this.socket.writable) return;
    const len = payload.length;
    let header;

    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = len;
    } else if (len <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    this.socket.write(Buffer.concat([header, payload]));
  }

  _onClose() {
    if (this._emittedClose) return;
    this._emittedClose = true;
    this._closed = true;
    this.emit('close');
  }

  close(code = 1000) {
    if (this._closing) return;
    this._closing = true;
    try {
      const codeBuf = Buffer.alloc(2);
      codeBuf.writeUInt16BE(code, 0);
      this._sendFrame(0x8, codeBuf);
    } catch {}
    setImmediate(() => {
      this.socket.end();
      this._onClose();
    });
  }
}

/**
 * @typedef {object} RemoteSession
 * @property {string} id
 * @property {string} token
 * @property {WebSocketConnection | null} presenter
 * @property {Set<WebSocketConnection>} remotes
 * @property {any | null} lastState
 * @property {number} createdAt
 * @property {number} lastActiveAt
 */

/**
 * Relay broker that pairs presenters and mobile remotes.
 */
export class RemoteRelayBroker {
  constructor() {
    /** @type {Map<string, RemoteSession>} */
    this.sessions = new Map();
  }

  /**
   * Get or create a session.
   * @param {string} sessionId
   * @param {string} [token]
   * @returns {RemoteSession}
   */
  getOrCreateSession(sessionId, token) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        token: token ?? generateToken(8),
        presenter: null,
        remotes: new Set(),
        lastState: null,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Handle an upgraded WebSocket connection.
   * @param {WebSocketConnection} ws
   * @param {URL} url
   */
  handleConnection(ws, url) {
    const sessionId = url.searchParams.get('session');
    const token = url.searchParams.get('token');
    const role = url.searchParams.get('role'); // 'presenter' | 'remote'

    if (!sessionId) {
      ws.send({ type: 'error', error: 'Missing session parameter' });
      ws.close();
      return;
    }

    if (!role || (role !== 'presenter' && role !== 'remote')) {
      ws.send({ type: 'error', error: 'Role must be presenter or remote' });
      ws.close();
      return;
    }

    const session = this.getOrCreateSession(sessionId, token ?? undefined);
    session.lastActiveAt = Date.now();

    // Verify token for remote clients
    if (token && session.token && token !== session.token) {
      ws.send({ type: 'error', error: 'Invalid pairing token' });
      ws.close();
      return;
    }

    if (role === 'presenter') {
      // Register or replace presenter
      if (session.presenter && session.presenter !== ws) {
        session.presenter.send({ type: 'status', role: 'presenter', connected: false, message: 'Replaced by new presenter connection' });
        session.presenter.close();
      }
      session.presenter = ws;

      ws.send({
        type: 'status',
        role: 'presenter',
        session: session.id,
        token: session.token,
        paired: session.remotes.size > 0,
        remotesCount: session.remotes.size,
      });

      // Notify any connected remotes that presenter is online
      for (const remote of session.remotes) {
        remote.send({ type: 'status', role: 'remote', paired: true });
      }

      ws.on('message', (msg) => {
        session.lastActiveAt = Date.now();
        let payload;
        try {
          payload = typeof msg === 'string' ? JSON.parse(msg) : JSON.parse(msg.toString('utf8'));
        } catch {
          return;
        }

        // Cache state update for late-joining remotes
        if (payload?.type === 'state') {
          session.lastState = payload;
        }

        // Broadcast state/sync messages to all paired remotes
        for (const remote of session.remotes) {
          remote.send(payload);
        }
      });

      ws.on('close', () => {
        if (session.presenter === ws) {
          session.presenter = null;
          for (const remote of session.remotes) {
            remote.send({ type: 'status', role: 'remote', paired: false });
          }
        }
      });
    } else {
      // role === 'remote'
      session.remotes.add(ws);

      ws.send({
        type: 'status',
        role: 'remote',
        session: session.id,
        paired: session.presenter !== null,
      });

      // Send the latest slide state immediately so the remote has notes without waiting for a slide change
      if (session.lastState) {
        ws.send(session.lastState);
      }

      // Notify presenter of new remote
      if (session.presenter) {
        session.presenter.send({
          type: 'status',
          role: 'presenter',
          paired: true,
          remotesCount: session.remotes.size,
        });
      }

      ws.on('message', (msg) => {
        session.lastActiveAt = Date.now();
        let payload;
        try {
          payload = typeof msg === 'string' ? JSON.parse(msg) : JSON.parse(msg.toString('utf8'));
        } catch {
          return;
        }

        // Forward action command to presenter
        if (session.presenter) {
          session.presenter.send(payload);
        }
      });

      ws.on('close', () => {
        session.remotes.delete(ws);
        if (session.presenter) {
          session.presenter.send({
            type: 'status',
            role: 'presenter',
            paired: session.remotes.size > 0,
            remotesCount: session.remotes.size,
          });
        }
      });
    }
  }
}

/**
 * Attach the WebSocket relay handler to an HTTP server.
 * @param {import('node:http').Server} server
 * @param {RemoteRelayBroker} [broker]
 * @returns {RemoteRelayBroker}
 */
export function attachRelay(server, broker = new RemoteRelayBroker()) {
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws/remote' && url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const ws = new WebSocketConnection(socket);
    broker.handleConnection(ws, url);
  });

  return broker;
}

/**
 * Create a standalone HTTP + WebSocket server for Slipr.
 * @param {{ port?: number, rootDir?: string }} [options]
 * @returns {Promise<{ server: import('node:http').Server, broker: RemoteRelayBroker, port: number, lanIp: string, close: () => Promise<void> }>}
 */
export async function createRelayServer(options = {}) {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const broker = new RemoteRelayBroker();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Remote status API
    if (url.pathname === '/api/remote/info') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({
        ip: getLanIp(),
        port: /** @type {import('node:net').AddressInfo} */ (server.address()).port,
        sessions: broker.sessions.size,
      }));
      return;
    }

    // Static file serving
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = resolve(rootDir, '.' + pathname);

    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const stats = await stat(filePath);
      if (stats.isDirectory()) {
        res.writeHead(302, { Location: url.pathname + '/' });
        res.end();
        return;
      }
      const data = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  server.on('upgrade', (_req, s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  attachRelay(server, broker);

  const port = options.port ?? DEFAULT_PORT;
  await new Promise((resolve) => server.listen(port, resolve));

  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  const actualPort = address.port;
  const lanIp = getLanIp();

  return {
    server,
    broker,
    port: actualPort,
    lanIp,
    close: async () => {
      // @ts-ignore
      if (typeof server.closeAllConnections === 'function') {
        // @ts-ignore
        server.closeAllConnections();
      }
      for (const s of sockets) {
        s.destroy();
      }
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}

// Direct CLI execution: node tools/relay.js [port]
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/relay.js')) {
  const portArg = Number.parseInt(process.argv[2], 10);
  const port = Number.isInteger(portArg) ? portArg : DEFAULT_PORT;
  const app = await createRelayServer({ port });
  console.log(`\n  🚀 Slipr Remote Relay running at:`);
  console.log(`     Local:   http://localhost:${app.port}/`);
  console.log(`     Network: http://${app.lanIp}:${app.port}/\n`);
}
