import { icon } from "./icons.js";
import { say } from "./utilities.js";

const LIMIT = 3;
const SWIPE_THRESHOLD = 45;
const TONES = {
  message: { icon: "info" },
  success: { icon: "success", tone: "gain" },
  warning: { icon: "warning", tone: "warn" },
  error: { icon: "error", tone: "loss", assertive: true },
  loading: { icon: "loading", duration: Infinity },
};

const ms = (name, fallback) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith("ms") ? value : value * 1000;
};

const dwell = (kind, hasAction) => {
  const base = kind === "error" ? ms("--toast-duration-loss", 10000)
    : kind === "warning" ? ms("--toast-duration-warn", 6000)
    : ms("--toast-duration", 4000);
  return hasAction ? Math.max(base, ms("--toast-undo", 8000)) : base;
};

const BURST = 100;
const LINGER = 1000;
const live = { status: null, alert: null };
const coalesce = (queued) => (queued.length > 1 ? [`${queued.length} updates, latest: `, ...queued.at(-1)] : queued[0]);
function announce(id, parts, assertive) {
  const key = assertive ? "alert" : "status";
  if (!live[key]) {
    const node = document.createElement("span");
    node.className = "px-sr-only";
    node.setAttribute("role", key);
    document.body.append(node);
    live[key] = { node, pending: new Map(), timer: 0, linger: 0 };
  }
  const channel = live[key];
  channel.node.textContent = "";
  channel.pending.delete(id);
  channel.pending.set(id, parts);
  if (channel.timer) return;
  channel.timer = setTimeout(() => {
    channel.timer = 0;
    say(channel.node, coalesce([...channel.pending.values()]));
    channel.pending.clear();
    clearTimeout(channel.linger);
    channel.linger = setTimeout(() => { channel.node.textContent = ""; }, LINGER);
  }, BURST);
}

let region = null;
let list = null;
const open = new Map();
let paused = false;
let nextId = 0;

function mount() {
  if (region) return;
  region = document.createElement("section");
  region.className = "px-toaster";
  region.popover = "manual";
  region.setAttribute("role", "region");
  region.setAttribute("aria-label", "Notifications alt+T");
  list = document.createElement("ol");
  list.className = "px-toaster-list";
  list.tabIndex = -1;
  region.append(list);
  document.body.append(region);

  region.addEventListener("pointerenter", () => setPaused(true));
  region.addEventListener("pointerleave", () => setPaused(false));
  region.addEventListener("focusin", () => setPaused(true));
  region.addEventListener("focusout", (event) => { if (!region.contains(event.relatedTarget)) setPaused(false); });
  addEventListener("keydown", (event) => {
    if (event.altKey && event.key.toLowerCase() === "t" && open.size) { event.preventDefault(); list.focus(); }
  });
}

function setPaused(next) {
  if (paused === next) return;
  paused = next;
  for (const entry of open.values()) (next ? hold : release)(entry);
}

function hold(entry) {
  if (entry.timer === null) return;
  clearTimeout(entry.timer);
  entry.timer = null;
  entry.remaining -= Date.now() - entry.startedAt;
}

function release(entry) {
  if (entry.timer !== null || entry.remaining === Infinity) return;
  entry.startedAt = Date.now();
  entry.timer = setTimeout(() => dismiss(entry.id), Math.max(0, entry.remaining));
}

function raise() {
  if (region.matches(":popover-open")) region.hidePopover();
  region.showPopover();
}

function localize(node, lang) {
  if (lang === null) return;
  node.lang = lang;
  try { node.dir = new Intl.Locale(lang).getTextInfo().direction; } catch {}
}

function build(entry, { message, description, action, lang }) {
  const { icon: name, tone } = TONES[entry.kind];
  const node = document.createElement("li");
  node.className = "px-toast";
  if (tone) node.dataset.tone = tone;
  node.innerHTML = `${icon(name)}<div><b>${escape(message)}</b>${description ? `<p>${escape(description)}</p>` : ""}</div>`;
  localize(node.querySelector("div"), lang);

  if (action) {
    const button = document.createElement("button");
    button.className = "px-btn";
    button.dataset.variant = "secondary";
    button.dataset.size = "sm";
    button.textContent = action.label;
    localize(button, lang);
    button.addEventListener("click", () => { action.onClick(); dismiss(entry.id); });
    node.append(button);
  }

  const close = document.createElement("button");
  close.className = "px-toast-close";
  close.setAttribute("aria-label", "Dismiss");
  close.innerHTML = icon("close");
  close.addEventListener("click", () => dismiss(entry.id));
  node.append(close);

  swipeable(node, entry);
  return node;
}

