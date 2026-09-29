/** @typedef {0 | 1 | 2 | 3 | 4 | 5 | 6} WeekStart */
/** @typedef {{ locale: string, timeZone: string, hourCycle: "h12" | "h23", weekStartsOn: WeekStart, dir: "ltr" | "rtl" }} Locale */

const fallback = /** @type {Locale} */ ({ locale: "en-US", timeZone: "UTC", hourCycle: "h12", weekStartsOn: 0, dir: "ltr" });

const readVar = (style, name, def) => {
  const raw = style.getPropertyValue(name).trim().replace(/^["']|["']$/g, "");
  return raw === "" ? def : raw;
};

/** @param {HTMLElement | null} [root] @returns {Locale} */
export function readLocale(root = typeof document === "undefined" ? null : document.documentElement) {
  if (!root) return fallback;
  const style = getComputedStyle(root);
  const weekStart = Number(readVar(style, "--ui-week-start", "0"));
  return {
    locale: readVar(style, "--ui-locale", fallback.locale),
    timeZone: readVar(style, "--ui-time-zone", fallback.timeZone),
    hourCycle: readVar(style, "--ui-hour-cycle", fallback.hourCycle) === "h23" ? "h23" : "h12",
    weekStartsOn: /** @type {WeekStart} */ (weekStart >= 0 && weekStart <= 6 ? weekStart : 0),
    dir: root.dir === "rtl" ? "rtl" : "ltr",
  };
}

/** @param {string} timeZone @returns {Date} */
export function todayIn(timeZone) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** @param {Date} date @param {Intl.DateTimeFormatOptions} [options] @param {Locale} [lc] @returns {string} */
export function formatDate(date, options = { dateStyle: "medium" }, lc = readLocale()) {
  return new Intl.DateTimeFormat(lc.locale, { timeZone: lc.timeZone, ...options }).format(date);
}

/** A calendar date is a day rather than an instant: it is built at local midnight, so converting it
 *  into the display time zone lands on the day before wherever that zone is behind the reader. The
 *  day is the Gregorian one the calendar draws, written in the page's own language and digits, so
 *  the text agrees with the grid beside it. `parseCalendarDate` reads that text back when the
 *  options name a year and spell the month out, which is the shape a date field writes and the
 *  shape an era can be added to; other shapes still write the right day but need not read back.
 *  @param {Date} date @param {Intl.DateTimeFormatOptions} [options] @param {Locale} [lc] @returns {string} */
export function formatCalendarDate(date, options = { dateStyle: "medium" }, lc = readLocale()) {
  return calendarFormat(date, options, lc).format(date);
}

/** The span between two calendar days as one phrase: `Intl` drops the month, year and era the ends
 *  share and joins them the way the locale joins a range, which two dates and a dash cannot do. The
 *  shape is the one a range field writes, and the calendar and era are `formatCalendarDate`'s, so
 *  a range and a single date on the same page name the same day the same way.
 *  @param {Date} from @param {Date} to @param {Locale} [lc] @returns {string} */
export function formatCalendarRange(from, to, lc = readLocale()) {
  return calendarFormat(from, { day: "numeric", month: "short", year: "numeric" }, lc).formatRange(from, to);
}

/** @param {Date} date @param {Intl.DateTimeFormatOptions} options @param {Locale} lc */
function calendarFormat(date, options, lc) {
  const gregorian = { calendar: "gregory", ...options };
  const format = new Intl.DateTimeFormat(lc.locale, gregorian);
  if (gregorian.dateStyle || gregorian.era || !gregorianEra(lc.locale).named.length) return format;
  const parts = format.formatToParts(date);
  const spelled = parts.some((part) => part.type === "year") && parts.some((part) => part.type === "month" && /\p{L}/u.test(part.value));
  return spelled ? new Intl.DateTimeFormat(lc.locale, { ...gregorian, era: "short" }) : format;
}

/** @param {number} year @param {number} month @param {number} day */
function calendarDay(year, month, day) {
  const date = new Date(year, month - 1, day);
  return year >= 1000 && year <= 9999 && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

/** @typedef {{ pattern: RegExp, months: Set<number>, weekdays: Set<number> }} DateName */
/** @typedef {{ plain: (value: string) => string, names: DateName[], words: Set<string>, numeric: string[][], named: string[][] }} DateReader */
/** @typedef {{ named: string[], numeric: string[] }} EraNames */

/** @type {Map<string, DateReader>} */
const readers = new Map();
/** @type {Map<string, EraNames>} */
const eras = new Map();
const everyMonth = Array.from({ length: 12 }, (_, month) => new Date(2026, month, 15));

/** @type {Intl.DateTimeFormatOptions[]} */
const written = [
  { day: "numeric", month: "numeric", year: "numeric" },
  { day: "numeric", month: "short", year: "numeric" },
  { day: "numeric", month: "long", year: "numeric" },
  { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  { dateStyle: "medium" },
  { dateStyle: "long" },
  { dateStyle: "full" },
];

/** @param {string} name */
function namePattern(name) {
  const kind = (char) => (char && /\d/.test(char) ? "\\d" : char && /[\p{L}\p{M}]/u.test(char) ? "[\\p{L}\\p{M}]" : "");
  const lead = kind(name[0]) === "\\d" ? "(?<!\\d)" : "";
  const tail = kind(name.at(-1));
  return new RegExp(`${lead}${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${tail ? `(?!${tail})` : ""}`, "gu");
}

/** @param {string} tag @returns {DateReader} */
function dateReader(tag) {
  const known = readers.get(tag);
  if (known) return known;
  const { numberingSystem, locale } = new Intl.DateTimeFormat(tag, { ...written[0], calendar: "gregory" }).resolvedOptions();
  const digits = new Intl.NumberFormat(locale, { numberingSystem, useGrouping: false });
  const glyphs = Array.from({ length: 10 }, (_, n) => digits.format(n));
  const plain = (value) => glyphs.reduce((out, glyph, n) => out.replaceAll(glyph, String(n)), value.toLocaleLowerCase(locale)).replace(/\s+/gu, " ");
  const lowered = new Map();
  const plainPart = (value) => {
    if (!lowered.has(value)) lowered.set(value, plain(value));
    return lowered.get(value) ?? value;
  };
  /** @type {Map<string, { months: Set<number>, weekdays: Set<number> }>} */
  const found = new Map();
  const literals = new Set();
  const numeric = new Set();
  const named = new Set();
  const dates = [...everyMonth, ...Array.from({ length: 7 }, (_, index) => new Date(2026, 2, 1 + index))];
  /** @type {Intl.DateTimeFormatOptions[]} */
  const shapes = [...written, { month: "long" }, { month: "short" }, { weekday: "long" }, { weekday: "short" }];
  for (const options of shapes) {
    const format = new Intl.DateTimeFormat(locale, { calendar: "gregory", ...options });
    for (const date of dates) {
      const parts = format.formatToParts(date).map((part) => ({ type: part.type, value: plainPart(part.value) }));
      for (const [index, { type, value }] of parts.entries()) {
        if (type !== "month" && type !== "weekday") for (const word of value.match(/[\p{L}\p{M}]+/gu) ?? []) literals.add(word);
        if ((type !== "month" && type !== "weekday") || !/\p{L}/u.test(value)) continue;
        const next = parts[index + 1];
        for (const name of new Set([value, value + (next?.type === "literal" ? (next.value.match(/^[\p{L}\p{M}]+/u)?.[0] ?? "") : "")])) {
          const entry = found.get(name) ?? { months: new Set(), weekdays: new Set() };
          if (type === "month") entry.months.add(date.getMonth() + 1);
          else entry.weekdays.add(date.getDay());
          found.set(name, entry);
        }
      }
      const order = parts.map((part) => part.type).filter((type) => type === "day" || type === "month" || type === "year");
      if (order.length !== 3) continue;
      named.add(order.join());
      if (!parts.some((part) => part.type === "month" && /\p{L}/u.test(part.value))) numeric.add(order.join());
    }
  }
  const reader = {
    plain,
    names: [...found]
      .filter(([name]) => !literals.has(name))
      .sort(([a], [b]) => b.length - a.length)
      .map(([name, entry]) => ({ pattern: namePattern(name), ...entry })),
    words: literals,
    numeric: [...numeric].map((order) => order.split(",")),
    named: [...named].map((order) => order.split(",")),
  };
  readers.set(tag, reader);
  return reader;
}

/** A locale whose own calendar writes a date this reader would take leaves the Gregorian one
 *  ambiguous, so there a Gregorian date names its era and text without that era is not read as
 *  one. Thai leaves both shapes ambiguous — it names March the same word either way and only the
 *  year moves — while Persian only collides on bare numbers, whose named dates need no era.
 *  @param {string} tag @returns {EraNames} */
function gregorianEra(tag) {
  const known = eras.get(tag);
  if (known) return known;
  /** @type {EraNames} */
  const found = { named: [], numeric: [] };
  eras.set(tag, found);
  if (new Intl.DateTimeFormat(tag).resolvedOptions().calendar !== "gregory") {
    const names = /** @type {const} */ (["short", "long", "narrow"])
      .map((era) => new Intl.DateTimeFormat(tag, { calendar: "gregory", era, year: "numeric" }).formatToParts(everyMonth[0]).find((part) => part.type === "era")?.value)
      .filter((name) => name !== undefined);
    for (const options of written) {
      const own = new Intl.DateTimeFormat(tag, options);
      for (const date of everyMonth)
        if (readWritten(own.format(date), tag)) found[own.formatToParts(date).some((part) => part.type === "month" && /\p{L}/u.test(part.value)) ? "named" : "numeric"] = names;
    }
  }
  return found;
}

/** @param {string} text @param {string} tag */
function readWritten(text, tag) {
  const reader = dateReader(tag);
  /** @type {(DateName & { at: number })[]} */
  const spans = [];
  let rest = reader.plain(text);
  for (const name of reader.names)
    rest = rest.replace(name.pattern, (match, at) => {
      spans.push({ ...name, at });
      return " ".repeat(match.length);
    });
  if ((rest.match(/[\p{L}\p{M}]+/gu) ?? []).some((word) => !reader.words.has(word))) return undefined;
  const numbers = rest.match(/\d+/g) ?? [];
  const era = gregorianEra(tag)[numbers.length === 2 ? "named" : "numeric"];
  if (era.length && !era.some((name) => rest.includes(reader.plain(name)))) return undefined;
  const choices =
    numbers.length === 2
      ? spans.flatMap((span, index) => [...span.months].map((month) => ({ month, index, slot: (rest.slice(0, span.at).match(/\d+/g) ?? []).length })))
      : numbers.length === 3
        ? [{ month: undefined, index: -1, slot: -1 }]
        : [];
  /** @type {Map<number, Date>} */
  const readings = new Map();
  for (const { month, index, slot } of choices) {
    const weekdays = spans.filter((_, other) => other !== index);
    if (weekdays.some((span) => !span.weekdays.size)) continue;
    for (const order of month === undefined ? reader.numeric : reader.named) {
      if (month !== undefined && order.indexOf("month") !== slot) continue;
      const fields = month === undefined ? order : order.filter((type) => type !== "month");
      const read = (type) => Number(numbers[fields.indexOf(type)]);
      const date = calendarDay(read("year"), month ?? read("month"), read("day"));
      if (date && weekdays.every((span) => span.weekdays.has(date.getDay()))) readings.set(date.getTime(), date);
    }
  }
  return readings.size === 1 ? [...readings.values()][0] : undefined;
}

/** @param {string} text @param {Locale} [lc] @returns {Date | undefined} */
export function parseCalendarDate(text, lc = readLocale()) {
  const iso = text.trim().match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  const standard = iso ? calendarDay(Number(iso[1]), Number(iso[2] ?? 1), Number(iso[3] ?? 1)) : undefined;
  const local = readWritten(text, lc.locale);
  return standard && local && standard.getTime() !== local.getTime() ? undefined : (standard ?? local);
}

/** @param {Date} date @param {Intl.DateTimeFormatOptions} [options] @param {Locale} [lc] @returns {string} */
export function formatTime(date, options = { timeStyle: "short" }, lc = readLocale()) {
  return new Intl.DateTimeFormat(lc.locale, { timeZone: lc.timeZone, hourCycle: lc.hourCycle, ...options }).format(date);
}

/** @param {Date} date @param {string} timeZone @returns {number} */
function dayNumber(date, timeZone) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** @param {Date} date @param {Date} [now] @param {Locale} [lc] @returns {string} */
export function formatRelativeTime(date, now = new Date(), lc = readLocale()) {
  const format = new Intl.RelativeTimeFormat(lc.locale, { numeric: "auto" });
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return format.format(0, "second");
  if (seconds < 3600) return format.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return format.format(-Math.floor(seconds / 3600), "hour");
  const days = Math.max(1, dayNumber(now, lc.timeZone) - dayNumber(date, lc.timeZone));
  if (days < 7) return format.format(-days, "day");
  if (days < 30) return format.format(-Math.floor(days / 7), "week");
  if (days < 365) return format.format(-Math.floor(days / 30), "month");
  return format.format(-Math.floor(days / 365), "year");
}

const relativeUnits = /** @type {const} */ ([["minute", 59], ["hour", 23], ["day", 6], ["week", 4], ["month", 12], ["year", 99]]);

/** @param {Locale} [lc] @returns {string[]} */
export function relativeTimeTexts(lc = readLocale()) {
  const format = new Intl.RelativeTimeFormat(lc.locale, { numeric: "auto" });
  const plural = new Intl.PluralRules(lc.locale);
  const texts = new Set([format.format(0, "second")]);
  for (const [unit, most] of relativeUnits) {
    const forms = new Set();
    for (let n = most; n >= 1; n--) {
      const form = n <= 2 ? n : plural.select(n);
      if (forms.has(form)) continue;
      forms.add(form);
      texts.add(format.format(-n, unit));
    }
  }
  return [...texts];
}

/** @param {Date} date @param {Date} [now] @param {Locale} [lc] @returns {string} */
export function formatDay(date, now = new Date(), lc = readLocale()) {
  const days = Math.max(0, dayNumber(now, lc.timeZone) - dayNumber(date, lc.timeZone));
  if (days <= 1) {
    const word = new Intl.RelativeTimeFormat(lc.locale, { numeric: "auto" }).format(-days, "day");
    return word.charAt(0).toLocaleUpperCase(lc.locale) + word.slice(1);
  }
  const year = formatDate(date, { year: "numeric" }, lc) === formatDate(now, { year: "numeric" }, lc) ? undefined : "numeric";
  return formatDate(date, { weekday: "long", month: "long", day: "numeric", year }, lc);
}
