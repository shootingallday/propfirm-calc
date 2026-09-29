import { springTiming } from "./morph-box.js";

let flight = null;
let waiting = null;
const end = (one) => (typeof one === "function" ? one() : one) ?? null;

function fly(calls) {
  const first = calls[0].options;
  const last = calls.at(-1).options;
  const { duration, easing } = (last.timing ?? (() => springTiming(document.documentElement, last.spring ?? "smooth")))();
  const apply = async () => {
    for (const call of calls) await call.update();
  };
  if (!document.startViewTransition || !duration) return apply();

  const named = new Map();
  const name = (el, value) => {
    if (!el) return;
    if (!named.has(el)) named.set(el, el.style.viewTransitionName);
    el.style.viewTransitionName = value;
  };
  const restore = () => {
    for (const [el, value] of named) el.style.viewTransitionName = value;
  };
  for (const [key, [from]] of Object.entries(first.share ?? {})) name(end(from), key);

  const transition = document.startViewTransition({
    update: async () => {
      await apply();
      restore();
      for (const [key, [, to]] of Object.entries(last.share ?? {})) name(end(to), key);
    },
    types: last.types ?? [],
  });
  flight = transition;
  transition.ready.then(
    () => {
      for (const animation of document.documentElement.getAnimations({ subtree: true }))
        if (animation.effect?.pseudoElement?.startsWith("::view-transition")) animation.effect.updateTiming({ duration, easing });
    },
    () => {},
  );
  return transition.finished.finally(() => {
    restore();
    if (flight === transition) flight = null;
  });
}

export function viewTransition(update, options = {}) {
  const call = { update, options };
  if (waiting) {
    waiting.calls.push(call);
    return waiting.done;
  }
  if (!flight) return fly([call]);
  const calls = [call];
  const done = flight.finished.catch(() => {}).then(() => {
    waiting = null;
    return fly(calls);
  });
  waiting = { calls, done };
  return done;
}
