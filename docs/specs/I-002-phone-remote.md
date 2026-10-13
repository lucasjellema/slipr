# I-002: Phone as Remote Control (Local WebSocket Relay)

Status: **implemented** · 2026-10-12 · Backlog item I-002

## Goal

Allow a presenter to use their smartphone as a tactile wireless remote control for Slipr's audience slideshow, without installing any app store software or depending on cloud services:

1. **Slide & fragment navigation**: Tap large Next / Prev touch zones, or swipe left/right.
2. **Presenter notes**: Live view of current slide notes (`slide.notes`) on the phone, synchronized in real time.
3. **Pacing cues**: Slide counter (`4 of 20`), timer, and "Up next" peek of the upcoming slide title.
4. **Ergonomics**: Haptic vibration feedback on clicks, screen wake-lock, and high-contrast dark theme.
5. **Frictionless pairing**: Presenter opens a pairing modal on the laptop and scans a QR code with their phone camera.

## Core Architectural Invariants

- **100% Optional & Progressive Enhancement**: The viewer remains a static web app. If the relay server is not running or if a show is opened offline, Audience mode functions exactly as it does today with zero errors.
- **Privacy & Local Network Only (D-010)**: No external cloud servers or third-party analytics. Communication takes place strictly over the local network (Wi-Fi or mobile hotspot).
- **Zero Build Toolchain (D-001)**: The mobile remote interface is built using standard ES modules and vanilla CSS.
- **Lazy Loading**: The remote sync code is only imported dynamically when the presenter explicitly requests remote pairing.

---

## System Architecture

```
[ Audience Mode (Laptop) ]
       │
       │ (1) Presenter presses 'P' or clicks Phone icon
       ▼
   Generate session ID + token
   Display QR Code: http://<laptop-ip>:8080/viewer/remote/?session=...&token=...
       │
       │ (2) Presenter scans QR code with phone camera
       ▼
[ Phone Mobile Browser ]
       │
       │ (3) Connect WebSocket to local relay
       ▼
[ Local WebSocket Relay (Node.js) ]
  ├── Port: 8080 (or dedicated 8089)
  ├── Route: /ws/relay
  └── Pairs 'presenter' socket and 'remote' socket
       │
       │ (4) Two-way Event Loop
       ├─► Phone sends { action: "next" } ──► Laptop calls deck.next()
       └─◄ Laptop emits Reveal slidechanged ──► Phone updates notes & title
```

---

## 1. Local Relay Server (`tools/relay.js`)

A lightweight Node.js WebSocket broker (< 120 lines, zero runtime dependencies using Node 22 native WebSockets or lightweight vendored server):

- **LAN IP Detection**: Discovers the active IPv4 address using `os.networkInterfaces()` to construct the phone URL.
- **Session Registry**: Map of `sessionId -> { token, presenterSocket, remoteSockets: Set }`.
- **Message Routing**:
  - Validates `token` on connection.
  - Relays `action` messages from `remote` to `presenter`.
  - Broadcasts `state` messages from `presenter` to all connected `remotes`.
- **Heartbeat & Cleanup**: Closes inactive rooms when the presenter disconnects.

---

## 2. Audience Mode Integration (`viewer/audience/remote-sync.js`)

- **Trigger**:
  - Shortcut key: `P` (or clicking a phone icon in the corner toolbar).
  - Lazily imported: `const { openRemoteDialog } = await import('./remote-sync.js')`.
- **Pairing Modal**:
  - Displays QR Code generated via a compact, zero-dependency SVG QR generator.
  - Displays fallback URL: `http://192.168.1.50:8080/viewer/remote/?session=...`.
  - Shows live connection status: ⚪ Waiting for phone... ➔ 🟢 Phone connected.
- **Reveal.js Event Hooks**:
  - Listens to `slidechanged`, `fragmentshown`, `fragmenthidden`.
  - Serializes current slide state and sends `state` payload to relay:
    - `index`, `totalSlides`, `slideId`, `title`, `nextTitle`, `notes` (HTML rendered via `shared/markdown.js`), `chapter`.
- **Command Handling**:
  - On incoming `command`:
    - `"next"`: `deck.next()`
    - `"prev"`: `deck.prev()`
    - `"blackout"`: `deck.togglePause()`
    - `"goto"`: `deck.slide(index)`

---

## 3. Mobile Remote Interface (`viewer/remote/`)

A dedicated mobile web app optimized for handheld operation:

```
viewer/remote/
├── index.html        (Minimal mobile shell)
├── css/remote.css    (High-contrast dark UI, large touch zones)
└── js/
    ├── app.js        (Connection, WebSocket reconnect, UI logic)
    └── gestures.js   (Swipe detection, haptics, wake lock)
```

### Key UI Features:
- **Big Touch Zones**:
  - Top 30%: Slide title, progress bar, timer, and notes toggle.
  - Middle: Scrollable presenter notes with `+` / `-` text size controls.
  - Bottom 40%: Split touch buttons: **◀ Prev** (35% width) and **Next ▶** (65% width).
- **Swipe Navigation**: Swiping left advances to the next slide/fragment; swiping right moves to the previous.
- **Haptic Vibration**: `navigator.vibrate?.(35)` provides tactile click feedback on button taps.
- **Screen Wake Lock**: Uses `navigator.wakeLock.request('screen')` so the phone screen doesn't dim during pauses.
- **Upcoming Slide Peek**: Displays "Up next: [Title]" so the speaker knows what is coming before advancing.
- **Auto-reconnect**: Exponential backoff reconnect with a sticky banner if the connection drops.

---

## 4. Message Protocol Specification

All messages are UTF-8 JSON envelopes:

```typescript
// Phone -> Server -> Laptop
type RemoteCommand =
  | { type: "command", action: "next" | "prev" | "blackout" }
  | { type: "goto", slideIndex: number };

// Laptop -> Server -> Phone
type SlideState = {
  type: "state",
  slideId: string,
  index: number,
  total: number,
  title: string,
  nextTitle: string | null,
  chapter: string | null,
  notesHtml: string | null,
  isPaused: boolean,
};

// Server -> Client
type ConnectionStatus = {
  type: "status",
  connected: boolean,
  role: "presenter" | "remote",
  remoteCount: number,
};
```

---

## 5. Security & Network Considerations

1. **Client Isolation on Guest Wi-Fi**:
   In venues where devices cannot discover each other on the Wi-Fi network, the presenter can enable their phone's **Personal Hotspot** and connect the laptop to it. Both devices will share the hotspot subnet (`192.168.43.x`), bypassing router isolation.
2. **Session Hijacking Prevention**:
   The QR code embeds a random 128-bit authentication token (`?token=...`). The relay server rejects any connection without this token.
3. **Static & Offline Hosting**:
   When opened from static CDNs or offline bundles, `remote-sync.js` fails gracefully with a modal:
   *"Local relay server not running. Start with `npm run serve` to use your phone as a remote."*
