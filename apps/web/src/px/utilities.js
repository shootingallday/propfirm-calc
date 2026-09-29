import { readLocale } from "./locale.js";

/** Escape caller text on its way into markup built as a string. `&<>"` covers both positions
    the layer writes into — inside a double-quoted attribute and inside element text — so one
    call is enough wherever the value lands. */
export const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const MAC = /mac|iphone|ipad/i.test(globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform ?? "");

const KEYS = {
  mod: MAC ? ["⌘", "Command"] : ["Ctrl", "Control"],
  ctrl: MAC ? ["⌃", "Control"] : ["Ctrl", "Control"],
  alt: MAC ? ["⌥", "Option"] : ["Alt", "Alt"],
  shift: MAC ? ["⇧", "Shift"] : ["Shift", "Shift"],
  enter: MAC ? ["↩", "Enter"] : ["Enter", "Enter"],
  escape: MAC ? ["⎋", "Escape"] : ["Esc", "Escape"],
  backspace: MAC ? ["⌫", "Backspace"] : ["Backspace", "Backspace"],
  tab: MAC ? ["⇥", "Tab"] : ["Tab", "Tab"],
  up: ["↑", "Up arrow"],
  down: ["↓", "Down arrow"],
  left: ["←", "Left arrow"],
  right: ["→", "Right arrow"],
};

/** Was the platform's primary accelerator held for this event — Command on a Mac, Control
    everywhere else? The same platform test the `mod` chip draws, so a shortcut and the chip
    advertising it can never disagree about which key they mean. */
export const modKey = (event) => (MAC ? event.metaKey : event.ctrlKey);

/** Fill every `.px-keys[data-keys="Mod+Shift+K"]` with platform chips, replacing whatever the
    page authored as its no-script fallback. role="img" plus the spoken names makes the group
    read as one shortcut instead of a run of symbols. */
export function mountKeys(root = document) {
  for (const group of root.querySelectorAll(".px-keys[data-keys]")) {
    const parts = group.dataset.keys.split("+").map((key) => KEYS[key.trim().toLowerCase()] ?? [key.trim(), key.trim()]);
    group.replaceChildren(...parts.map(([glyph]) => {
      const chip = document.createElement("kbd");
      chip.className = "px-kbd";
      chip.textContent = glyph;
      return chip;
    }));
    group.setAttribute("role", "img");
    group.setAttribute("aria-label", parts.map(([, name]) => name).join(" "));
  }
}

/** The language a page element's text is read in, as the nearest region that declares one spells
    it — including the empty string, which is how HTML writes "unknown" and is not the same as
    saying nothing. Null when the only region is the document, which every node inherits already
    and which nothing should pin. */
export const langOf = (element) => {
  const region = element?.closest("[lang]");
  return region && region !== document.documentElement ? region.lang : null;
};

/** Write one announcement into a live region, which sits at the end of `<body>` and so speaks
    the document's language. A plain string is the module's own English and keeps it; a
    `{ text, lang }` part is text the module took from the page, and any language at all — a tag,
    or the empty string for one the page marks unknown — wraps it so that it keeps its own. A
    single `lang` on the region would put one of the two under the other's voice. */
export function say(live, parts) {
  live.replaceChildren(...parts.map((part) => {
    if (typeof part === "string") return part;
    if (part.lang === null || part.lang === undefined) return part.text;
    const span = document.createElement("span");
    span.lang = part.lang;
    span.textContent = part.text;
    return span;
  }));
}

let uid = 0;
/** Give an element an id an `aria-*` reference can point at, keeping one it already has. */
export const identify = (element, prefix) => (element.id ||= `${prefix}-${++uid}`);

const words = new Map();
/** Name a control from a word a module wrote and a name element the page owns, through
    `aria-labelledby`. `aria-label` takes text, not markup, so one such name would put both parts
    under a single language; a reference to each part lets each keep its own. The word sits
    hidden at the end of `<body>`, so it reads under the document's language whatever region the
    control is drawn in, and one element per word serves every control that says it. */
