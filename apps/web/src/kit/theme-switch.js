import { viewTransition } from "./view-transition.js";

const pending = new WeakMap();

function land(dark, root) {
  const view = root.ownerDocument.defaultView;
  view.cancelAnimationFrame(pending.get(root));
  root.setAttribute("data-theme-switching", "");
  root.classList.toggle("dark", dark);
  pending.set(root, view.requestAnimationFrame(() => {
    pending.set(root, view.requestAnimationFrame(() => {
      pending.delete(root);
      root.removeAttribute("data-theme-switching");
    }));
  }));
}

export function switchTheme(dark, root = document.documentElement, { from } = {}) {
  if (!from) return land(dark, root);
  const box = from.getBoundingClientRect();
  const view = from.ownerDocument.defaultView;
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const reveal = from.ownerDocument.documentElement.style;
  reveal.setProperty("--ui-theme-x", `${x}px`);
  reveal.setProperty("--ui-theme-y", `${y}px`);
  reveal.setProperty("--ui-theme-r", `${Math.hypot(Math.max(x, view.innerWidth - x), Math.max(y, view.innerHeight - y))}px`);
  if (from.matches(":hover")) from.setAttribute("data-hovered", "");
  return viewTransition(() => land(dark, root), { types: ["ui-theme"] }).finally(() => {
    view.addEventListener("pointermove", () => from.removeAttribute("data-hovered"), { once: true });
  });
}
