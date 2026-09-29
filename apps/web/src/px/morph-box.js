const boxes = new WeakMap();
const riding = new Map();
const skipped = new Set(["SCRIPT", "STYLE", "TEMPLATE", "LINK", "META"]);
const blockFlow = new Set(["block", "flow-root", "list-item"]);
const placed = new Set(["absolute", "fixed"]);
const contained = new Set(["flex", "inline-flex", "grid", "inline-grid", "flow-root"]);
const px = (value) => parseFloat(value) || 0;
const near = (a, b) => Math.abs(a - b) < 0.5;
const put = (node, style) => (style === null ? node.removeAttribute("style") : node.setAttribute("style", style));
const moved = (offset) => !near(offset.x, 0) || !near(offset.y, 0);
const replaced = new Set(["img", "video", "canvas", "iframe", "embed", "object", "input", "textarea", "select", "svg", "picture"]);
const clear = (colour) => { const channels = colour.match(/[\d.]+/g) ?? []; return channels.length === 4 && !Number(channels[3]); };
const drawn = (look) => look.content !== "none" && look.content !== "normal";
const hollow = (node) => {
  if (node.hasChildNodes() || replaced.has(node.localName)) return false;
  const look = getComputedStyle(node);
  return clear(look.backgroundColor) && look.backgroundImage === "none" && look.boxShadow === "none" && look.outlineStyle === "none" &&
    ["Top", "Right", "Bottom", "Left"].every((side) => !px(look[`border${side}Width`])) && !drawn(getComputedStyle(node, "::before")) && !drawn(getComputedStyle(node, "::after"));
};

export const STEPS = 30;

export const curveOf = (easing) => {
  const points = (easing.match(/linear\((.*)\)/)?.[1] ?? "0, 1").split(",").map(parseFloat);
  const last = points.length - 1;
  return (t) => {
    const at = Math.min(Math.max(t, 0), 1) * last;
    const low = Math.min(Math.floor(at), last - 1);
    return points[low] + (points[low + 1] - points[low]) * (at - low);
  };
};

export const speeds = (ease) => {
  const speed = Array.from({ length: STEPS + 1 }, (_, i) => Math.abs(ease(Math.min((i + 0.5) / STEPS, 1)) - ease(Math.max((i - 0.5) / STEPS, 0))));
  const top = Math.max(...speed) || 1;
  return speed.map((value, i) => (i === 0 || i === STEPS ? 0 : value / top));
};

export function springTiming(el, spring = "smooth") {
  const style = getComputedStyle(el);
  return {
    duration: px(style.getPropertyValue(`--px-spring-${spring}-duration`)),
    easing: style.getPropertyValue(`--px-spring-${spring}`).trim() || "linear",
  };
}

function around(el) {
  const levels = [];
  for (let node = el; node.parentElement && node !== document.body; node = node.parentElement) {
    if (node !== el && boxes.has(node)) {
      levels.unshift({ node, siblings: [], enclosing: true });
      break;
    }
    levels.unshift({ node, siblings: [...node.parentElement.children].filter((one) => one !== node && !skipped.has(one.tagName)) });
  }
  return levels;
}

const rects = (nodes) => new Map(nodes.map((node) => [node, node.getBoundingClientRect()]));