export function nameFrom(control, word, name) {
  let own = words.get(word);
  if (!own) {
    own = document.createElement("span");
    own.hidden = true;
    own.textContent = word;
    document.body.append(own);
    words.set(word, own);
  }
  control.setAttribute("aria-labelledby", `${identify(own, "px-word")} ${identify(name, "px-name")}`);
}

let status = null;
function announce(...parts) {
  if (!status) {
    status = document.createElement("span");
    status.className = "px-sr-only";
    status.setAttribute("role", "status");
    document.body.append(status);
  }
  say(status, parts);
}

const resets = new WeakMap();

function textToCopy(button) {
  if (button.dataset.copy !== undefined) return button.dataset.copy;
  return document.querySelector(button.dataset.copyTarget)?.innerText.trim() ?? "";
}

/** Delegate clipboard writes for `[data-copy]` (a literal) and `[data-copy-target]` (a
    selector), so server-rendered markup needs no per-button wiring. A `data-copied-label` is
    the page's own words and is announced in the button's language; the fallback is this
    module's English and keeps the document's. */
export function mountCopy(root = document) {
  root.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-copy], [data-copy-target]");
    if (!button) return;
    clearTimeout(resets.get(button));
    const glyph = button.querySelector("px-icon[data-morph]");
    try {
      await navigator.clipboard.writeText(textToCopy(button));
      button.dataset.copied = "true";
      glyph?.setAttribute("name", "check");
      const copied = button.dataset.copiedLabel;
      announce(copied === undefined ? "Copied" : { text: copied, lang: langOf(button) });
    } catch {
      button.dataset.copied = "error";
      announce("Copy failed");
    }
    resets.set(button, setTimeout(() => {
      delete button.dataset.copied;
      glyph?.setAttribute("name", "copy");
      announce("");
    }, 1600));
  });
}

let tooltip = null;
function tooltipNode() {
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "px-tooltip";
    tooltip.popover = "hint";
    tooltip.setAttribute("aria-hidden", "true");
    document.body.append(tooltip);
    addEventListener("scroll", hideTooltip, true);
  }
  return tooltip;
}

function hideTooltip() {
  if (tooltip?.matches(":popover-open")) tooltip.hidePopover();
}

function showTooltip(anchor, text) {
  const node = tooltipNode();
  const lang = langOf(anchor);
  node.textContent = text;
  node.dir = getComputedStyle(anchor).direction;
  if (lang === null) node.removeAttribute("lang");
  else node.lang = lang;
  if (!node.matches(":popover-open")) node.showPopover();
  const from = anchor.getBoundingClientRect();
  const size = node.getBoundingClientRect();
  const above = from.top - size.height - 8 >= 0;
  node.style.top = `${above ? from.top - size.height - 8 : from.bottom + 8}px`;
  node.style.left = `${Math.min(Math.max(4, from.left + from.width / 2 - size.width / 2), innerWidth - size.width - 4)}px`;
}

const clipped = (el) => el.scrollWidth > el.clientWidth + 1;

/** Give every `.px-truncate` its tooltip, but only while its text is genuinely clipped. The
    tabindex is that state: it is what lets a keyboard reach the tooltip, and removing it when
    the text fits keeps unclipped labels out of the tab order. One tooltip node serves every
    label, so each showing takes the direction and language of the label it is drawing; a label
    that declares neither leaves the node to inherit the document's. */
export function mountTruncate(root = document) {
  const nodes = [...root.querySelectorAll(".px-truncate")];
  const sync = (el) => (clipped(el) ? el.setAttribute("tabindex", "0") : el.removeAttribute("tabindex"));
  const show = (event) => {
    const el = event.currentTarget;
    if (clipped(el)) showTooltip(el, el.textContent.trim());
  };
  for (const el of nodes) {
    sync(el);
    el.addEventListener("pointerenter", show);
    el.addEventListener("focus", show);
    el.addEventListener("pointerleave", hideTooltip);
    el.addEventListener("blur", hideTooltip);
  }
  const observer = new ResizeObserver((entries) => entries.forEach((entry) => sync(entry.target)));
  nodes.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}

const cutters = new Map();
const apart = /^[\p{Script=Common}\p{Script=Inherited}\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]*$/u;

