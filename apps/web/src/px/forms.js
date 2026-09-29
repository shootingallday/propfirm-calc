import { mountCalendar, toKey } from "./calendar.js";
import { icon } from "./icons.js";
import { formatCalendarRange, readLocale, todayIn } from "./locale.js";
import { settle } from "./overlay.js";
import { escapeHtml, identify, langOf, mountMorph, nameFrom, say } from "./utilities.js";

const SEARCH_DEBOUNCE = 250;
const COMBOBOX_DEBOUNCE = 200;
const TYPEAHEAD_WINDOW = 1000;
const SUMMARY_ROWS = 3;

const emit = (target, type, detail) => target.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));

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

/** A header checkbox that owns a column of them. `indeterminate` is a property and not an
    attribute, so partial selection cannot be authored in HTML and has to be set from here. */
export function mountCheckAll(master) {
  const boxes = () => [...document.querySelectorAll(master.dataset.controls)].filter((box) => box !== master && !box.disabled);

  const sync = () => {
    const all = boxes();
    const on = all.filter((box) => box.checked).length;
    master.checked = on > 0 && on === all.length;
    master.indeterminate = on > 0 && on < all.length;
    emit(master, "px:change", { checked: on, of: all.length });
  };

  master.addEventListener("change", () => {
    for (const box of boxes()) box.checked = master.checked;
    master.indeterminate = false;
    emit(master, "px:change", { checked: master.checked ? boxes().length : 0, of: boxes().length });
  });
  for (const box of boxes()) box.addEventListener("change", sync);
  sync();
  return { sync };
}

const STEP = { ArrowDown: 1, ArrowUp: -1 };
function step(event, items, current) {
  if (event.key === "Home") return 0;
  if (event.key === "End") return items.length - 1;
  const delta = STEP[event.key];
  if (delta === undefined || items.length === 0) return null;
  return (Math.max(current, 0) + delta + items.length) % items.length;
}

function typeAhead() {
  let buffer = "";
  let timer = 0;
  return (key, items, from) => {
    if (key.length !== 1 || key === " ") return null;
    clearTimeout(timer);
    buffer += key.toLowerCase();
    timer = setTimeout(() => (buffer = ""), TYPEAHEAD_WINDOW);
    const order = [...items.slice(from + 1), ...items.slice(0, from + 1)];
    return order.find((item) => item.textContent.trim().toLowerCase().startsWith(buffer)) ?? null;
  };
}

/** Open `popover` from `trigger` and place focus in the same task. The platform's popovertarget
    activation moves focus a task later, so a key pressed right after a click, Enter or Space
    would reach the trigger. popovertarget stays so a click on the trigger does not light-dismiss
    the popover it is about to close. */
function invoke(trigger, popover, place, keys) {
  const show = () => {
    popover.showPopover({ source: trigger });
    settle(popover);
    place();
  };
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (popover.matches(":popover-open")) popover.hidePopover();
    else show();
  });
  trigger.addEventListener("keydown", (event) => {
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    show();
  });
  popover.addEventListener("toggle", (event) => trigger.setAttribute("aria-expanded", String(event.newState === "open")));
}

/** Wire one `.px-select` trigger to the `.px-listbox` its `popovertarget` names. The platform
    owns the top layer, light dismiss, Escape, and focus restore; this owns the opening and adds
    the listbox keyboard model the popover attribute does not carry. Selection is announced as
    `px:change`. */
export function mountSelect(trigger, options = {}) {
  const list = document.getElementById(trigger.getAttribute("popovertarget"));
  const text = trigger.querySelector("span");
  const match = typeAhead();
  const all = () => [...list.querySelectorAll(".px-option")];
  const reachable = () => all().filter((option) => option.getAttribute("aria-disabled") !== "true");
  const selected = () => all().find((option) => option.getAttribute("aria-selected") === "true");

  const choose = (option) => {
    for (const other of all()) other.setAttribute("aria-selected", String(other === option));
    text.textContent = option.dataset.label ?? option.textContent.trim();
    delete trigger.dataset.placeholder;
    list.hidePopover();
    trigger.focus();
    emit(trigger, "px:change", { value: option.dataset.value, label: text.textContent });
    options.onChange?.(option.dataset.value);
  };

  invoke(trigger, list, () => (selected() ?? reachable()[0])?.focus(), ["ArrowDown", "ArrowUp"]);

  list.addEventListener("keydown", (event) => {
    const items = reachable();
    const to = step(event, items, items.indexOf(document.activeElement));
    if (to !== null) {
      event.preventDefault();
      items[to].focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (document.activeElement.classList.contains("px-option")) choose(document.activeElement);
      return;
    }
    if (event.key === "Tab") {
      list.hidePopover();
      return;
    }
    const found = match(event.key, items, items.indexOf(document.activeElement));
    if (found) {
      event.preventDefault();
      found.focus();
    }
  });

  list.addEventListener("click", (event) => {
    const option = event.target.closest(".px-option");
    if (option && option.getAttribute("aria-disabled") !== "true") choose(option);
  });

  return { value: () => selected()?.dataset.value ?? null };
}

