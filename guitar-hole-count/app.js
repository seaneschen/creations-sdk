import {
  ApiError,
  DEFAULT_SYNC_URL,
  HoleCountApi,
  MAX_COUNT,
  clampCount,
  installTokenFromHash,
  isProvisionedInstallPath,
  stepCarousel,
  zeroedMorningRows,
} from "./core.js";

const app = document.querySelector("#app");
const toastElement = document.querySelector("#toast");
const STORAGE = {
  endpoint: "guitar_hole_endpoint_v1",
  token: "guitar_hole_token_v1",
  session: "guitar_hole_session_v1",
  cache: "guitar_hole_cache_v1",
};

const state = {
  api: null,
  config: null,
  snapshot: null,
  online: false,
  busy: false,
  screen: "loading",
  focused: null,
  carousel: null,
  morningRows: [],
  suppressSideClickUntil: 0,
  provisioned: false,
};

let toastTimer;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function storageGet(key, secure = false) {
  try {
    if (window.creationStorage) {
      const bucket = secure ? window.creationStorage.secure : window.creationStorage.plain;
      const stored = await bucket.getItem(key);
      if (stored != null) return decode(stored);
    }
    const stored = localStorage.getItem(key);
    return stored == null ? null : JSON.parse(stored);
  } catch {
    return null;
  }
}

