const SHOW_DELAY = 500;
const GROUP_WINDOW = 300;
let warmUntil = 0;
let timer = 0;
let shown = null;

function hide(tip) {
  clearTimeout(timer);
  if (tip.matches(":popover-open")) tip.hidePopover();
  if (shown !== tip) return;
  shown = null;
  warmUntil = Date.now() + GROUP_WINDOW;
}

function reveal(tip) {
  if (shown && shown !== tip) hide(shown);
  tip.showPopover();
  shown = tip;
}

function schedule(tip) {
  clearTimeout(timer);
  timer = setTimeout(() => reveal(tip), shown || Date.now() < warmUntil ? 0 : SHOW_DELAY);
}

/** Wire every trigger under `root` that describes itself with a `.px-tooltip`. The trigger and
    the tooltip name the same anchor in --px-anchor; placement is CSS. */
export function mountTooltips(root = document) {
  for (const trigger of root.querySelectorAll("[aria-describedby]")) {
    const tip = document.getElementById(trigger.getAttribute("aria-describedby"));
    if (!tip?.classList.contains("px-tooltip")) continue;
    tip.setAttribute("role", "tooltip");
    trigger.addEventListener("pointerenter", (event) => event.pointerType !== "touch" && schedule(tip));
    trigger.addEventListener("pointerleave", () => hide(tip));
    trigger.addEventListener("pointerdown", () => hide(tip));
    trigger.addEventListener("focus", () => trigger.matches(":focus-visible") && reveal(tip));
    trigger.addEventListener("blur", () => hide(tip));
  }
}
