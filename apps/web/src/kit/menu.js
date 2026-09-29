import { settle } from "./overlay.js";
import { mountMorphBox, springTiming } from "./morph-box.js";

const openerOf = new WeakMap();
const returnTo = new WeakMap();
const subOf = new WeakMap();
const trails = new WeakMap();
const sliding = new WeakMap();
let typed = "";
let typedAt = 0;
let pressTimer = 0;

const own = (menu) => [...menu.querySelectorAll('[role^="menuitem"]')].filter((item) => item.closest(".ui-menu") === menu && !item.closest("[hidden], [inert]"));
const isRtl = (el) => getComputedStyle(el).direction === "rtl";
const subMenus = (menu) => [...menu.querySelectorAll(".ui-menu-sub")].filter((sub) => sub.closest(".ui-menu") === menu).map((sub) => sub.querySelector(".ui-menu"));

function focusItem(menu, item) {
  if (!item) return;
  own(menu).forEach((other) => { other.tabIndex = other === item ? 0 : -1; });
  item.focus();
}

function step(menu, delta) {
  const list = own(menu);
  const from = list.indexOf(document.activeElement);
  focusItem(menu, list[(from + delta + list.length) % list.length]);
}

function typeahead(menu, key) {
  const now = Date.now();
  typed = now - typedAt > 1000 ? key : typed + key;
  typedAt = now;
  const list = own(menu);
  const from = list.indexOf(document.activeElement) + (typed.length > 1 ? 0 : 1);
  const rotated = [...list.slice(from), ...list.slice(0, from)];
  focusItem(menu, rotated.find((item) => item.textContent.trim().toLowerCase().startsWith(typed)));
}

function open(menu, where = "first", at) {
  menu.showPopover({ source: openerOf.get(menu) });
  settle(menu);
  if (at) {
    const box = menu.getBoundingClientRect();
    const x = isRtl(menu) ? at.x - box.width : at.x;
    menu.style.left = `${Math.max(0, Math.min(x, innerWidth - box.width))}px`;
    menu.style.top = `${Math.max(0, Math.min(at.y, innerHeight - box.height))}px`;
  }
  if (where === "none") return;
  const list = own(menu);
  focusItem(menu, where === "last" ? list.at(-1) : list[0]);
}

const viewsOf = (menu) => menu.querySelector(":scope > .ui-menu-views");
const viewOf = (menu, name) => [...viewsOf(menu).children].find((view) => view.dataset.view === name);

function showView(menu, name, forward) {
  const trail = trails.get(menu);
  const from = trail.at(-1);
  const leaving = viewOf(menu, from);
  const arriving = viewOf(menu, name);
  if (!leaving || !arriving || leaving === arriving) return;
  if (forward) trail.push(name);
  else trail.pop();
  const { duration, easing } = springTiming(menu, "smooth");
  const drawn = getComputedStyle(leaving);
  const ghost = duration ? leaving.cloneNode(true) : null;
  for (const animation of sliding.get(menu) ?? []) animation.cancel();
  menu.querySelectorAll(":scope > [data-view-ghost]").forEach((old) => old.remove());
  if (ghost) {
    for (const node of [ghost, ...ghost.querySelectorAll("[id]")]) node.removeAttribute("id");
    ghost.removeAttribute("data-view");
    ghost.setAttribute("data-view-ghost", "");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    Object.assign(ghost.style, { position: "absolute", left: `${leaving.offsetLeft}px`, top: `${leaving.offsetTop}px`, inlineSize: `${leaving.offsetWidth}px`, margin: "0", pointerEvents: "none", translate: drawn.translate, opacity: drawn.opacity });
  }
  leaving.hidden = true;
  arriving.hidden = false;
  const target = forward ? own(menu).find((item) => !item.hasAttribute("data-view-back")) : arriving.querySelector(`[data-view-to="${CSS.escape(from)}"]`);
  focusItem(menu, target ?? own(menu)[0]);
  if (!ghost) return;
  const sign = (forward ? 1 : -1) * (isRtl(menu) ? -1 : 1);
  menu.append(ghost);
  menu.dataset.sliding = "";
  const options = { duration, easing };
  const out = ghost.animate([{}, { opacity: 0, offset: 0.4 }, { opacity: 0, translate: `${-sign * 24}% 0` }], options);
  const arrive = arriving.animate([{ opacity: 0, translate: `${sign * 24}% 0` }, {}], options);
  sliding.set(menu, [out, arrive]);
  arrive.finished.then(() => {
    ghost.remove();
    delete menu.dataset.sliding;
  }, () => {});
}

function resetViews(menu) {
  const views = viewsOf(menu);
  if (!views) return;
  for (const animation of sliding.get(menu) ?? []) animation.cancel();
  menu.querySelectorAll(":scope > [data-view-ghost]").forEach((old) => old.remove());
  delete menu.dataset.sliding;
  [...views.children].forEach((view, index) => { view.hidden = index > 0; });
  trails.set(menu, [views.firstElementChild?.dataset.view]);
}

function closeChain(menu) {
  let root = menu;
  while (subOf.has(root)) root = subOf.get(root);
  root.hidePopover();
}