/** Wire one combobox: a text input that filters a listbox. `items` is the static set and `load`
    is the asynchronous one — a `load` is debounced and its result replaces the list, so a slow
    broker lookup never overwrites a later keystroke's answer. `multiple` turns the same control
    into the token input: chosen values become `.px-token` chips ahead of the caret, Backspace on
    an empty input takes the last one back, and the input never leaves the end of the run.

    A press on the input opens the list and a second press closes it, so the list is opened and
    closed from the one control. The platform light-dismisses the popover on the press that
    reaches the input, so the press reads the state it is toggling from at `pointerdown`.

    The caret has to stay in the input for typing, so the active option is named through
    aria-activedescendant rather than focused, which is why `.px-option` carries a `data-active`
    highlight as well as a focus one. A label taken on or off is announced under the language of
    the control it is drawn in, and this module's word for what happened under the document's;
    a chip's remove button is named the same way, from the element the label is drawn on.
    Refocusing the input refilters the list, and a refilter announces its match count, so one
    routine puts the caret back, refilters, and only then announces the label, whichever route
    took it on or off. */
export function mountCombobox(root, options = {}) {
  const input = root.querySelector("input");
  const list = document.getElementById(input.getAttribute("aria-controls"));
  const emptyText = options.emptyText ?? "No matches";
  const chosen = new Map();
  let items = options.items ?? [];
  let active = null;
  let timer = 0;
  let generation = 0;
  let held = false;

  const reachable = () => [...list.querySelectorAll(".px-option")];

  const highlight = (option) => {
    active = option ?? null;
    for (const other of reachable()) delete other.dataset.active;
    if (!active) return input.removeAttribute("aria-activedescendant");
    active.dataset.active = "";
    active.scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", identify(active, "px-option"));
  };

  const note = (message) => {
    const line = document.createElement("div");
    line.className = "px-listbox-empty";
    line.textContent = message;
    list.replaceChildren(line);
    highlight(null);
  };

  const render = (found) => {
    const open = found.filter((item) => !(options.multiple && chosen.has(item.value)));
    if (!open.length) return note(emptyText);
    let group = null;
    let host = list;
    list.replaceChildren();
    for (const item of open) {
      if (item.group && item.group !== group) {
        group = item.group;
        host = document.createElement("div");
        host.setAttribute("role", "group");
        host.setAttribute("aria-label", group);
        const label = document.createElement("div");
        label.className = "px-menu-label";
        label.setAttribute("aria-hidden", "true");
        label.textContent = group;
        host.append(label);
        list.append(host);
      }
      const option = document.createElement("div");
      option.className = "px-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(chosen.has(item.value)));
      option.dataset.value = item.value;
      option.textContent = item.label;
      host.append(option);
    }
    highlight(reachable()[0]);
    announce(`${open.length} ${open.length === 1 ? "match" : "matches"}`);
  };

  const filter = (query) => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(needle));
  };

  const search = (query) => {
    clearTimeout(timer);
    if (!options.load) return render(filter(query));
    const mine = ++generation;
    note("Searching…");
    timer = setTimeout(async () => {
      const found = await options.load(query);
      if (mine !== generation) return;
      items = found;
      render(found);
    }, COMBOBOX_DEBOUNCE);
  };

  const chip = (value, label) => {
    const tag = document.createElement("span");
    tag.className = "px-tag px-token";
    const name = document.createElement("span");
    name.textContent = label;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "px-token-remove";
    nameFrom(remove, "Remove", name);
    remove.innerHTML = '<px-icon name="close"></px-icon>';
    remove.addEventListener("click", () => drop(value));
    tag.append(name, remove);
    input.before(tag);
  };

  const resume = (label, lang, word) => {
    input.focus();
    search(input.value);
    announce({ text: label, lang }, word);
  };

  const drop = (value) => {
    const label = chosen.get(value);
    chosen.delete(value);
    [...root.querySelectorAll(".px-token")].find((tag) => tag.textContent.startsWith(label))?.remove();
    resume(label, langOf(root), " removed");
    emit(root, "px:change", { value: [...chosen.keys()] });
    options.onChange?.([...chosen.keys()]);
  };

  const choose = (option) => {
    const value = option.dataset.value;
    const label = option.textContent.trim();
    const lang = langOf(option);
    if (options.multiple) {
      chosen.set(value, label);
      chip(value, label);
      input.value = "";
      resume(label, lang, " added");
    } else {
      chosen.clear();
      chosen.set(value, label);
      input.value = label;
      list.hidePopover();
    }
    emit(root, "px:change", { value: options.multiple ? [...chosen.keys()] : value });
    options.onChange?.(options.multiple ? [...chosen.keys()] : value);
  };

  input.addEventListener("input", () => {
    list.showPopover();
    search(input.value);
  });
  input.addEventListener("focus", () => search(input.value));
  input.addEventListener("pointerdown", () => { held = list.matches(":popover-open"); });
  input.addEventListener("click", () => {
    const open = held || list.matches(":popover-open");
    held = false;
    if (open) return list.hidePopover();
    list.showPopover();
    search(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && !input.value && options.multiple) {
      const last = [...chosen.keys()].at(-1);
      if (last) drop(last);
      return;
    }
    if (event.key === "Escape") {
      list.hidePopover();
      return;
    }
    const found = reachable();
    const to = step(event, found, found.indexOf(active));
    if (to !== null) {
      event.preventDefault();
      if (!list.matches(":popover-open")) list.showPopover();
      highlight(found[to]);
      return;
    }
    if (event.key === "Enter" && active) {
      event.preventDefault();
      choose(active);
    }
  });

  list.addEventListener("click", (event) => {
    const option = event.target.closest(".px-option");
    if (option) choose(option);
  });
  list.addEventListener("toggle", (event) => {
    input.setAttribute("aria-expanded", String(event.newState === "open"));
    if (event.newState === "closed") highlight(null);
  });
  if (options.multiple) root.addEventListener("click", (event) => { if (event.target === root) input.focus(); });

  render(items);
  return { value: () => (options.multiple ? [...chosen.keys()] : ([...chosen.keys()][0] ?? null)), items: (next) => { items = next; render(next); } };
}