/** The pieces a value can be carried in, cut in the reader's locale. A script that joins or
    reorders its letters is drawn from the run they sit in, and a letter in a box of its own is not
    in that run any more, so those values travel as whole words. Everywhere else the piece is the
    grapheme cluster, which keeps a letter and the marks above it together whatever it is made of. */
export function segmentValue(text, locale = "en-US") {
  const granularity = apart.test(text) ? "grapheme" : "word";
  const key = `${locale} ${granularity}`;
  let cutter = cutters.get(key);
  if (!cutter) cutters.set(key, (cutter = new Intl.Segmenter(locale, { granularity })));
  return [...cutter.segment(text)].map((part) => part.segment);
}

/** How two cut values line up, as new index to old index. The longest run they have in common is
    matched first and the parts either side of it are matched the same way, so the run travels
    together: `USD` crosses the slash as three characters that were beside each other and still are,
    rather than being picked apart to collect one more match from elsewhere in the value. */
export function pairSegments(from, to, kept = new Map(), at = { from: 0, to: 0 }) {
  const runs = Array.from({ length: from.length + 1 }, () => new Array(to.length + 1).fill(0));
  let best = { length: 0, from: 0, to: 0 };
  for (let i = 0; i < from.length; i++)
    for (let j = 0; j < to.length; j++)
      if (from[i] === to[j]) {
        const length = (runs[i + 1][j + 1] = runs[i][j] + 1);
        if (length > best.length) best = { length, from: i + 1 - length, to: j + 1 - length };
      }
  if (!best.length) return kept;
  for (let n = 0; n < best.length; n++) kept.set(at.to + best.to + n, at.from + best.from + n);
  pairSegments(from.slice(0, best.from), to.slice(0, best.to), kept, at);
  pairSegments(from.slice(best.from + best.length), to.slice(best.to + best.length), kept, { from: at.from + best.from + best.length, to: at.to + best.to + best.length });
  return kept;
}

const still = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const runtime = (el) => parseFloat(getComputedStyle(el).transitionDuration) * 1000 || 0;
const spot = (rect, frame, rtl) => ({ inline: rtl ? frame.right - rect.right : rect.left - frame.left, block: rect.top - frame.top });

/** Wire one `.px-morph`: a value becoming another value in place, carrying the characters the two
    share. Both values are cut into pieces and paired by their longest common run, so a shared piece
    keeps its own element and travels to its new place, while what leaves is pinned where it stood
    and lifts away as what arrives rises into its place. The box travels between the two measured
    widths, so the line around it is never handed a new width in one frame.

    The reservation is every value this site can hold: the lines of a `.px-morph-reserve` written in
    the markup, which hold the space before any script runs, and any `reserve` values only the script
    knows. The space taken is the widest of them, drawn out of sight in the pieces the value itself
    is drawn in, since a run of boxes and the same run of text do not measure the same to the last
    sixty-fourth of a pixel. The travel then happens inside a reservation that never changes and
    nothing beside the value moves. Reserve nothing and the box is the space, as it was.

    `data-direction="down"` is the author's to set and flips both halves, for a value that belongs
    below the one it replaces. The new value is simply there when the reader asks for stillness, and
    equally when the layer's durations are zeroed under them.

    It is for one value becoming another, never for a state becoming a different state — a status
    wants `.px-tag` and its colour, not a smooth swap that hides the change. The pieces are held out
    of the accessibility tree and the value is carried once beside them, so a reader is told the new
    value rather than spelled it and the outgoing one is never read. */