const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function swipeable(node, entry) {
  let start = null;
  node.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    start = { x: event.clientX, y: event.clientY };
    node.setPointerCapture(event.pointerId);
    node.dataset.swiping = "";
    hold(entry);
  });
  const travelled = (event) => {
    const outward = getComputedStyle(node).direction === "rtl" ? -1 : 1;
    return { x: Math.max(0, (event.clientX - start.x) * outward), y: Math.max(0, event.clientY - start.y), outward };
  };
  node.addEventListener("pointermove", (event) => {
    if (!start) return;
    const { x, y, outward } = travelled(event);
    node.style.translate = `${x * outward}px ${y}px`;
  });
  const end = (event) => {
    if (!start) return;
    const { x, y } = travelled(event);
    const travel = Math.max(x, y);
    start = null;
    delete node.dataset.swiping;
    node.style.translate = "";
    if (travel >= SWIPE_THRESHOLD) dismiss(entry.id);
    else if (!paused) release(entry);
  };
  node.addEventListener("pointerup", end);
  node.addEventListener("pointercancel", end);
}

function show(kind, message, options = {}) {
  mount();
  const id = options.id ?? `px-toast-${++nextId}`;
  const existing = open.get(id);
  const entry = existing ?? { id, kind, timer: null, remaining: 0, startedAt: 0 };
  if (existing) hold(existing);
  else while (open.size >= LIMIT) dismiss(open.keys().next().value);

  entry.kind = kind;
  entry.remaining = options.duration ?? TONES[kind].duration ?? dwell(kind, Boolean(options.action));
  const lang = options.lang ?? null;
  const node = build(entry, { ...options, message, lang });
  if (existing) existing.node.replaceWith(node);
  else list.append(node);
  entry.node = node;
  open.set(id, entry);
  raise();

  const spoken = (text) => ({ text, lang });
  const groups = [message && [spoken(message)], options.description && [spoken(options.description)], options.action && [spoken(options.action.label), " available"]];
  announce(id, groups.filter(Boolean).flatMap((group, i) => (i ? [". ", ...group] : group)), TONES[kind].assertive);
  if (!paused) release(entry);
  return id;
}

async function dismiss(id) {
  const entry = open.get(id);
  if (!entry) return id;
  hold(entry);
  open.delete(id);
  entry.node.dataset.state = "closing";
  await Promise.allSettled(entry.node.getAnimations().map((animation) => animation.finished));
  entry.node.remove();
  if (!open.size && region.matches(":popover-open")) region.hidePopover();
  return id;
}

const resolve = (value, data) => (typeof value === "function" ? value(data) : value);

/** `toast("Saved")` and the four tones, plus `toast.loading` and `toast.promise`, mirroring the
    sonner API so a surface reads the same on either layer. Options: `description`,
    `action: { label, onClick }`, `duration`, `id` to replace a toast already on screen —
    which is how a loading toast becomes the success or the error it resolved into — and `lang`
    naming the language of the words the caller hands over, since the toaster and its live region
    both sit at the end of `<body>` and would otherwise read them as the document's. The drawn
    words also take the direction that language is written in, read from the tag itself, so
    `ar` lays out right to left and `ar-Latn` left to right; the toaster and its Dismiss keep
    the document's.

    `toast.promise` returns the toast id rather than the work: the promise is the caller's to
    await, catch, and branch on, and this only narrates it. */
export const toast = Object.assign((message, options) => show("message", message, options), {
  message: (message, options) => show("message", message, options),
  success: (message, options) => show("success", message, options),
  warning: (message, options) => show("warning", message, options),
  error: (message, options) => show("error", message, options),
  loading: (message, options) => show("loading", message, options),
  dismiss,
  promise(work, { loading, success, error, ...options } = {}) {
    const id = show("loading", loading, options);
    const settled = typeof work === "function" ? work() : work;
    settled.then(
      (data) => show("success", resolve(success, data), { ...options, id }),
      (reason) => show("error", resolve(error, reason), { ...options, id }),
    );
    return id;
  },
});