/** Wire one `.px-slider`. One `input[type="range"]` is a single value and two are a range: the
    platform gives each thumb its own arrow keys, page steps, and announced reading, and this
    only keeps the pair from crossing and paints the fill between them. */
export function mountSlider(root, options = {}) {
  const inputs = [...root.querySelectorAll('input[type="range"]')];
  const readout = root.parentElement?.querySelector(".px-slider-value");
  const format = options.format ?? ((value) => value.toLocaleString(readLocale().locale));
  const ratio = (input) => ((input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;

  const paint = () => {
    if (inputs.length > 1) {
      inputs[0].value = String(Math.min(inputs[0].valueAsNumber, inputs[1].valueAsNumber));
      inputs[1].value = String(Math.max(inputs[0].valueAsNumber, inputs[1].valueAsNumber));
    }
    const stops = inputs.map(ratio);
    root.style.setProperty("--px-from", `${inputs.length > 1 ? stops[0] : 0}%`);
    root.style.setProperty("--px-to", `${stops.at(-1)}%`);
    if (readout) readout.textContent = inputs.map((input) => format(input.valueAsNumber)).join(" – ");
  };

  for (const input of inputs) {
    input.addEventListener("input", () => {
      paint();
      emit(root, "px:change", { value: inputs.map((one) => one.valueAsNumber) });
      options.onChange?.(inputs.map((one) => one.valueAsNumber));
    });
  }
  paint();
  return { paint };
}

/** Wire one `.px-number`. The wheel is bound to the input rather than the group and only fires
    while that input holds focus, so scrolling the page past a risk field never changes it; the
    same guard is what lets the listener claim the gesture with preventDefault. */
export function mountNumber(root, options = {}) {
  const input = root.querySelector("input");
  const [down, up] = [...root.querySelectorAll(".px-number-step")];

  const settle = () => {
    if (input.value !== "") {
      const min = input.min === "" ? -Infinity : Number(input.min);
      const max = input.max === "" ? Infinity : Number(input.max);
      input.value = String(Math.min(max, Math.max(min, input.valueAsNumber)));
    }
    down.disabled = input.min !== "" && input.valueAsNumber <= Number(input.min);
    up.disabled = input.max !== "" && input.valueAsNumber >= Number(input.max);
    emit(root, "px:change", { value: input.valueAsNumber });
    options.onChange?.(input.valueAsNumber);
  };

  const nudge = (direction) => {
    if (input.disabled || input.readOnly) return;
    if (input.value === "") input.value = input.min || "0";
    else if (direction > 0) input.stepUp();
    else input.stepDown();
    settle();
  };

  down.addEventListener("click", () => nudge(-1));
  up.addEventListener("click", () => nudge(1));
  input.addEventListener("change", settle);
  input.addEventListener("wheel", (event) => {
    if (document.activeElement !== input) return;
    event.preventDefault();
    nudge(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  settle();
  return { settle };
}

/** Wire one `.px-search`. The debounce is 250ms: long enough that a typed symbol is one query
    rather than four, short enough that the list still feels like it is following the keys. The
    clear button and Escape both fire immediately, because those are decisions and not typing. */
export function mountSearch(root, options = {}) {
  const input = root.querySelector("input");
  const clear = root.querySelector(".px-search-clear");
  const delay = options.delay ?? SEARCH_DEBOUNCE;
  let timer = 0;

  const run = (query) => {
    emit(root, "px:search", { query });
    options.onSearch?.(query);
  };

  const mark = () => root.toggleAttribute("data-filled", input.value !== "");

  input.addEventListener("input", () => {
    mark();
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), delay);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !input.value) return;
    event.preventDefault();
    wipe();
  });

  const wipe = () => {
    clearTimeout(timer);
    input.value = "";
    mark();
    input.focus();
    run("");
  };

  clear.addEventListener("click", wipe);
  mark();
  return { clear: wipe };
}

/** Wire one `.px-drop`. The picker, the accessible name, and the keyboard come from the file
    input the label wraps, so this adds the drop target and the five states an upload passes
    through. `upload` returns a promise and is handed a progress callback; without one the zone
    settles on `done` as soon as the files are accepted. A message `upload` throws is the
    caller's own words, shown and announced as the rejection; `lang` names their language, as it
    does for a toast, while the zone's own state words keep the document's. */
export function mountDrop(root, options = {}) {
  const input = root.querySelector('input[type="file"]');
  const note = root.querySelector(".px-drop-note");
  const bar = root.querySelector(".px-progress > i");
  const idle = note?.textContent ?? "";
  const lang = options.lang ?? null;

  const state = (name, message, theirs = false) => {
    const spoken = theirs ? lang : null;
    if (name) root.dataset.state = name;
    else delete root.dataset.state;
    if (note) {
      note.textContent = message ?? idle;
      if (spoken !== null) note.lang = spoken;
      else if (lang !== null) note.removeAttribute("lang");
    }
    if (message) announce({ text: message, lang: spoken });
  };

  const reject = (files) => {
    const limit = options.maxSize ?? Infinity;
    const kinds = (input.accept || "").split(",").map((kind) => kind.trim().toLowerCase()).filter(Boolean);
    for (const file of files) {
      if (file.size > limit) return `${file.name} is larger than the ${Math.round(limit / 1e6)} MB limit`;
      if (kinds.length && !kinds.some((kind) => (kind.startsWith(".") ? file.name.toLowerCase().endsWith(kind) : file.type === kind))) {
        return `${file.name} is not one of ${kinds.join(", ")}`;
      }
    }
    return null;
  };

  const take = async (files) => {
    if (!files.length) return;
    const problem = reject(files);
    if (problem) {
      state("rejected", problem);
      emit(root, "px:reject", { files, reason: problem });
      return;
    }
    state("uploading", `Uploading ${files.length === 1 ? files[0].name : `${files.length} files`}…`);
    try {
      await options.upload?.(files, (fraction) => { if (bar) bar.style.inlineSize = `${Math.round(fraction * 100)}%`; });
      state("done", `${files.length === 1 ? files[0].name : `${files.length} files`} uploaded`);
      emit(root, "px:change", { files });
      options.onChange?.(files);
    } catch (error) {
      state("rejected", error.message, true);
      emit(root, "px:reject", { files, reason: error.message });
    }
  };

  for (const type of ["dragenter", "dragover"]) {
    root.addEventListener(type, (event) => { event.preventDefault(); state("over"); });
  }
  root.addEventListener("dragleave", (event) => { if (!root.contains(event.relatedTarget)) state(null); });
  root.addEventListener("drop", (event) => {
    event.preventDefault();
    state(null);
    take([...event.dataTransfer.files]);
  });
  input.addEventListener("change", () => take([...input.files]));

  return { reset: () => state(null) };
}

/** Wire one `.px-otp`. One input per box, so a reader hears which digit it is on and the caret
    can never land inside a value. A paste of the whole code fills every box from wherever it
    lands, which is what a code arriving in a notification actually does. */
export function mountOtp(root, options = {}) {
  const boxes = [...root.querySelectorAll("input")];

  boxes.forEach((box, i) => {
    box.inputMode = "numeric";
    box.autocomplete = i === 0 ? "one-time-code" : "off";
    box.maxLength = 1;
    box.setAttribute("aria-label", `Digit ${i + 1} of ${boxes.length}`);
  });

  const value = () => boxes.map((box) => box.value).join("");

  const settle = () => {
    const code = value();
    emit(root, "px:change", { value: code });
    if (code.length !== boxes.length) return;
    options.onComplete?.(code);
    emit(root, "px:complete", { value: code });
  };

  const fill = (from, digits) => {
    if (digits.length >= boxes.length) from = 0;
    for (let i = 0; i < digits.length && from + i < boxes.length; i++) boxes[from + i].value = digits[i];
    boxes[Math.min(from + digits.length, boxes.length - 1)].focus();
    settle();
  };

  root.addEventListener("input", (event) => {
    const box = event.target;
    const digits = box.value.replace(/\D/g, "");
    box.value = digits.slice(0, 1);
    if (digits.length > 1) return fill(boxes.indexOf(box), digits);
    if (box.value) boxes[Math.min(boxes.indexOf(box) + 1, boxes.length - 1)].focus();
    settle();
  });

  root.addEventListener("keydown", (event) => {
    const at = boxes.indexOf(event.target);
    if (event.key === "Backspace" && !event.target.value && at > 0) {
      event.preventDefault();
      boxes[at - 1].value = "";
      boxes[at - 1].focus();
      settle();
      return;
    }
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: boxes.length - 1 }[event.key];
    if (to === undefined || to < 0 || to >= boxes.length) return;
    event.preventDefault();
    boxes[to].focus();
  });

  root.addEventListener("paste", (event) => {
    event.preventDefault();
    fill(boxes.indexOf(event.target), (event.clipboardData.getData("text") ?? "").replace(/\D/g, ""));
  });

  root.addEventListener("focusin", (event) => event.target.select());
  return { value, clear: () => { for (const box of boxes) box.value = ""; boxes[0].focus(); } };
}

/** Wire one `.px-daterange`: a `.px-select` trigger over a popover holding the range calendar
    and a row of presets. The calendar already carries the keyboard model, the week start, and
    the direction, so this only turns a range into the sentence the trigger reads back and holds
    the choice until Apply, so a half-picked range never filters anything. */
export function mountDateRange(root, options = {}) {
  const trigger = root.querySelector(".px-select");
  const list = document.getElementById(trigger.getAttribute("popovertarget"));
  const text = trigger.querySelector("span");
  const host = list.querySelector("[data-calendar]");
  const apply = list.querySelector("[data-range='apply']");
  const clear = list.querySelector("[data-range='clear']");
  const locale = options.locale ?? readLocale();
  const today = todayIn(locale.timeZone);
  const shift = (days) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const presets = options.presets ?? [
    ["Last 7 days", () => ({ from: shift(-6), to: today })],
    ["Last 30 days", () => ({ from: shift(-29), to: today })],
    ["This month", () => ({ from: new Date(today.getFullYear(), today.getMonth(), 1), to: today })],
  ];

  const say = (range) => (range?.from && range?.to ? formatCalendarRange(range.from, range.to, locale) : options.placeholder ?? "Any date");

  let draft = options.value ?? null;
  let calendar = null;

  const show = (range) => {
    draft = range;
    apply.disabled = !(range?.from && range?.to);
  };

  const build = () => {
    calendar?.destroy();
    calendar = mountCalendar(host, { locale, mode: "range", value: draft, onChange: show });
  };

  for (const [label, make] of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "px-btn";
    button.dataset.variant = "secondary";
    button.dataset.size = "sm";
    button.textContent = label;
    button.addEventListener("click", () => { show(make()); build(); });
    list.querySelector(".px-daterange-presets").append(button);
  }

  apply.addEventListener("click", () => {
    text.textContent = say(draft);
    delete trigger.dataset.placeholder;
    list.hidePopover();
    trigger.focus();
    emit(root, "px:change", { value: draft });
    options.onChange?.(draft);
  });

  clear.addEventListener("click", () => {
    show(null);
    build();
    text.textContent = say(null);
    trigger.dataset.placeholder = "";
    emit(root, "px:change", { value: null });
    options.onChange?.(null);
  });

  invoke(trigger, list, () => host.querySelector('.px-calendar-day[tabindex="0"]')?.focus(), ["ArrowDown"]);

  text.textContent = say(draft);
  if (!draft) trigger.dataset.placeholder = "";
  show(draft);
  build();
  return { value: () => draft, destroy: () => calendar?.destroy() };
}

/** Wire one form's validation. Constraint validation already knows what broke and says so in
    the user's language, so this only decides when to ask and where the sentence goes: on submit
    for every control, and after that on each change of a control that already failed, so a
    field is never marked wrong while it is still being filled in for the first time.

    Each message lands in the `.px-error` the control names through aria-describedby, which is
    what a reader hears when it reaches the control. The summary is the same sentences over the
    form in a box that takes focus on submit, with a link per line to the control it names —
    a keyboard reaches the first broken field in two keystrokes and never has to hunt. Focus is
    the one announcement: the box is not a live region, so the list can follow each fix in
    silence.

    The box sits above the fields, so it keeps its place in the layout whether or not it has
    anything to say: `data-empty` hides it without taking its space back, and its list holds the
    height of `--px-summary-rows` lines and scrolls past them. A submit therefore leaves the
    button that was pressed exactly where the pointer left it. Put `data-validation` on the form in
    its markup, so each message line is held from the first paint rather than once this mounts. */
export function mountValidation(form, options = {}) {
  const summary = form.querySelector(".px-summary");
  const banner = summary?.closest(".px-alert");
  const list = summary?.querySelector("ol");
  let live = false;

  const described = (control) => (control.getAttribute("aria-describedby") ?? "").split(/\s+/).map((id) => document.getElementById(id)).find((node) => node?.classList.contains("px-error"));
  const controls = () => [...form.elements].filter((element) => element.willValidate && !element.disabled && element.type !== "submit" && element.type !== "image");
  const named = (control) => form.querySelector(`label[for="${control.id}"]`)?.textContent.trim() ?? control.name;

  const mark = (control) => {
    const message = control.validity.valid ? "" : options.message?.(control) ?? control.dataset.error ?? control.validationMessage;
    const target = control.closest(".px-number, .px-tokens, .px-otp") ?? control;
    if (message) target.setAttribute("aria-invalid", "true");
    else target.removeAttribute("aria-invalid");
    const slot = described(control);
    if (slot) slot.innerHTML = message ? `<px-icon name="error"></px-icon>${escapeHtml(message)}` : "";
    return message;
  };

  const review = () => {
    const broken = controls().filter((control) => mark(control));
    if (banner) {
      banner.toggleAttribute("data-empty", broken.length === 0);
      list?.replaceChildren(...broken.map((control) => {
        const line = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#${identify(control, "px-control")}`;
        link.textContent = `${named(control)}: ${mark(control)}`;
        link.addEventListener("click", (event) => { event.preventDefault(); control.focus(); });
        line.append(link);
        return line;
      }));
    }
    return broken;
  };

  form.noValidate = true;
  form.toggleAttribute("data-validation", true);
  form.addEventListener("submit", (event) => {
    live = true;
    const broken = review();
    if (!broken.length) return;
    event.preventDefault();
    (banner ?? broken[0]).focus();
  });
  form.addEventListener("input", (event) => { if (live) { mark(event.target); review(); } });
  form.addEventListener("change", (event) => { if (live) { mark(event.target); review(); } });
  form.addEventListener("reset", () => {
    live = false;
    queueMicrotask(() => {
      for (const control of controls()) {
        (control.closest(".px-number, .px-tokens, .px-otp") ?? control).removeAttribute("aria-invalid");
        const slot = described(control);
        if (slot) slot.innerHTML = "";
      }
      if (banner) banner.toggleAttribute("data-empty", true);
    });
  });

  if (banner) {
    banner.toggleAttribute("data-empty", true);
    banner.style.setProperty("--px-summary-rows", String(Math.min(Math.max(controls().length, 1), SUMMARY_ROWS)));
    banner.tabIndex = -1;
  }
  return { review, key: toKey };
}

/** Wire one `.px-quiz`: a multi-step question flow over a single form. Each step is a
    `fieldset[data-step]` whose controls share the step's name, and only one is in the document's
    tab order at a time. A step carrying `data-when="markets=fx"` appears only once that answer
    holds, so the count reads against the questions this reader will actually be asked rather
    than every question authored. `data-optional` puts Skip in the footer and lets Next through
    unanswered.

    Digits 1 to 9 pick an answer, because a flow someone runs once should still be finishable
    without leaving the keyboard, and the `.px-kbd` in each answer is the promise that they do.
    `value` seeds the flow from a saved answer set, so an interrupted run resumes where it
    stopped; each step emits `px:step` with the answers so far for whoever is saving them. */
export function mountQuestionnaire(form, options = {}) {
  const steps = [...form.querySelectorAll("fieldset[data-step]")];
  const counter = form.querySelector(".px-quiz-count");
  const bar = form.querySelector(".px-progress > i");
  const back = form.querySelector('[data-quiz="back"]');
  const next = form.querySelector('[data-quiz="next"]');
  const skip = form.querySelector('[data-quiz="skip"]');
  const stack = next.querySelector(".px-quiz-next");
  const [onward, finish] = [...stack.children].map((label) => label.textContent.trim());
  const answers = { ...options.value };

  const controls = (step) => [...step.querySelectorAll("input, textarea, select")];
  const boxes = (step) => controls(step).filter((control) => control.type === "checkbox" || control.type === "radio");

  const counted = (at, total) => `Question ${at + 1} of ${total}`;
  /* Every count the flow can reach, since a step carrying `data-when` is asked only sometimes and
     the total moves with it: the space held is the widest of them and never changes, so the bar
     under the count stays where it is whichever question is on screen. */
  const count = counter && mountMorph(counter, { reserve: steps.flatMap((_, index) => Array.from({ length: index + 1 }, (_, at) => counted(at, index + 1))) });
  let came = 0;

  const read = (step) => {
    const picked = boxes(step);
    if (picked.length) {
      const on = picked.filter((control) => control.checked).map((control) => control.value);
      if (!on.length) return null;
      return picked[0].type === "checkbox" ? on : on[0];
    }
    const typed = controls(step).map((control) => control.value.trim()).filter(Boolean);
    return typed.length ? typed[0] : null;
  };

  const holds = (name, value, from) => {
    const held = from[name];
    return Array.isArray(held) ? held.includes(value) : held === value;
  };
  const asked = (step, from) => !step.dataset.when || holds(...step.dataset.when.split("="), from);
  const applicable = () => steps.reduce((so, step) => (asked(step, so.held) ? { list: [...so.list, step], held: step.dataset.step in answers ? { ...so.held, [step.dataset.step]: answers[step.dataset.step] } : so.held } : so), { list: [], held: {} });
  const live = () => applicable().list;
  const kept = () => applicable().held;
  let current = live().find((step) => answers[step.dataset.step] === undefined) ?? live().at(-1);
  const label = document.createElement("span");
  label.append(Object.assign(document.createElement("span"), { textContent: current === live().at(-1) ? finish : onward }));
  stack.append(label);
  const going = mountMorph(label, { reserve: [onward, finish] });
  stack.dataset.mounted = "";

  const show = () => {
    const list = live();
    const at = list.indexOf(current);
    const last = at === list.length - 1;
    for (const step of steps) step.hidden = step !== current;
    if (count) {
      counter.dataset.direction = at < came ? "down" : "up";
      came = at;
      count.set(counted(at, list.length));
    }
    if (bar) bar.style.inlineSize = `${Math.round(((at + 1) / list.length) * 100)}%`;
    if (back) back.disabled = at === 0;
    if (skip) skip.hidden = current.dataset.optional === undefined;
    going.set(last ? finish : onward);
    next.disabled = read(current) === null && current.dataset.optional === undefined;
  };

  const go = (delta) => {
    const list = live();
    const to = list[list.indexOf(current) + delta];
    if (!to) return;
    current = to;
    show();
    (controls(current)[0] ?? next).focus();
  };

  const advance = (skipped) => {
    const step = current;
    answers[step.dataset.step] = skipped ? null : read(step);
    const list = live();
    const at = list.indexOf(step);
    const emitted = kept();
    emit(form, "px:step", { step: step.dataset.step, value: answers[step.dataset.step], answers: emitted });
    options.onStep?.(step.dataset.step, emitted);
    if (at === list.length - 1) {
      emit(form, "px:complete", { answers: emitted });
      options.onComplete?.(emitted);
      return;
    }
    current = list[at + 1];
    show();
    (controls(current)[0] ?? next).focus();
  };

  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("change", show);
  form.addEventListener("input", show);
  next.addEventListener("click", () => advance(false));
  back?.addEventListener("click", () => go(-1));
  skip?.addEventListener("click", () => advance(true));

  form.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter" && !next.disabled && !event.target.closest("button")) {
      event.preventDefault();
      advance(false);
      return;
    }
    const picked = boxes(current);
    const at = Number(event.key) - 1;
    if (!picked.length || !Number.isInteger(at) || at < 0 || at >= picked.length) return;
    if (event.target.matches("input:not([type=checkbox]):not([type=radio]), textarea")) return;
    event.preventDefault();
    picked[at].click();
    picked[at].focus();
  });

  for (const step of steps) {
    const held = answers[step.dataset.step];
    if (held === undefined || held === null) continue;
    for (const control of boxes(step)) control.checked = [held].flat().includes(control.value);
    for (const control of controls(step)) if (!boxes(step).includes(control)) control.value = held;
  }
  show();
  return { value: () => ({ ...answers }), step: () => current.dataset.step };
}