export function mountMorph(root, { reserve } = {}) {
  const px = readLocale();
  const authored = root.querySelector(":scope > span:not(.px-morph-reserve)")?.textContent ?? "";
  const reserved = [...(root.querySelector(":scope > .px-morph-reserve")?.children ?? [])].map((line) => line.textContent).concat(reserve ?? []);
  root.classList.add("px-morph");
  const reading = document.createElement("span");
  reading.className = "px-sr-only";
  const box = document.createElement("span");
  box.className = "px-morph-box";
  const rail = document.createElement("span");
  rail.className = "px-morph-rail";
  rail.setAttribute("aria-hidden", "true");
  /* A piece is an inline block, which carries no direction of its own, so a run of them inside a
     page written the other way would be laid out in reverse. `auto` resolves the run from the value
     it draws rather than from the page around it. */
  rail.dir = "auto";
  box.append(rail);
  const piece = (text, phase) => {
    const span = document.createElement("span");
    span.textContent = text;
    span.dataset.morph = phase;
    return span;
  };
  const parts = [reading];
  if (reserved.length) {
    const space = document.createElement("span");
    space.className = "px-morph-reserve";
    space.setAttribute("aria-hidden", "true");
    space.dir = "auto";
    for (const value of reserved) {
      const line = document.createElement("span");
      line.append(...segmentValue(value, px.locale).map((text) => piece(text, "held")));
      space.append(line);
    }
    parts.push(space);
  }
  root.replaceChildren(...parts, box);

  let shown = "";
  let settling;
  let releasing;

  const draw = (text, cut, kept, was, arriving) => {
    rail.replaceChildren(
      ...cut.map((part, index) => {
        const from = kept.get(index);
        if (from === undefined) return piece(part, arriving);
        const node = was[from];
        node.dataset.morph = "held";
        node.removeAttribute("style");
        return node;
      }),
    );
    box.style.inlineSize = "";
    reading.textContent = text;
    shown = text;
  };

  const set = (text) => {
    if (text === shown) return;
    clearTimeout(settling);
    cancelAnimationFrame(releasing);
    for (const node of [...rail.children]) if (node.dataset.morph === "out") node.remove();
    const was = [...rail.children];
    const cut = segmentValue(text, px.locale);
    const kept = pairSegments(was.map((node) => node.textContent), cut);
    /* A value arriving where there was none is not one value becoming another, so it is simply
       drawn: a count reading its first step has nothing to travel from. */
    if (!shown || still() || !runtime(box)) return draw(text, cut, kept, was, "held");

    const rtl = getComputedStyle(box).direction === "rtl";
    const rise = root.dataset.direction === "down" ? 1 : -1;
    const outline = box.getBoundingClientRect();
    const stood = new Map(was.map((node) => [node, spot(node.getBoundingClientRect(), outline, rtl)]));
    const taken = new Set(kept.values());
    const leaving = was.filter((_, index) => !taken.has(index));
    draw(text, cut, kept, was, "in");
    for (const node of leaving) node.dataset.morph = "out";
    rail.append(...leaving);

    const moving = [...rail.children];
    for (const node of moving) {
      node.dataset.settling = "";
      node.removeAttribute("style");
    }
    box.dataset.settling = "";
    const grown = box.getBoundingClientRect().width;
    box.style.inlineSize = `${outline.width}px`;
    const frame = box.getBoundingClientRect();
    for (const node of moving) {
      const from = stood.get(node);
      if (node.dataset.morph === "in") {
        node.style.opacity = "0";
        node.style.scale = "0.85";
        node.style.translate = `0 ${-rise * 0.5}em`;
      } else if (node.dataset.morph === "out") {
        node.style.insetInlineStart = `${from.inline}px`;
        node.style.top = `${from.block}px`;
        node.style.translate = "none";
      } else {
        const now = spot(node.getBoundingClientRect(), frame, rtl);
        const travel = from.inline - now.inline;
        node.style.translate = `${rtl ? -travel : travel}px ${from.block - now.block}px`;
      }
    }

    void box.offsetWidth;
    releasing = requestAnimationFrame(() => {
      delete box.dataset.settling;
      box.style.inlineSize = `${grown}px`;
      for (const node of moving) {
        delete node.dataset.settling;
        if (node.dataset.morph !== "out") {
          node.style.translate = "";
          node.style.opacity = "";
          node.style.scale = "";
        } else {
          node.style.opacity = "0";
          node.style.scale = "0.85";
          node.style.translate = `0 ${rise * 0.5}em`;
        }
      }
      settling = setTimeout(() => {
        box.style.inlineSize = "";
        for (const node of [...rail.children]) {
          if (node.dataset.morph === "out") node.remove();
          else node.dataset.morph = "held";
        }
      }, runtime(box));
    });
  };

  set(authored);
  return { set, value: () => shown };
}