export function mountMorphBox(el, { spring = "smooth", timing = () => springTiming(el, spring), stretch = () => 0 } = {}) {
  boxes.get(el)?.stop();
  const state = { size: null, width: 0, flight: null, seen: new Map(), hold: null, unclipped: new Map() };

  const read = () => {
    const style = getComputedStyle(el);
    const frame = style.boxSizing === "border-box" ? { width: 0, height: 0 } : {
      width: px(style.paddingInlineStart) + px(style.paddingInlineEnd) + px(style.borderInlineStartWidth) + px(style.borderInlineEndWidth),
      height: px(style.paddingBlockStart) + px(style.paddingBlockEnd) + px(style.borderBlockStartWidth) + px(style.borderBlockEndWidth),
    };
    return { width: px(style.inlineSize) + frame.width, height: px(style.blockSize) + frame.height };
  };
  const scaled = () => {
    const look = getComputedStyle(el);
    const matrix = new DOMMatrix(look.transform === "none" ? undefined : look.transform);
    const [x, y = x] = look.scale === "none" ? [1] : look.scale.split(" ").map(Number);
    return { x: Math.hypot(matrix.a, matrix.b) * x || 1, y: Math.hypot(matrix.c, matrix.d) * y || 1 };
  };
  const extent = (child, scale) => {
    const rect = child.getBoundingClientRect();
    const style = getComputedStyle(child);
    return { width: rect.width / scale.x + px(style.marginInlineStart) + px(style.marginInlineEnd), height: rect.height / scale.y + px(style.marginBlockStart) + px(style.marginBlockEnd) };
  };
  const boxed = (node) => [...node.children].flatMap((child) => (getComputedStyle(child).display === "contents" ? boxed(child) : [child]));
  const measured = (scale = scaled()) => new Map(boxed(el).map((child) => [child, extent(child, scale)]));
  const unchanged = (scale = scaled()) =>
    state.seen.size === boxed(el).length &&
    ![...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()) &&
    boxed(el).every((child) => {
      const was = state.seen.get(child);
      const now = extent(child, scale);
      return was && near(was.width, now.width) && near(was.height, now.height);
    });
  const hold = (size) => {
    el.style.boxSizing = "border-box";
    el.style.inlineSize = `${size.width}px`;
    el.style.blockSize = `${size.height}px`;
  };

  const restore = (flight) => {
    for (const animation of flight.animations) animation.cancel();
    for (const one of flight.riders) riding.get(one) > 1 ? riding.set(one, riding.get(one) - 1) : riding.delete(one);
    put(el, flight.style);
    for (const [node, style] of flight.pinned) put(node, style);
    if (flight.next) put(flight.next.node, flight.next.style);
  };
  const clipped = (one) => {
    const look = getComputedStyle(one);
    return (look.overflowX !== "visible" || look.overflowY !== "visible") && contained.has(look.display) && one.scrollTop === 0 && one.scrollLeft === 0 && one.scrollHeight <= one.clientHeight && one.scrollWidth <= one.clientWidth;
  };
  const unclip = (one) => {
    const look = getComputedStyle(one);
    const reach = look.boxShadow === "none" ? 0 : 4;
    const corners = [look.borderTopLeftRadius, look.borderTopRightRadius, look.borderBottomRightRadius, look.borderBottomLeftRadius].map((radius) => `calc(${radius.split(" ")[0]} + ${reach}px)`);
    state.unclipped.set(one, one.getAttribute("style"));
    one.style.overflow = "visible";
    one.style.clipPath = `inset(-${reach}px round ${corners.join(" ")})`;
  };
  const reclip = () => {
    for (const [one, style] of state.unclipped) put(one, style);
    state.unclipped.clear();
  };
  const settle = (flight) => {
    if (state.flight !== flight) return;
    restore(flight);
    reclip();
    delete el.dataset.morphing;
    state.flight = null;
  };

  const seal = (grows, opens = {}) => {
    const look = getComputedStyle(el);
    const reach = look.boxShadow === "none" ? 0 : 4;
    const rtl = look.direction === "rtl";
    const out = [reach, grows.width && !rtl ? 0 : reach, grows.height ? 0 : reach, grows.width && rtl ? 0 : reach].map((side) => `${-side}px`);
    const corners = [look.borderTopLeftRadius, look.borderTopRightRadius, look.borderBottomRightRadius, look.borderBottomLeftRadius].map((radius) => radius.split(" ")[0]);
    el.style.clipPath = `inset(${out.join(" ")} round ${corners.join(" ")})`;
    if (opens.width) el.style.overflowX = "clip";
    if (opens.height) el.style.overflowY = "clip";
  };

  const pause = (style, size) => {
    hold(size);
    seal({ width: true, height: true });
    el.dataset.morphing = "";
    const frame = requestAnimationFrame(() => {
      state.hold.frame = requestAnimationFrame(() => {
        state.hold = null;
        put(el, style);
        delete el.dataset.morphing;
        change(true);
      });
    });
    state.hold = { frame, style };
  };
  const retarget = () => {
    const flight = state.flight;
    const now = read();
    if (!flight.grows.width) now.width = state.size.width;
    if (!flight.grows.height) now.height = state.size.height;
    restore(flight);
    state.flight = null;
    state.size = now;
    pause(flight.style, now);
  };

  const change = (force = false) => {
    if (state.hold) return;
    const width = innerWidth;
    if (!state.size) {
      state.size = read();
      state.width = width;
      state.seen = measured();
      return;
    }
    const reshaped = !near(width, state.width);
    if (!force && !reshaped && unchanged()) return;
    if (state.flight) return reshaped ? (settle(state.flight), change(true)) : retarget();
    const now = read();
    if (!reshaped && near(now.width, state.size.width) && near(now.height, state.size.height)) {
      state.seen = measured();
      return;
    }

    const levels = around(el);
    const kids = [...el.children].filter((kid) => !skipped.has(kid.tagName));
    const nodes = [...levels.flatMap(({ node, siblings }) => [node, ...siblings]), ...kids];
    const style = el.getAttribute("style");
    const from = state.size;
    hold(from);
    const before = rects(nodes);
    put(el, style);
    const to = read();
    const after = rects(nodes);
    const look = getComputedStyle(el);
    const rows = look.display.endsWith("grid") ? look.gridTemplateRows : null;
    state.size = to;
    state.width = width;
    state.seen = measured();

    const { duration, easing } = timing();
    const grows = { width: !near(from.width, to.width), height: !near(from.height, to.height) };
    if (reshaped || !duration || (!grows.width && !grows.height)) return;

    const carried = [];
    let above = { x: 0, y: 0 };
    for (const { node, siblings, enclosing } of levels) {
      const offset = (one) => {
        const edge = getComputedStyle(one).direction === "rtl" ? "right" : "left";
        return { one, x: before.get(one)[edge] - after.get(one)[edge] - above.x, y: before.get(one).y - after.get(one).y - above.y };
      };
      for (const one of siblings.map(offset)) if (moved(one) && !hollow(one.one)) carried.push(one);
      const self = offset(node);
      if (moved(self)) {
        if (!enclosing) carried.push(self);
        above = { x: above.x + self.x, y: above.y + self.y };
      }
    }

    const inside = kids
      .map((kid) => {
        const edge = getComputedStyle(kid).direction === "rtl" ? "right" : "left";
        return { one: kid, x: before.get(kid)[edge] - after.get(kid)[edge] - above.x, y: before.get(kid).y - after.get(kid).y - above.y };
      })
      .filter((one) => moved(one) && !riding.has(one.one));

    const exposed = carried.filter(({ one }) => !state.unclipped.has(one) && clipped(one));
    if (exposed.length) {
      for (const { one } of exposed) unclip(one);
      state.size = from;
      return pause(style, from);
    }

    const held = carried.length || levels[0]?.enclosing;
    const flight = { style, grows, animations: [], pinned: new Map(), next: null, riders: carried.map(({ one }) => one) };
    const lean = stretch({ from, to });
    const options = lean ? { duration, easing: "linear" } : { duration, easing };
    const ease = curveOf(easing);
    const pace = speeds(ease);
    const along = Math.abs(to.width - from.width) / Math.max(to.width, from.width, 1) >= Math.abs(to.height - from.height) / Math.max(to.height, from.height, 1) ? "width" : "height";
    const progress = (axis) => (lean ? pace.map((speed, i) => ease(i / STEPS) + (axis === along ? lean * speed : 0)) : [0, 1]);
    const through = { width: progress("width"), height: progress("height") };
    const size = (axis) => through[axis].map((at) => from[axis] + (to[axis] - from[axis]) * at);
    const computed = getComputedStyle(el);
    const frames = {};
    if (grows.height) frames.blockSize = size("height").map((value) => `${value}px`);
    if (grows.width) frames.inlineSize = size("width").map((value) => `${value}px`);
    if (held && grows.height) {
      let base = px(computed.marginBlockEnd);
      const next = el.nextElementSibling;
      if (next && blockFlow.has(getComputedStyle(el.parentElement).display) && !placed.has(getComputedStyle(next).position)) {
        base = next.getBoundingClientRect().top - after.get(el).top - to.height;
        flight.next = { node: next, style: next.getAttribute("style") };
        next.style.marginBlockStart = "0px";
      }
      frames.marginBlockEnd = size("height").map((value) => `${base + to.height - value}px`);
    }
    if (held && grows.width) {
      const base = px(computed.marginInlineEnd);
      frames.marginInlineEnd = size("width").map((value) => `${base + to.width - value}px`);
    }
    if (grows.width)
      for (const child of el.children) {
        flight.pinned.set(child, child.getAttribute("style"));
        child.style.inlineSize = `${child.getBoundingClientRect().width}px`;
        child.style.flexShrink = "0";
      }
    if (grows.height && computed.display.endsWith("grid")) el.style.gridTemplateRows = computed.gridTemplateRows;
    edits.takeRecords();

    el.style.boxSizing = "border-box";
    seal(grows, { width: to.width > from.width, height: to.height > from.height });
    if (rows && grows.height) el.style.gridTemplateRows = rows;
    el.dataset.morphing = "";
    const box = el.animate(frames, options);
    flight.animations.push(box);
    for (const one of flight.riders) riding.set(one, (riding.get(one) ?? 0) + 1);
    for (const { one, x, y } of [...carried, ...inside]) {
      const composite = getComputedStyle(one).translate === "none" ? "replace" : "add";
      flight.animations.push(one.animate({ translate: through.width.map((at, i) => `${x * (1 - at)}px ${y * (1 - through.height[i])}px`) }, { ...options, composite }));
    }
    const start = document.timeline.currentTime;
    for (const animation of flight.animations) animation.startTime = start;
    state.flight = flight;
    box.onfinish = () => {
      if (state.flight !== flight) return;
      settle(flight);
      const now = read();
      if (!near(now.width, to.width) || !near(now.height, to.height)) pause(style, to);
    };
  };

  const sizes = new ResizeObserver(() => {
    if (state.flight || state.hold || !state.size) return;
    state.size = read();
    state.width = innerWidth;
    state.seen = measured();
  });
  const edits = new MutationObserver((records) => {
    if (records.some((record) => record.type !== "attributes" || record.target !== el)) change();
  });
  sizes.observe(el);
  edits.observe(el, { childList: true, characterData: true, attributes: true, subtree: true });
  change();

  const stop = () => {
    sizes.disconnect();
    edits.disconnect();
    if (state.hold) {
      cancelAnimationFrame(state.hold.frame);
      put(el, state.hold.style);
      delete el.dataset.morphing;
      state.hold = null;
    }
    if (state.flight) settle(state.flight);
    reclip();
    if (boxes.get(el) === handle) boxes.delete(el);
  };
  const handle = { stop };
  boxes.set(el, handle);
  return handle;
}
