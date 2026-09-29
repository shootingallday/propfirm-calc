import { mountMenu } from "./menu.js";
import { openOverlay } from "./overlay.js";

const STATE_KEY = "px-shell-state";
const STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function nextIndex(event, items, current) {
  if (event.key === "Home") return 0;
  if (event.key === "End") return items.length - 1;
  let step = STEP[event.key];
  if (step === undefined || items.length === 0) return null;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (getComputedStyle(items[0]).direction === "rtl") step *= -1;
  }
  return (Math.max(current, 0) + step + items.length) % items.length;
}

/** One indicator for a whole list, travelling from the choice that left to the one that arrived.
    `move(item)` travels; `move(item, false)` places it with the transition suppressed for the frame
    the new place is written in, the way `flip` in motion.js does, which is the route the first
    placement and every reflow take so the indicator never flies in from the corner of the list. */
function travelling(host, className, items) {
  const mark = document.createElement("span");
  mark.className = className;
  mark.setAttribute("aria-hidden", "true");
  host.prepend(mark);
  let seat = null;
  const write = () => {
    const rtl = getComputedStyle(host).direction === "rtl";
    mark.style.insetInlineStart = `${rtl ? host.clientWidth - seat.offsetLeft - seat.offsetWidth : seat.offsetLeft}px`;
    mark.style.insetBlockStart = `${seat.offsetTop}px`;
    mark.style.inlineSize = `${seat.offsetWidth}px`;
    mark.style.blockSize = `${seat.offsetHeight}px`;
  };
  const settle = () => {
    if (!seat) return;
    mark.dataset.settling = "";
    write();
    void mark.offsetWidth;
    delete mark.dataset.settling;
  };
  const sizes = new ResizeObserver(settle);
  sizes.observe(host);
  for (const item of items) sizes.observe(item);
  return (item, travel = true) => {
    seat = item;
    if (travel) write();
    else settle();
  };
}

/** Wire one tab set: `root` holds a [role="tablist"] and the panels its tabs name through
    aria-controls. Selection follows focus, and a panel is told once, the first time it is
    shown, so a view whose contents are expensive can fill itself then:
    `panel.addEventListener("px:tab", fill, { once: true })`. */
export function mountTabs(root) {
  const list = root.querySelector('[role="tablist"]');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panel = (tab) => document.getElementById(tab.getAttribute("aria-controls"));
  const open = () => tabs.filter((tab) => !tab.disabled);
  const move = travelling(list, "px-tab-indicator", tabs);

  const select = (tab, focus, travel) => {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute("aria-selected", String(on));
      other.tabIndex = on ? 0 : -1;
      panel(other).hidden = !on;
    }
    move(tab, travel);
    if (focus) tab.focus();
    const shown = panel(tab);
    if (shown.dataset.pxMounted === undefined) {
      shown.dataset.pxMounted = "";
      shown.dispatchEvent(new CustomEvent("px:tab", { bubbles: true }));
    }
  };

  list.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab && !tab.disabled) select(tab, true);
  });
  list.addEventListener("keydown", (event) => {
    const reachable = open();
    const to = nextIndex(event, reachable, reachable.indexOf(document.activeElement));
    if (to === null) return;
    event.preventDefault();
    select(reachable[to], true);
  });

  select(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? open()[0], false, false);
}

/** Wire one `.px-segmented` radiogroup. Arrow keys move and check in one step, which is what a
    radio group means; Space checks whatever the tab stop is on. Each change is announced as
    `px:change` on the group with the checked value. */
