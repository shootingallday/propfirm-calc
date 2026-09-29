import { icon } from "./icons.js";
import { readLocale, todayIn } from "./locale.js";
import { escapeHtml } from "./utilities.js";

export function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
const addMonths = (date, n) => new Date(date.getFullYear(), date.getMonth() + n, 1);
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const clampDay = (date, min, max) => (min && date < min ? min : max && date > max ? max : date);
const utc = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

export function mountCalendar(root, options = {}) {
  const locale = options.locale ?? readLocale();
  const mode = options.mode ?? "single";
  const labels = { ...options.labels };
  const min = options.min ? fromKey(toKey(options.min)) : null;
  const max = options.max ? fromKey(toKey(options.max)) : null;
  const today = todayIn(locale.timeZone);
  const isMarked = typeof options.marked === "function" ? options.marked : (d) => Boolean(options.marked?.has?.(toKey(d)));
  const isDisabled = (d) => (min && d < min) || (max && d > max) || Boolean(options.disabled?.(d));

  let value = options.value ?? null;
  let pending = null;
  let focused = fromKey(toKey(options.month ?? (mode === "range" ? value?.from : value) ?? today));
  let month = addMonths(focused, 0);
  let wantsFocus = false;

  const monthFmt = new Intl.DateTimeFormat(locale.locale, { calendar: "gregory", numberingSystem: "latn", month: "long", year: "numeric", timeZone: "UTC" });
  const weekdayNames = Object.fromEntries(["short", "narrow", "long"].map((weekday) => [weekday, new Intl.DateTimeFormat(locale.locale, { weekday, timeZone: "UTC" })]));
  let weekday = "short";
  const dayLong = new Intl.DateTimeFormat(locale.locale, { calendar: "gregory", weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const navMonth = new Intl.DateTimeFormat(locale.locale, { calendar: "gregory", month: "long", year: "numeric", timeZone: "UTC" });
  const navDirection = new Intl.RelativeTimeFormat(locale.locale, { numeric: "auto" });
  const navName = (step, date) => (date ? navMonth.format(utc(date)) : navDirection.format(step, "month"));

  root.classList.add("px-calendar");
  root.dir = locale.dir;
  root.lang = locale.locale;
  root.setAttribute("role", "group");
  const titleId = root.id ? `${root.id}-title` : `px-cal-${Math.random().toString(36).slice(2, 8)}`;

  function rangeState(d) {
    if (mode !== "range") return null;
    const from = value?.from ?? pending;
    const to = value?.to ?? null;
    if (!from || !to || from.getTime() === to.getTime()) return null;
    if (d.getTime() === from.getTime()) return "start";
    if (d.getTime() === to.getTime()) return "end";
    return d > from && d < to ? "middle" : null;
  }

  function isSelected(d) {
    if (mode === "range") {
      const from = value?.from ?? pending;
      const to = value?.to;
      return Boolean((from && d.getTime() === from.getTime()) || (to && d.getTime() === to.getTime()));
    }
    return Boolean(value && d.getTime() === value.getTime());
  }

  function render() {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() - locale.weekStartsOn + 7) % 7;
    let cursor = addDays(first, -lead);
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push(cursor);
        cursor = addDays(cursor, 1);
      }
      weeks.push(days);
    }
    const heads = weeks[0]
      .map((d) => `<th scope="col" aria-label="${weekdayNames.long.format(utc(d))}">${weekdayNames[weekday].format(utc(d))}</th>`)
      .join("");
    const rows = weeks
      .map((days) => {
        const cells = days.map((d) => {
          const key = toKey(d);
          const range = rangeState(d);
          const outside = !sameMonth(d, month);
          const selected = isSelected(d);
          const disabled = isDisabled(d);
          const attrs = [
            `class="px-calendar-day"`,
            `data-date="${key}"`,
            `tabindex="${d.getTime() === focused.getTime() ? 0 : -1}"`,
            `aria-label="${dayLong.format(utc(d))}"`,
            `aria-pressed="${selected}"`,
            d.getTime() === today.getTime() ? `aria-current="date"` : "",
            outside ? "data-outside" : "",
            range ? `data-range="${range}"` : "",
            isMarked(d) ? "data-marked" : "",
            disabled ? "disabled" : "",
          ].filter(Boolean).join(" ");
          return `<td${range ? ` data-range="${range}"` : ""} aria-selected="${selected}"><button type="button" ${attrs}>${d.getDate()}</button></td>`;
        });
        return `<tr>${cells.join("")}</tr>`;
      })
      .join("");
    const prevDisabled = min && first <= new Date(min.getFullYear(), min.getMonth(), 1);
    const nextDisabled = max && addMonths(month, 1) > max;
    const prevName = labels.previous ?? navName(-1, prevDisabled ? null : addMonths(first, -1));
    const nextName = labels.next ?? navName(1, nextDisabled ? null : addMonths(first, 1));
    root.innerHTML =
      `<div class="px-calendar-head">` +
      `<button type="button" class="px-calendar-nav" data-nav="prev" aria-label="${escapeHtml(prevName)}"${prevDisabled ? " disabled" : ""}>${icon("chevron-start")}</button>` +
      `<span class="px-calendar-title" id="${escapeHtml(titleId)}" aria-live="polite">${monthFmt.format(utc(first))}</span>` +
      `<button type="button" class="px-calendar-nav" data-nav="next" aria-label="${escapeHtml(nextName)}"${nextDisabled ? " disabled" : ""}>${icon("chevron-end")}</button></div>` +
      `<table class="px-calendar-grid" role="grid" aria-labelledby="${escapeHtml(titleId)}"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
    if (wantsFocus) {
      const target = wantsFocus === true ? null : root.querySelector(`[data-nav="${wantsFocus}"]:enabled`);
      (target ?? root.querySelector('.px-calendar-day[tabindex="0"]'))?.focus();
      wantsFocus = false;
    }
  }

  function moveFocus(next) {
    focused = clampDay(next, min, max);
    if (!sameMonth(focused, month)) month = addMonths(focused, 0);
    wantsFocus = true;
    render();
  }

  function select(d) {
    if (isDisabled(d)) return;
    if (mode === "range") {
      if (!pending) {
        pending = d;
        value = null;
      } else {
        const [from, to] = pending <= d ? [pending, d] : [d, pending];
        value = { from, to };
        pending = null;
      }
    } else {
      value = value && value.getTime() === d.getTime() && options.clearable ? null : d;
    }
    focused = d;
    wantsFocus = root.contains(document.activeElement);
    render();
    if (mode !== "range" || value) options.onChange?.(value);
  }

  root.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      month = addMonths(month, nav.dataset.nav === "prev" ? -1 : 1);
      focused = clampDay(new Date(month.getFullYear(), month.getMonth(), Math.min(focused.getDate(), 28)), min, max);
      wantsFocus = nav.dataset.nav;
      render();
      return;
    }
    const day = e.target.closest(".px-calendar-day");
    if (day) select(fromKey(day.dataset.date));
  });

  root.addEventListener("keydown", (e) => {
    if (!e.target.classList.contains("px-calendar-day")) return;
    const horizontal = locale.dir === "rtl" ? -1 : 1;
    const weekOffset = (focused.getDay() - locale.weekStartsOn + 7) % 7;
    const yearOrMonth = (sign) =>
      e.shiftKey
        ? new Date(focused.getFullYear() + sign, focused.getMonth(), focused.getDate())
        : new Date(focused.getFullYear(), focused.getMonth() + sign, focused.getDate());
    const moves = {
      ArrowLeft: () => addDays(focused, -1 * horizontal),
      ArrowRight: () => addDays(focused, 1 * horizontal),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekOffset),
      End: () => addDays(focused, 6 - weekOffset),
      PageUp: () => yearOrMonth(-1),
      PageDown: () => yearOrMonth(1),
    };
    if (moves[e.key]) {
      e.preventDefault();
      moveFocus(moves[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(focused);
    }
  });

  function fitWeekdays() {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
    root.querySelector(".px-calendar-grid th")?.append(probe);
    const widest = Math.max(...Array.from({ length: 7 }, (_, day) => {
      probe.textContent = weekdayNames.short.format(new Date(Date.UTC(2026, 2, 1 + day)));
      return probe.getBoundingClientRect().width;
    }));
    probe.textContent = "";
    probe.style.width = "var(--cell)";
    const cell = probe.getBoundingClientRect().width;
    probe.remove();
    const next = widest <= cell ? "short" : "narrow";
    if (!cell || next === weekday) return;
    weekday = next;
    wantsFocus = root.contains(document.activeElement);
    render();
  }

  const resized = new ResizeObserver(fitWeekdays);
  render();
  fitWeekdays();
  resized.observe(root);
  document.fonts.ready.then(fitWeekdays);
  return {
    get value() { return value; },
    set value(next) { value = next; pending = null; render(); },
    get month() { return month; },
    set month(next) { month = addMonths(next, 0); render(); },
    destroy() { resized.disconnect(); root.innerHTML = ""; root.classList.remove("px-calendar"); for (const name of ["lang", "dir", "role"]) root.removeAttribute(name); },
  };
}
