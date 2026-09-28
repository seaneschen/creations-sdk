export const MAX_COUNT = 999;
export const DEFAULT_SYNC_URL = "https://reconvene-devalue-petticoat.ngrok-free.dev";
export const CAROUSEL_ITEM_HEIGHT = 52;

export function installTokenFromHash(hash = "") {
  const value = new URLSearchParams(String(hash).replace(/^#/, "")).get("device");
  return /^[A-Za-z0-9_-]{43}$/.test(value ?? "") ? value : null;
}

export function isProvisionedInstallPath(pathname = "") {
  return /^\/r1\/device\/[A-Za-z0-9_-]{43}\/$/.test(String(pathname));
}

export function clampCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(MAX_COUNT, Math.max(0, Math.round(number)));
}

export function stepCarousel(value, direction) {
  const delta = direction === "up" ? 1 : direction === "down" ? -1 : Number(direction);
  return clampCount(clampCount(value) + (Number.isFinite(delta) ? delta : 0));
}

export function settleCarouselPosition(value, offset, itemHeight = CAROUSEL_ITEM_HEIGHT) {
  const height = Math.max(1, Number(itemHeight) || CAROUSEL_ITEM_HEIGHT);
  const halfway = height / 2;
  let nextValue = clampCount(value);
  let nextOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;

  while (nextOffset <= -halfway && nextValue < MAX_COUNT) {
    nextValue += 1;
    nextOffset += height;
  }
  while (nextOffset >= halfway && nextValue > 0) {
    nextValue -= 1;
    nextOffset -= height;
  }

  const edgeResistance = height * 0.32;
  if (nextValue === 0 && nextOffset > 0) nextOffset = Math.min(nextOffset, edgeResistance);
  if (nextValue === MAX_COUNT && nextOffset < 0) {
    nextOffset = Math.max(nextOffset, -edgeResistance);
  }
  return { value: nextValue, offset: nextOffset };
}

export function zeroedMorningRows(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  return rows.length
    ? rows.map((row) => ({ label: String(row.label), count: 0 }))
    : [{ label: "", count: 0 }];
}

export function normalizeBaseUrl(value) {
  const url = new URL(String(value ?? "").trim());
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Use an HTTPS synchronization address.");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

export class ApiError extends Error {
  constructor(message, { status, snapshot } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.snapshot = snapshot;
  }
}

export class HoleCountApi {
  constructor({ baseUrl, token, fetchImpl = globalThis.fetch }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token;
    this.fetchImpl = (...args) => fetchImpl.call(globalThis, ...args);
  }

  static async pair({ baseUrl, code, fetchImpl = globalThis.fetch }) {
    const response = await fetchImpl.call(globalThis, `${normalizeBaseUrl(baseUrl)}/api/v1/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({ code: String(code ?? "").trim() }),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError("The pairing service returned an unreadable response.", {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new ApiError(payload.error || "Unable to pair this R1.", {
        status: response.status,
      });
    }
    return payload;
  }

  async request(path, { method = "GET", body } = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        "ngrok-skip-browser-warning": "1",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      credentials: "same-origin",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError("The synchronization service returned an unreadable response.", {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new ApiError(payload.error || "Unable to synchronize.", {
        status: response.status,
        snapshot: payload.snapshot,
      });
    }
    return payload.snapshot;
  }

  snapshot() {
    return this.request("/api/v1/snapshot");
  }

  setMorningCount(counts, expectedRevision) {
    return this.request("/api/v1/morning", {
      method: "PUT",
      body: { counts, expectedRevision },
    });
  }

  breakOut(label, expectedRevision) {
    return this.request("/api/v1/breakouts", {
      method: "POST",
      body: { breakouts: [{ label, quantity: 1 }], expectedRevision },
    });
  }

  correct(label, remaining, expectedRevision) {
    return this.request("/api/v1/corrections", {
      method: "PATCH",
      body: { corrections: [{ label, remaining: clampCount(remaining) }], expectedRevision },
    });
  }
}
