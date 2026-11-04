// SPDX-License-Identifier: Apache-2.0
const REMOTE_LOG_BUFFER_LIMIT = 25;
const REMOTE_LOG_MIN_FLUSH_MS = 1000;
const REMOTE_LOG_HEARTBEAT_MS = 2000;
const REMOTE_LOG_FALLBACK_SESSION_ID_MAX = 1e9;

const REMOTE_LOG_DISABLED_URL_VALUES = new Set(["0", "false", "off", "none"]);
const REMOTE_LOG_DISABLED_SWITCH_VALUES = new Set(["0", "false", "off"]);

function createRemoteLogSessionId() {
  try {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
      const words = new Uint32Array(2);
      cryptoRef.getRandomValues(words);
      return `${words[0].toString(16)}${words[1].toString(16)}`;
    }
  } catch {
    // no-op
  }

  return String(Math.floor(Math.random() * REMOTE_LOG_FALLBACK_SESSION_ID_MAX));
}

function resolveRemoteLogUrl({ logUrl, logSwitch } = {}) {
  const urlString = logUrl == null ? "" : String(logUrl).trim();
  const normalizedUrl = urlString.toLowerCase();
  const normalizedSwitch = String(logSwitch ?? "").toLowerCase();
  const urlDisabled = REMOTE_LOG_DISABLED_URL_VALUES.has(normalizedUrl);
  const switchDisabled = REMOTE_LOG_DISABLED_SWITCH_VALUES.has(normalizedSwitch);

  if (!urlString || urlDisabled || switchDisabled) {
    return null;
  }

  return urlString;
}

/**
 * Purpose: Create the shared browser remote-log adapter that batches lightweight runtime events and delivers them to a collector endpoint with beacon-or-fetch fallback behavior.
 * @param {object} [options] Remote-log adapter configuration.
 * @param {string | null | undefined} [options.logUrl] Collector URL used for remote event delivery; falsy values or explicit disabled strings return no adapter.
 * @param {string | null | undefined} [options.logSwitch] Optional feature switch string that can disable remote logging even when logUrl is present.
 * @returns {{ log: (event: string, data?: unknown) => void, flush: () => void } | null} Remote-log adapter with event buffering and manual flush control, or null when remote logging is disabled.
 * Side effects: reads browser crypto, window, navigator, Blob, and fetch APIs, installs pagehide and beforeunload listeners, starts a periodic heartbeat flush timer, emits an initial page_view event, and sends buffered events to the configured collector URL.
 */
export function createRemoteLogAdapter({ logUrl, logSwitch } = {}) {
  const url = resolveRemoteLogUrl({ logUrl, logSwitch });
  if (!url) return null;

  const windowRef = globalThis.window;
  const navigatorRef = globalThis.navigator;
  const buffer = [];
  const sid = createRemoteLogSessionId();
  let lastFlushMs = 0;

  function flush() {
    if (!buffer.length) return;

    const now = Date.now();
    if (now - lastFlushMs < REMOTE_LOG_MIN_FLUSH_MS) return;
    lastFlushMs = now;

    const payload = {
      sid,
      href: String(windowRef?.location?.href || ""),
      ua: String(navigatorRef?.userAgent || ""),
      events: buffer.splice(0, buffer.length),
    };

    try {
      const body = JSON.stringify(payload);

      if (navigatorRef?.sendBeacon) {
        const blob = new Blob([body], { type: "text/plain" });
        const ok = navigatorRef.sendBeacon(url, blob);
        if (ok) return;
      }

      if (typeof globalThis.fetch === "function") {
        globalThis
          .fetch(url, {
            method: "POST",
            body,
            keepalive: true,
          })
          .catch(() => {});
      }
    } catch {
      // no-op
    }
  }

  function log(event, data) {
    try {
      buffer.push({ t: Date.now(), event: String(event || ""), data: data ?? null });
      if (buffer.length >= REMOTE_LOG_BUFFER_LIMIT) {
        flush();
      }
    } catch {
      // no-op
    }
  }

  try {
    windowRef?.addEventListener?.("pagehide", flush);
    windowRef?.addEventListener?.("beforeunload", flush);
  } catch {
    // no-op
  }

  try {
    log("page_view", {
      origin: String(windowRef?.location?.origin || ""),
      path: String(windowRef?.location?.pathname || ""),
      href: String(windowRef?.location?.href || ""),
    });
    flush();

    const intervalId = windowRef?.setInterval?.(() => {
      try {
        flush();
      } catch {
        // no-op
      }
    }, REMOTE_LOG_HEARTBEAT_MS);

    windowRef?.addEventListener?.(
      "pagehide",
      () => {
        try {
          if (intervalId != null) {
            windowRef.clearInterval(intervalId);
          }
        } catch {
          // no-op
        }
      },
      { once: true }
    );
  } catch {
    // no-op
  }

  return { log, flush };
}
