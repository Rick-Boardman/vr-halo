// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: a HUD chat panel — a scrolling transcript plus a composer — built
 * on the shared window system so it works on desktop, touch and in VR without
 * a single DOM node.
 *
 * WHY THIS IS IN HALO AND NOT IN AN APP: a panel that shows lines somebody
 * typed and takes a line back is runtime shell, the same way the system log
 * and the status window are. What is emphatically NOT here is any knowledge of
 * a chat service — no endpoint, no token, no message schema of its own, no
 * socket. The app hands in a TRANSPORT and Halo draws whatever it says.
 *
 * THE TRANSPORT CONTRACT, which is the whole coupling:
 *
 *     transport = {
 *       subscribe(listener) -> unsubscribe
 *           // listener({ messages, status, watching, hasMore })
 *           // messages: [{ id, authorUserId, body, createdAt }]
 *           // status:   "live" | "connecting" | "offline"  (optional)
 *       send(text) -> Promise<unknown>
 *       loadOlder?() -> Promise<unknown>
 *       nameFor?(authorUserId) -> string
 *     }
 *
 * That shape is deliberately the one a headless chat client already has, so an
 * app wires the two together without an adapter: Magna's `@magna/chat-client`
 * `ChatRoomSession` satisfies it as-is (`subscribe`, `send`, `loadOlder`), and
 * anything else that can push a list of messages does too. A transport that
 * throws on `send` is handled — the panel says so on its own status line and
 * keeps the text, because losing what somebody typed is the worst thing a chat
 * panel can do.
 *
 * Parameters: see createHudChatPanel below.
 * Return value: a handle with `open`, `close`, `toggle`, `isOpen`, `send`,
 * `setTransport`, `refresh`, `isTyping` and `dispose`.
 * Side effects: creates two HUD windows (transcript and composer), subscribes
 * to the transport, and creates a Troika-backed text editor for the composer.
 */

import { createHudTextEditor } from "../hud-text-editor.js";

const DEFAULT_COLORS = {
  author: 0xf2c879,
  body: 0xdde3ea,
  meta: 0x8fa0b4,
  system: 0x9ec2ff,
  trouble: 0xe2787a,
};

/** Reserved by the built-in HUD; a panel must not claim them. */
const RESERVED_WINDOW_KEYS = new Set(["status", "log", "help", "hotbar"]);