export function mountSegmented(group) {
  const all = [...group.querySelectorAll('[role="radio"]')];
  const open = () => all.filter((item) => !item.disabled);
  const move = travelling(group, "px-segmented-indicator", all);

  const check = (item, travel) => {
    for (const other of all) {
      const on = other === item;
      other.setAttribute("aria-checked", String(on));
      other.tabIndex = on ? 0 : -1;
    }
    move(item, travel);
  };
  const choose = (item) => {
    check(item);
    item.focus();
    group.dispatchEvent(new CustomEvent("px:change", { bubbles: true, detail: item.value }));
  };

  group.addEventListener("click", (event) => {
    const item = event.target.closest('[role="radio"]');
    if (item && !item.disabled) choose(item);
  });
  group.addEventListener("keydown", (event) => {
    const reachable = open();
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      choose(document.activeElement);
      return;
    }
    const to = nextIndex(event, reachable, reachable.indexOf(document.activeElement));
    if (to === null) return;
    event.preventDefault();
    choose(reachable[to]);
  });

  check(all.find((item) => item.getAttribute("aria-checked") === "true") ?? open()[0], false);
}

/** Let a collapsed breadcrumb expand. `[data-breadcrumb="more"]` is the control that reveals the
    trail, so an entry holding a menu keeps its place and its own aria-expanded. The ellipsis keeps
    its own place in the trail as the path comes back and collapses it again from there, so the
    path opens and closes under one pointer and focus never leaves the control that was pressed.
    Delegated, so server-rendered markup needs no wiring. */
export function mountBreadcrumb(root = document) {
  root.addEventListener("click", (event) => {
    const more = event.target.closest?.('.px-breadcrumb [data-breadcrumb="more"]');
    if (!more) return;
    const expanding = more.getAttribute("aria-expanded") !== "true";
    more.setAttribute("aria-expanded", String(expanding));
    more.setAttribute("aria-label", expanding ? "Hide path" : "Show path");
  });
}

/** Wire the app shell: `[data-shell="toggle"]` and Mod+B switch the sidebar between its expanded
    and rail modes and remember the choice, `[data-shell="menu"]` opens the drawer. Below
    --px-bp-md the sidebar element is moved into `drawer` and back out again, so there is one
    sidebar in the document and its scroll position and current item survive the move. */
export function mountShell(shell, drawer) {
  const sidebar = shell.querySelector(".px-sidebar");
  const toggle = shell.querySelector('[data-shell="toggle"]');
  const menu = shell.querySelector('[data-shell="menu"]');
  const narrow = matchMedia(`(width < ${token("--px-bp-md")})`);

  const setState = (state) => {
    shell.dataset.state = state;
    localStorage.setItem(STATE_KEY, state);
    const expanded = state === "expanded";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Collapse the sidebar" : "Expand the sidebar");
    toggle.querySelector("px-icon").setAttribute("name", expanded ? "chevron-start" : "chevron-end");
  };

  const place = () => (narrow.matches ? drawer : shell).prepend(sidebar);

  setState(localStorage.getItem(STATE_KEY) === "rail" ? "rail" : "expanded");
  place();

  toggle.addEventListener("click", () => setState(shell.dataset.state === "rail" ? "expanded" : "rail"));
  menu.addEventListener("click", () => openOverlay(drawer));
  narrow.addEventListener("change", () => {
    if (!narrow.matches) drawer.close();
    place();
  });
  addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") return;
    event.preventDefault();
    if (!narrow.matches) setState(shell.dataset.state === "rail" ? "expanded" : "rail");
    else if (drawer.open) drawer.close();
    else openOverlay(drawer);
  });
}

/** Wire one `.px-accordion`. Each `.px-accordion-trigger` names its `.px-accordion-panel`
    through aria-controls, and a closed panel carries `hidden="until-found"`: out of the tab
    order and out of the accessibility tree, still reachable by find-in-page, which is what
    fires `beforematch` and opens it here. The panel animates its own grid row from 0fr to 1fr,
    so the attribute is only put back once that transition has run. `single` keeps one section
    open at a time; the default lets a reader open as many as they want. */
