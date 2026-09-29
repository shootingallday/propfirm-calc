const hasNativeLightDismiss = () => "closedBy" in HTMLDialogElement.prototype;
const modalOpen = () => document.querySelector(".ui-overlay:modal") !== null;
const exiting = () => "uiOverlayExiting" in document.documentElement.dataset;
let exitPass = 0;
let pressedOn = null;

const recordPress = (event) => { pressedOn = event.target; };
const lightDismiss = (event) => {
  const dialog = event.currentTarget;
  if (event.target === dialog && pressedOn === dialog) dialog.close();
};

function tabbable(dialog) {
  const stops = [...dialog.querySelectorAll("*")]
    .filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.checkVisibility({ visibilityProperty: true }));
  return stops.filter((el) => {
    if (el.type !== "radio" || !el.name) return true;
    const group = stops.filter((peer) => peer.type === "radio" && peer.name === el.name && peer.form === el.form);
    return el === (group.find((peer) => peer.checked) ?? group[0]);
  });
}

function cycleTab(event) {
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const stops = tabbable(event.currentTarget);
  const ahead = event.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  if (stops.some((el) => document.activeElement.compareDocumentPosition(el) & ahead)) return;
  event.preventDefault();
  (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
}

function measureScrollbar() {
  const root = document.documentElement;
  const width = `${window.innerWidth - root.clientWidth}px`;
  const onLeft = root.getBoundingClientRect().left > 0;
  root.style.setProperty("--ui-scrollbar-left", onLeft ? width : "0px");
  root.style.setProperty("--ui-scrollbar-right", onLeft ? "0px" : width);
}

async function holdThroughExit(event) {
  if (modalOpen()) return;
  const dialog = event.currentTarget;
  const root = document.documentElement;
  const pass = ++exitPass;
  root.dataset.uiOverlayExiting = "";
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  await Promise.allSettled(dialog.getAnimations({ subtree: true }).map((animation) => animation.finished));
  if (pass === exitPass && !modalOpen()) delete root.dataset.uiOverlayExiting;
}

/** Finish the display and overlay transitions of a popover reopened inside its own exit
    transition: Chromium can otherwise leave it without a box, and focus() needs a box. */
export const settle = (popover) => popover.getAnimations().filter((animation) => ["display", "overlay"].includes(animation.transitionProperty)).forEach((animation) => animation.finish());

/** Open a `.ui-overlay` <dialog> as a modal, locking page scroll, cycling Tab inside it, and
    honouring closedby="any" everywhere. The scrollbar is measured only while the page is genuinely unlocked: under a
    nested open, or a reopen inside the exit window, the lock has already taken it away and the
    measurement would read 0. */
export function openOverlay(dialog) {
  if (!modalOpen() && !exiting()) measureScrollbar();
  dialog.showModal();
  dialog.addEventListener("close", holdThroughExit);
  dialog.addEventListener("keydown", cycleTab);
  if (!hasNativeLightDismiss() && dialog.getAttribute("closedby") === "any") {
    dialog.addEventListener("pointerdown", recordPress);
    dialog.addEventListener("click", lightDismiss);
  }
}