function clockText(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // A timestamp from a JSON API may be ISO, or the space-separated form a
  // Postgres `timestamptz::text` produces. Both are common and only one parses
  // everywhere, so normalise before trusting Date.
  const at = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Purpose: build a chat panel bound to a HUD system and a transport.
 *
 * @param {object} options
 * @param {object} options.hudSystem HUD system from createSceneHudBootstrap / createHudSystem.
 * @param {object} options.renderer The WebGL renderer (the composer's editor needs it for input).
 * @param {object} options.transport See the transport contract above.
 * @param {string} [options.key="chat"] Window key prefix; the composer uses `${key}-composer`.
 * @param {string} [options.title="CHAT"] Transcript window title.
 * @param {number} [options.x=16] Transcript window x, in HUD layout pixels.
 * @param {number} [options.y=16] Transcript window y.
 * @param {number} [options.w=460] Window width for both windows.
 * @param {number} [options.h=280] Transcript height (the composer adds its own below).
 * @param {number} [options.composerHeight=96] Composer window height.
 * @param {number} [options.gap=8] Vertical gap between transcript and composer.
 * @param {number} [options.maxLines=200] How many transcript lines to keep on screen.
 * @param {object} [options.colors] Overrides for {author, body, meta, system, trouble}.
 * @param {(userId: string) => string} [options.nameFor] Author id -> display name.
 * @param {boolean} [options.open=true] Whether to show the panel immediately.
 * @returns {{open: () => void, close: () => void, toggle: () => void, isOpen: () => boolean, isTyping: () => boolean, send: (text: string) => Promise<boolean>, setTransport: (transport: object | null) => void, refresh: () => void, dispose: () => void}}
 */
export function createHudChatPanel({
  hudSystem,
  renderer,
  transport = null,
  key = "chat",
  title = "CHAT",
  x = 16,
  y = 16,
  w = 460,
  h = 280,
  composerHeight = 96,
  gap = 8,
  maxLines = 200,
  colors = {},
  nameFor = null,
  open: openImmediately = true,
} = {}) {
  if (!hudSystem) throw new Error("createHudChatPanel: hudSystem is required");
  if (!renderer) throw new Error("createHudChatPanel: renderer is required");
  const transcriptKey = String(key ?? "").trim() || "chat";
  if (RESERVED_WINDOW_KEYS.has(transcriptKey)) {
    throw new Error(`createHudChatPanel: "${transcriptKey}" is a reserved HUD window key`);
  }
  const composerKey = `${transcriptKey}-composer`;
  const palette = { ...DEFAULT_COLORS, ...(colors || {}) };

  let live = transport;
  let unsubscribe = null;
  let view = { messages: [], status: "", watching: 0, hasMore: false };
  let trouble = "";
  let opened = false;
  let disposed = false;

  hudSystem.createWindow(transcriptKey, {
    title,
    x,
    y,
    w,
    h,
    scrollable: true,
    // A transcript reads bottom-up: the newest line is the one somebody is
    // waiting for, so it stays in view without anybody scrolling.
    scrollMode: "bottom",
    maxLines,
  });

  hudSystem.createWindow(composerKey, {
    title: "SAY",
    x,
    y: y + h + gap,
    w,
    h: composerHeight,
    minH: 64,
    resizable: true,
  });

  // The composer is Halo's own text editor, which is what gives a VR user a
  // caret and a keyboard at all. Enter submits; the editor keeps focus so a
  // conversation does not need a click between lines.
  const editor = createHudTextEditor({
    renderer,
    hudSystem,
    windowKey: composerKey,
    initialText: "",
    submitOnEnter: true,
    wrapLines: true,
    onSubmit: async (text) => {
      const sent = await send(text);
      // Keep failed sends and any draft edited while the send was in flight.
      if (sent && !disposed && editor.getText() === text) editor.setText("");
    },
  });

  function authorName(userId) {
    if (typeof nameFor === "function") return nameFor(userId) || "Someone";
    if (live && typeof live.nameFor === "function") return live.nameFor(userId) || "Someone";
    return "Someone";
  }

  function statusLine() {
    const parts = [];
    if (view.status) parts.push(view.status === "live" ? "live" : view.status);
    if (Number(view.watching) > 0) parts.push(`${view.watching} here`);
    if (!live) parts.push("no transport");
    return parts.join(" · ");
  }

  function render() {
    if (disposed) return;
    const entries = [];
    const status = statusLine();
    if (status) entries.push({ text: status, color: palette.meta });
    if (view.hasMore) entries.push({ text: "… earlier messages", color: palette.meta });

    for (const message of view.messages ?? []) {
      const when = clockText(message?.createdAt);
      const who = authorName(message?.authorUserId);
      entries.push({ text: when ? `${who}  ${when}` : who, color: palette.author });
      // The body is drawn as TEXT. No markdown, no links that resolve, no
      // images: a panel floating in somebody's field of view is the last place
      // to render whatever a stranger typed.
      for (const line of String(message?.body ?? "").split("\n")) {
        entries.push({ text: line, color: palette.body });
      }
    }

    if (!entries.length || !(view.messages ?? []).length) {
      entries.push({ text: "Nothing said yet.", color: palette.system });
    }
    if (trouble) entries.push({ text: trouble, color: palette.trouble });

    hudSystem.setWindowLines(transcriptKey, entries, { scrollMode: "bottom" });
  }

  function attach(next) {
    if (typeof unsubscribe === "function") unsubscribe();
    unsubscribe = null;
    live = next || null;
    view = { messages: [], status: "", watching: 0, hasMore: false };
    if (live && typeof live.subscribe === "function") {
      unsubscribe = live.subscribe((incoming) => {
        view = {
          messages: incoming?.messages ?? [],
          status: incoming?.status ?? "",
          watching: incoming?.watching ?? 0,
          hasMore: Boolean(incoming?.hasMore),
        };
        render();
      });
    }
    render();
  }

  async function send(text) {
    const body = String(text ?? "").trim();
    if (!body) return false;
    if (!live || typeof live.send !== "function") {
      trouble = "Nothing is connected to send through.";
      render();
      return false;
    }
    trouble = "";
    try {
      await live.send(body);
      return true;
    } catch (error) {
      // Said out loud rather than swallowed, and the panel never clears what
      // somebody typed on a failure — the editor still holds it, because
      // losing a sentence is worse than showing a refusal.
      trouble = String(error?.message ?? error ?? "That could not be sent.");
      render();
      return false;
    }
  }

  function open() {
    opened = true;
    hudSystem.setWindowHidden(transcriptKey, false);
    hudSystem.setWindowHidden(composerKey, false);
    hudSystem.bringToFront(transcriptKey);
    hudSystem.bringToFront(composerKey);
    render();
  }

  function close() {
    opened = false;
    editor.blur();
    hudSystem.setWindowHidden(transcriptKey, true);
    hudSystem.setWindowHidden(composerKey, true);
  }

  attach(transport);
  if (openImmediately) open();
  else close();

  return {
    open,
    close,
    toggle: () => (opened ? close() : open()),
    isOpen: () => opened,
    isTyping: () => opened && editor.isTyping(),
    send,
    setTransport: (next) => attach(next),
    refresh: render,
    /** The transcript and composer window keys, for skinning (see
     *  HUD-WINDOW-SKINNING.md) or for an app that wants to move them. */
    windowKeys: () => ({ transcript: transcriptKey, composer: composerKey }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (typeof unsubscribe === "function") unsubscribe();
      unsubscribe = null;
      editor?.dispose?.();
      hudSystem.destroyWindow?.(composerKey);
      hudSystem.destroyWindow?.(transcriptKey);
    },
  };
}