export function mountAccordion(root, options = {}) {
  const single = options.single ?? root.dataset.single !== undefined;
  const triggers = [...root.querySelectorAll(".px-accordion-trigger")];
  const panelOf = (trigger) => document.getElementById(trigger.getAttribute("aria-controls"));
  const open = () => triggers.filter((trigger) => !trigger.disabled);
  const timers = new WeakMap();

  const paint = (trigger, on) => {
    const panel = panelOf(trigger);
    trigger.setAttribute("aria-expanded", String(on));
    clearTimeout(timers.get(panel));
    if (on) {
      panel.removeAttribute("hidden");
      requestAnimationFrame(() => panel.setAttribute("data-open", ""));
      return;
    }
    panel.removeAttribute("data-open");
    const ms = parseFloat(getComputedStyle(panel).transitionDuration) * 1000;
    const hide = () => panel.setAttribute("hidden", "until-found");
    if (ms > 0) timers.set(panel, setTimeout(hide, ms));
    else hide();
  };

  const toggle = (trigger, on) => {
    if (String(on) === trigger.getAttribute("aria-expanded")) return;
    if (on && single) for (const other of triggers) if (other !== trigger) paint(other, false);
    paint(trigger, on);
    root.dispatchEvent(new CustomEvent("px:toggle", { bubbles: true, detail: { id: trigger.id, open: on } }));
    options.onToggle?.(trigger, on);
  };

  root.addEventListener("click", (event) => {
    const trigger = event.target.closest(".px-accordion-trigger");
    if (trigger && !trigger.disabled) toggle(trigger, trigger.getAttribute("aria-expanded") !== "true");
  });
  root.addEventListener("keydown", (event) => {
    if (!document.activeElement.classList?.contains("px-accordion-trigger")) return;
    const reachable = open();
    const to = nextIndex(event, reachable, reachable.indexOf(document.activeElement));
    if (to === null) return;
    event.preventDefault();
    reachable[to].focus();
  });

  for (const trigger of triggers) {
    const panel = panelOf(trigger);
    panel.addEventListener("beforematch", () => toggle(trigger, true));
    paint(trigger, trigger.getAttribute("aria-expanded") === "true");
  }

  return { toggle: (id, on) => toggle(triggers.find((trigger) => trigger.id === id), on) };
}

/** Wire one `.px-toolbar` that folds whatever does not fit into the menu its `[data-overflow]`
    button opens. The fold is measured rather than declared at a breakpoint, so a toolbar in a
    narrow panel and the same toolbar across a full page each keep exactly the actions they have
    room for. Folding runs from the end, so the least important action goes first, and each
    folded control keeps working: the menu entry clicks the original button. */
export function mountToolbar(root) {
  const overflow = root.querySelector(":scope > [data-overflow]");
  const menu = document.getElementById(overflow.getAttribute("popovertarget"));
  const items = [...root.children].filter((child) => child !== overflow && !child.classList.contains("px-toolbar-spacer"));
  let folding = false;

  const entry = (item, first) => {
    const line = document.createElement("button");
    line.type = "button";
    line.className = "px-menu-item";
    line.setAttribute("role", "menuitem");
    line.tabIndex = first ? 0 : -1;
    if (item.disabled) line.setAttribute("aria-disabled", "true");
    if (item.dataset.variant === "danger") line.dataset.tone = "loss";
    const icon = item.querySelector("px-icon");
    if (icon) line.append(icon.cloneNode(true));
    line.append(item.dataset.label ?? item.textContent.trim());
    line.addEventListener("click", () => item.click());
    return line;
  };

  const fits = () => root.scrollWidth <= root.clientWidth + 1;

  const fold = () => {
    if (folding) return;
    folding = true;
    for (const item of items) delete item.dataset.folded;
    delete overflow.dataset.needed;
    if (!fits()) {
      overflow.dataset.needed = "";
      for (let i = items.length - 1; i >= 0 && !fits(); i--) items[i].dataset.folded = "";
    }
    const folded = items.filter((item) => "folded" in item.dataset);
    menu.replaceChildren(...folded.map((item, i) => entry(item, i === 0)));
    overflow.setAttribute("aria-label", `${folded.length} more ${folded.length === 1 ? "action" : "actions"}`);
    folding = false;
  };

  mountMenu(menu, { trigger: overflow });
  const observer = new ResizeObserver(fold);
  observer.observe(root);
  fold();
  return { fold, destroy: () => observer.disconnect() };
}