const ACTION_STATES = ["idle", "pending", "succeeded", "failed"];
const ACTION_ICONS = { pending: "loading", succeeded: "success", failed: "error" };
const ACTION_LINGER = 1000;

const dwell = () => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--px-dwell-short").trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 4000;
  return raw.endsWith("ms") ? value : value * 1000;
};

export function mountAction(button, { onAction, announce: spoken, minPendingMs = 0, resetDelayMs } = {}) {
  if (!spoken?.failed) throw new Error("mountAction needs announce.failed, the sentence that says whether trying again helps");
  const faces = button.querySelector(".px-action-icon");
  const stack = button.querySelector(".px-action-label");
  const labels = Object.fromEntries(ACTION_STATES.map((name, index) => [name, stack.children[index].textContent.trim()]));
  faces.setAttribute("aria-hidden", "true");
  for (const name of ACTION_STATES) {
    const face = document.createElement("span");
    face.dataset.face = name;
    if (name === "idle") face.append(...faces.childNodes);
    else face.innerHTML = icon(ACTION_ICONS[name]);
    faces.append(face);
  }
  const label = document.createElement("span");
  label.append(Object.assign(document.createElement("span"), { textContent: labels.idle }));
  stack.append(label);
  const morph = mountMorph(label);

  const region = (role) => {
    const node = document.createElement("span");
    node.className = "px-sr-only";
    node.setAttribute("role", role);
    node.setAttribute("aria-atomic", "true");
    return node;
  };
  const regions = { polite: region("status"), assertive: region("alert") };
  button.after(regions.polite, regions.assertive);

  let state = "idle";
  let flight = null;
  let clearing;
  const frames = {};
  const timers = new Set();

  const paint = (next) => {
    button.dataset.state = next;
    for (const face of faces.children) face.dataset.on = String(face.dataset.face === next);
    if (next === "pending") button.setAttribute("aria-disabled", "true");
    else button.removeAttribute("aria-disabled");
  };
  const show = (next) => {
    const down = ACTION_STATES.indexOf(next) <= ACTION_STATES.indexOf(state);
    state = next;
    paint(next);
    if (down) label.dataset.direction = "down";
    else delete label.dataset.direction;
    morph.set(labels[next]);
  };
  const speak = (channel, text) => {
    cancelAnimationFrame(frames[channel]);
    regions[channel].textContent = "";
    frames[channel] = requestAnimationFrame(() => {
      regions[channel].textContent = text;
      clearTimeout(clearing);
      clearing = setTimeout(() => {
        regions.polite.textContent = "";
        regions.assertive.textContent = "";
      }, ACTION_LINGER);
    });
  };
  const wait = (ms) =>
    new Promise((done) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        done();
      }, ms);
      timers.add(timer);
    });

  const start = async () => {
    if (state === "pending" || button.disabled) return;
    flight?.abort();
    const run = new AbortController();
    flight = run;
    show("pending");
    speak("polite", spoken.pending ?? labels.pending);
    const started = performance.now();
    let failed = false;
    try {
      await onAction(run.signal);
    } catch {
      failed = true;
    }
    if (run.signal.aborted) return;
    const rest = minPendingMs - (performance.now() - started);
    if (rest > 0) await wait(rest);
    if (run.signal.aborted) return;
    if (failed) {
      show("failed");
      speak("assertive", spoken.failed);
      return;
    }
    show("succeeded");
    speak("polite", spoken.succeeded ?? labels.succeeded);
    const hold = resetDelayMs ?? dwell();
    if (hold <= 0) return;
    await wait(hold);
    if (run.signal.aborted) return;
    show("idle");
  };

  paint("idle");
  button.addEventListener("click", start);
  return () => {
    flight?.abort();
    for (const timer of timers) clearTimeout(timer);
    for (const frame of Object.values(frames)) cancelAnimationFrame(frame);
    clearTimeout(clearing);
    button.removeEventListener("click", start);
  };
}