function activate(menu, item) {
  if (item.getAttribute("aria-disabled") === "true") return;
  const role = item.getAttribute("role");
  if (role === "menuitemcheckbox") {
    item.setAttribute("aria-checked", item.getAttribute("aria-checked") !== "true");
    return;
  }
  if (role === "menuitemradio") {
    own(menu).filter((other) => other.getAttribute("role") === "menuitemradio" && other.closest('[role="group"]') === item.closest('[role="group"]'))
      .forEach((other) => other.setAttribute("aria-checked", other === item));
    return;
  }
  closeChain(menu);
}

function wire(menu) {
  const subs = subMenus(menu);
  const views = viewsOf(menu);
  if (views) {
    resetViews(menu);
    mountMorphBox(views);
  }
  subs.forEach((sub) => {
    const item = sub.parentElement.querySelector('[role^="menuitem"]');
    subOf.set(sub, menu);
    openerOf.set(sub, item);
    item.setAttribute("aria-haspopup", "menu");
    item.setAttribute("aria-expanded", "false");
    wire(sub);
  });

  menu.addEventListener("beforetoggle", (event) => {
    if (event.newState === "open") { returnTo.set(menu, openerOf.get(menu) ?? document.activeElement); return; }
    if ("uiHeldFocus" in menu.dataset) return;
    menu.dataset.uiHeldFocus = menu.contains(document.activeElement) ? "" : "no";
  });

  menu.addEventListener("toggle", (event) => {
    const opener = openerOf.get(menu);
    opener?.setAttribute("aria-expanded", String(event.newState === "open"));
    if (event.newState === "open") return;
    resetViews(menu);
    subs.forEach((sub) => sub.matches(":popover-open") && sub.hidePopover());
    const parentOpen = !subOf.has(menu) || subOf.get(menu).matches(":popover-open");
    if (menu.dataset.uiHeldFocus === "" && parentOpen) returnTo.get(menu)?.focus();
    delete menu.dataset.uiHeldFocus;
  });

  menu.addEventListener("pointerover", (event) => {
    const item = event.target.closest('[role^="menuitem"]');
    if (!item || item.closest(".ui-menu") !== menu) return;
    subs.forEach((sub) => { if (openerOf.get(sub) !== item && sub.matches(":popover-open")) sub.hidePopover(); });
    const sub = subs.find((candidate) => openerOf.get(candidate) === item);
    if (sub && !sub.matches(":popover-open")) open(sub, "none");
  });

  menu.addEventListener("click", (event) => {
    const item = event.target.closest('[role^="menuitem"]');
    if (!item || item.closest(".ui-menu") !== menu) return;
    const sub = subs.find((candidate) => openerOf.get(candidate) === item);
    if (sub) { open(sub); return; }
    if (item.hasAttribute("data-view-to")) { showView(menu, item.dataset.viewTo, true); return; }
    if (item.hasAttribute("data-view-back")) { showView(menu, trails.get(menu).at(-2), false); return; }
    activate(menu, item);
  });

  menu.addEventListener("keydown", (event) => {
    const item = document.activeElement.closest?.('[role^="menuitem"]');
    if (item?.closest(".ui-menu") !== menu) return;
    const forward = isRtl(menu) ? "ArrowLeft" : "ArrowRight";
    const back = isRtl(menu) ? "ArrowRight" : "ArrowLeft";
    const sub = subs.find((candidate) => openerOf.get(candidate) === item);
    const press = () => (sub ? open(sub) : item.getAttribute("aria-disabled") !== "true" && item.click());
    const keys = {
      ArrowDown: () => step(menu, 1),
      ArrowUp: () => step(menu, -1),
      Home: () => focusItem(menu, own(menu)[0]),
      End: () => focusItem(menu, own(menu).at(-1)),
      Enter: press,
      " ": press,
      [forward]: () => (sub ? open(sub) : item.hasAttribute("data-view-to") && showView(menu, item.dataset.viewTo, true)),
      [back]: () => (subOf.has(menu) ? menu.hidePopover() : trails.get(menu)?.length > 1 && showView(menu, trails.get(menu).at(-2), false)),
      Tab: () => closeChain(menu),
    };
    if (keys[event.key]) { event.preventDefault(); keys[event.key](); return; }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) typeahead(menu, event.key.toLowerCase());
  });
}

/** Mount a `.ui-menu` popover. `trigger` is a button that carries popovertarget, which gives the
    platform the invoker relationship it needs for nesting and focus return; this opens the menu
    on click and on ArrowDown / ArrowUp with focus on a row in the same task, and keeps
    aria-expanded true. `contextFor` opens the same menu at the pointer from a right-click or a
    touch long press. */
export function mountMenu(menu, { trigger, contextFor } = {}) {
  wire(menu);
  if (trigger) {
    openerOf.set(menu, trigger);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (menu.matches(":popover-open")) menu.hidePopover();
      else open(menu);
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      open(menu, event.key === "ArrowUp" ? "last" : "first");
    });
  }
  if (!contextFor) return;
  contextFor.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    open(menu, "first", { x: event.clientX, y: event.clientY });
  });

  contextFor.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    pressTimer = setTimeout(() => open(menu, "first", { x: event.clientX, y: event.clientY }), 500);
  });
  ["pointerup", "pointermove", "pointercancel"].forEach((type) => contextFor.addEventListener(type, () => clearTimeout(pressTimer)));
}