async function storageSet(key, value, secure = false) {
  if (window.creationStorage) {
    const bucket = secure ? window.creationStorage.secure : window.creationStorage.plain;
    await bucket.setItem(key, encode(value));
    if (secure) return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

async function persistSession(config, token) {
  let secureError;
  try {
    await storageSet(STORAGE.token, token, true);
  } catch (error) {
    secureError = error;
  }

  // Current OS3 builds have shown intermittent secure-storage retention after
  // closing a creation. The paired token is device-scoped and revocable, so a
  // copy in creation-isolated plain storage is a safe reliability fallback.
  await storageSet(STORAGE.session, { config, token });
  await storageSet(STORAGE.endpoint, config);

  if (secureError && !(await storageGet(STORAGE.session))?.token) {
    throw secureError;
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add("show");
  toastTimer = setTimeout(() => toastElement.classList.remove("show"), 1800);
}

async function cacheSnapshot(snapshot) {
  state.snapshot = snapshot;
  await storageSet(STORAGE.cache, snapshot);
}

function header({ back = false } = {}) {
  return `
    <div class="topbar">
      ${back ? '<button class="icon-button" data-action="back" aria-label="Back">‹</button>' : ""}
      <div class="eyebrow">GUITAR WALL</div>
      <button class="status-button" data-action="settings" aria-label="Synchronization settings">
        <span class="sync-dot ${state.online ? "online" : ""}"></span>
      </button>
      <button class="icon-button" data-action="close" aria-label="Close">×</button>
    </div>`;
}

function renderMain() {
  state.screen = "main";
  state.focused = null;
  const snapshot = state.snapshot;
  if (!snapshot?.initialized) {
    app.innerHTML = `${header()}
      <div class="total">0<span>holes remaining</span></div>
      <div class="empty">Enter the first morning count to begin.</div>
      <div class="footer"><span></span><button class="primary" data-action="morning">Morning count</button></div>`;
    return;
  }

  const rows = snapshot.rows.map((row, index) => `
    <div class="row">
      <div class="label">${escapeHtml(row.label)}</div>
      <button type="button" class="quantity" data-role="remaining" data-index="${index}"
        aria-label="${escapeHtml(row.label)} remaining: ${row.remaining}">${row.remaining}</button>
      <button class="minus" data-action="breakout" data-index="${index}" ${row.remaining === 0 ? "disabled" : ""} aria-label="Break out one ${escapeHtml(row.label)}">−</button>
    </div>`).join("");

  app.innerHTML = `${header()}
    <div class="total">${snapshot.totals.remaining}<span>holes remaining</span></div>
    <div class="rows">${rows}</div>
    <div class="footer">
      <span class="broken-out">${snapshot.totals.brokenOut} broken out</span>
      <button class="primary" data-action="morning">New morning</button>
    </div>`;
}

function renderMorning() {
  state.screen = "morning";
  state.focused = null;
  const rows = state.morningRows.map((row, index) => `
    <div class="row">
      <input class="brand-input" value="${escapeHtml(row.label)}" data-role="brand" data-index="${index}" aria-label="Brand or category">
      <button type="button" class="quantity" data-role="morning-count" data-index="${index}"
        aria-label="${escapeHtml(row.label || "Category")} morning count: ${row.count}">${row.count}</button>
      <button class="remove" data-action="remove-row" data-index="${index}" aria-label="Remove row">×</button>
    </div>`).join("");
  app.innerHTML = `<section class="morning">${header({ back: true })}
    <h1 class="screen-title">Morning count</h1>
    <div class="rows">${rows}</div>
    <div class="actions">
      <button class="secondary" data-action="add-row">+ Row</button>
      <button class="primary" data-action="save-morning">Save morning</button>
    </div>
  </section>`;
}

function renderSetup(error = "") {
  state.screen = "setup";
  const isLocalPreview = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const defaultEndpoint = state.config?.baseUrl || (isLocalPreview ? location.origin : DEFAULT_SYNC_URL);
  app.innerHTML = `<section class="setup">${header({ back: Boolean(state.snapshot) })}
    <h1 class="screen-title">Pair this r1</h1>
    <p>Enter the temporary six-digit code shown by the Mac mini.</p>
    <form id="setup-form">
      <label for="endpoint">HTTPS service address</label>
      <input id="endpoint" name="endpoint" type="url" value="${escapeHtml(defaultEndpoint)}" required autocomplete="url">
      <label for="code">Pairing code</label>
      <input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code">
      ${error ? `<p>${escapeHtml(error)}</p>` : ""}
      <div class="actions"><span></span><button class="primary" type="submit">Pair</button></div>
    </form>
  </section>`;
}

function renderCarousel() {
  const carousel = state.carousel;
  if (!carousel) return;
  const previous = Math.max(0, carousel.value - 1);
  const next = Math.min(MAX_COUNT, carousel.value + 1);
  app.innerHTML = `<section class="carousel">
    <div class="carousel-label">${escapeHtml(carousel.label || "COUNT")}</div>
    <div class="carousel-number">${previous}</div>
    <div class="carousel-number current">${carousel.value}</div>
    <div class="carousel-number">${next}</div>
    <div class="carousel-help">Turn wheel · press side when done</div>
    <div class="carousel-save">${carousel.saving ? "Saving…" : ""}</div>
  </section>`;
}

function renderCurrentScreen() {
  if (state.carousel) renderCarousel();
  else if (state.screen === "morning") renderMorning();
  else if (state.screen === "setup") renderSetup();
  else renderMain();
}

async function refresh() {
  if (!state.api) return;
  try {
    await cacheSnapshot(await state.api.snapshot());
    state.online = true;
  } catch (error) {
    state.online = false;
    if (!state.snapshot) showToast(error.message);
  }
  renderMain();
}

async function handleApiFailure(error) {
  state.online = false;
  if (error instanceof ApiError && error.snapshot) {
    await cacheSnapshot(error.snapshot);
    showToast(error.status === 409 ? "Changed elsewhere · refreshed" : error.message);
  } else {
    showToast(error.message || "Unable to synchronize");
  }
}

async function breakOut(index) {
  if (state.busy || !state.online) {
    showToast(state.online ? "Please wait" : "Offline · count not changed");
    return;
  }
  const original = state.snapshot;
  const row = original.rows[index];
  if (!row || row.remaining < 1) return;
  state.busy = true;
  const optimistic = structuredClone(original);
  optimistic.rows[index].remaining -= 1;
  optimistic.rows[index].brokenOut += 1;
  optimistic.totals.remaining -= 1;
  optimistic.totals.brokenOut += 1;
  state.snapshot = optimistic;
  renderMain();
  try {
    await cacheSnapshot(await state.api.breakOut(row.label, original.revision));
    state.online = true;
  } catch (error) {
    state.snapshot = original;
    await handleApiFailure(error);
  } finally {
    state.busy = false;
    renderMain();
  }
}

async function correctRemaining(index, value) {
  if (!state.online) {
    showToast("Offline · correction not saved");
    renderMain();
    return;
  }
  const row = state.snapshot.rows[index];
  const remaining = clampCount(value);
  if (!row || remaining === row.remaining) return;
  try {
    await cacheSnapshot(await state.api.correct(row.label, remaining, state.snapshot.revision));
    state.online = true;
  } catch (error) {
    await handleApiFailure(error);
  }
  if (!state.carousel) renderMain();
}

function openCarousel() {
  if (!state.focused) {
    showToast("Tap a number first");
    return;
  }
  const { mode, index } = state.focused;
  const source = mode === "morning" ? state.morningRows[index] : state.snapshot?.rows[index];
  if (!source) return;
  state.carousel = {
    mode,
    index,
    label: source.label,
    value: mode === "morning" ? source.count : source.remaining,
    savedValue: mode === "morning" ? source.count : source.remaining,
    saving: false,
  };
  renderCarousel();
}

async function saveCarousel() {
  const carousel = state.carousel;
  if (!carousel || carousel.mode === "morning" || carousel.value === carousel.savedValue) return;
  carousel.saving = true;
  renderCarousel();
  await correctRemaining(carousel.index, carousel.value);
  if (state.carousel) {
    state.carousel.savedValue = state.snapshot?.rows[carousel.index]?.remaining ?? carousel.value;
    state.carousel.saving = false;
  }
}

async function closeCarousel() {
  const carousel = state.carousel;
  if (!carousel) return;
  if (carousel.mode === "morning") {
    state.morningRows[carousel.index].count = carousel.value;
  } else {
    await saveCarousel();
  }
  const destination = carousel.mode;
  state.carousel = null;
  destination === "morning" ? renderMorning() : renderMain();
}

function turnWheel(direction) {
  if (!state.carousel || state.carousel.saving) return;
  state.carousel.value = stepCarousel(state.carousel.value, direction);
  if (state.carousel.mode === "morning") {
    state.morningRows[state.carousel.index].count = state.carousel.value;
  }
  renderCarousel();
}

async function saveMorning() {
  const counts = state.morningRows.map((row) => ({
    label: row.label.trim(),
    count: clampCount(row.count),
  }));
  if (counts.some((row) => !row.label)) {
    showToast("Every row needs a name");
    return;
  }
  if (!state.online) {
    showToast("Connect before saving");
    return;
  }
  state.busy = true;
  app.classList.add("busy");
  try {
    await cacheSnapshot(await state.api.setMorningCount(counts, state.snapshot?.revision ?? 0));
    state.online = true;
    showToast("Morning count saved");
    renderMain();
  } catch (error) {
    await handleApiFailure(error);
    renderMorning();
  } finally {
    state.busy = false;
    app.classList.remove("busy");
  }
}

app.addEventListener("focusin", (event) => {
  const control = event.target.closest(".quantity");
  if (!control) return;
  app.querySelectorAll(".quantity.focused").forEach((element) => element.classList.remove("focused"));
  state.focused = {
    mode: control.dataset.role === "morning-count" ? "morning" : "main",
    index: Number(control.dataset.index),
  };
  control.classList.add("focused");
});

app.addEventListener("input", (event) => {
  const index = Number(event.target.dataset.index);
  if (event.target.dataset.role === "brand") state.morningRows[index].label = event.target.value;
});

app.addEventListener("submit", async (event) => {
  if (event.target.id !== "setup-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  const config = { baseUrl: String(form.get("endpoint") || "").trim() };
  const code = String(form.get("code") || "").trim();
  try {
    const paired = await HoleCountApi.pair({ ...config, code });
    const api = new HoleCountApi({ ...config, token: paired.token });
    await persistSession(config, paired.token);
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#device=${encodeURIComponent(paired.token)}`
    );
    state.config = config;
    state.api = api;
    state.online = true;
    await cacheSnapshot(paired.snapshot);
    renderMain();
  } catch (error) {
    state.online = false;
    renderSetup(error.message);
  }
});

app.addEventListener("click", async (event) => {
  const quantity = event.target.closest(".quantity");
  if (quantity) {
    quantity.focus({ preventScroll: true });
    showToast("Press side button · turn wheel");
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const index = Number(target.dataset.index);
  if (action === "breakout") await breakOut(index);
  if (action === "morning") {
    state.morningRows = zeroedMorningRows(state.snapshot);
    renderMorning();
  }
  if (action === "add-row") {
    state.morningRows.push({ label: "", count: 0 });
    renderMorning();
  }
  if (action === "remove-row" && state.morningRows.length > 1) {
    state.morningRows.splice(index, 1);
    renderMorning();
  }
  if (action === "save-morning") await saveMorning();
  if (action === "back") renderMain();
  if (action === "settings") {
    if (state.provisioned) showToast("Connected by install QR");
    else renderSetup();
  }
  if (action === "close" && window.closeWebView?.postMessage) window.closeWebView.postMessage("");
});

window.addEventListener("scrollUp", () => turnWheel("up"));
window.addEventListener("scrollDown", () => turnWheel("down"));
window.addEventListener("sideClick", async () => {
  if (Date.now() < state.suppressSideClickUntil) return;
  state.carousel ? await closeCarousel() : openCarousel();
});
window.addEventListener("longPressStart", () => {
  state.suppressSideClickUntil = Date.now() + 1200;
  showToast("Voice commands are reserved for a later R1 test");
});
window.addEventListener("longPressEnd", () => {
  state.suppressSideClickUntil = Date.now() + 500;
});

async function start() {
  app.innerHTML = '<div class="empty">Opening guitar wall…</div>';
  const provisioned = isProvisionedInstallPath(location.pathname);
  const installToken = installTokenFromHash(location.hash);
  const [storedConfig, secureToken, session, cached] = await Promise.all([
    storageGet(STORAGE.endpoint),
    storageGet(STORAGE.token, true),
    storageGet(STORAGE.session),
    storageGet(STORAGE.cache),
  ]);
  const config = provisioned
    ? { baseUrl: location.origin }
    : session?.config || storedConfig || (installToken ? { baseUrl: DEFAULT_SYNC_URL } : null);
  const token = provisioned ? null : installToken || secureToken || session?.token;
  state.provisioned = provisioned;
  state.config = config;
  state.snapshot = cached;
  if (!config?.baseUrl || (!token && !provisioned)) {
    renderSetup();
    return;
  }
  try {
    state.api = new HoleCountApi({ baseUrl: config.baseUrl, token });
  } catch (error) {
    renderSetup(error.message);
    return;
  }
  await refresh();
}

start();
