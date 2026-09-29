const MINUS = "−";

/** @typedef {{ locale: string, currency: string }} PxNumberLocale */
/** @typedef {"gain" | "loss" | "flat"} Tone */
/** @typedef {"money" | "r" | "percent"} SignedKind */
/** @typedef {boolean | "auto" | "always" | "never"} Signed */
/** @typedef {Intl.NumberFormatOptions & { signed?: Signed, fraction?: number }} FormatOptions */

const fallback = /** @type {PxNumberLocale} */ ({ locale: "en-US", currency: "USD" });

const readVar = (style, name, def) => {
  const raw = style.getPropertyValue(name).trim().replace(/^["']|["']$/g, "");
  return raw === "" ? def : raw;
};

/** The locale tokens a number needs. Hot callers read once and pass the result down; a table
 *  formatting thirty rows should not ask the engine for computed style thirty times.
 *  @param {HTMLElement | null} [root]
 *  @returns {PxNumberLocale} */
export function readNumberLocale(root = typeof document === "undefined" ? null : document.documentElement) {
  if (!root) return fallback;
  const style = getComputedStyle(root);
  return { locale: readVar(style, "--px-locale", fallback.locale), currency: readVar(style, "--px-currency", fallback.currency) };
}

const formatters = new Map();
const format = (locale, options, value) => {
  const key = `${locale}\u0000${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) formatters.set(key, (formatter = new Intl.NumberFormat(locale, options)));
  return formatter.format(value === 0 ? 0 : value).replace(/-/g, MINUS);
};

/** @param {Signed} [signed] */
const signDisplay = (signed) => (signed === "never" ? "never" : signed === true || signed === "always" ? "exceptZero" : "auto");

const fixed = (fraction) => (fraction === undefined ? undefined : { minimumFractionDigits: fraction, maximumFractionDigits: fraction });

/** The Intl options a money figure is written with, for the one consumer that has to format the
 *  number itself: NumberFlow rolls digits from an options object, not from a string. Sharing the
 *  options keeps a rolling balance and a still one from disagreeing about currency or sign.
 *  Scientific and engineering notation are typed away: no PX surface writes money that way, and
 *  NumberFlow's own options type does not accept them.
 *  @param {FormatOptions & { currency?: string }} [options] @param {PxNumberLocale} [px]
 *  @returns {Omit<Intl.NumberFormatOptions, "notation"> & { notation?: "standard" | "compact" }} */
export function moneyOptions(options = {}, px = readNumberLocale()) {
  const { signed, fraction, currency = px.currency, ...rest } = options;
  return { style: "currency", currency, signDisplay: signDisplay(signed), ...fixed(fraction), ...rest };
}

/** Money in the account's currency. Unsigned by default — a balance is not a change — but a
 *  negative one still shows its minus, because "never" would hide it.
 *  @param {number} value @param {FormatOptions & { currency?: string }} [options] @param {PxNumberLocale} [px] */
export function money(value, options = {}, px = readNumberLocale()) {
  return format(px.locale, moneyOptions(options, px), value);
}

/** A change in money: the same formatter with the sign always shown, so a gain reads +$1,180.00.
 *  @param {number} value @param {FormatOptions & { currency?: string }} [options] @param {PxNumberLocale} [px] */
export function pnl(value, options = {}, px = readNumberLocale()) {
  return money(value, { signed: true, ...options }, px);
}

/** A risk multiple, one fraction digit because the second is noise on a ratio of risk. The R is
 *  a suffix rather than an Intl unit; there is no unit for it, and bidi keeps it with its number.
 *  @param {number} value @param {FormatOptions} [options] @param {PxNumberLocale} [px] */
export function rMultiple(value, options = {}, px = readNumberLocale()) {
  const { signed, fraction = 1, ...rest } = options;
  return `${format(px.locale, { signDisplay: signDisplay(signed), ...fixed(fraction), ...rest }, value)}R`;
}

/** A percentage from a fraction: 0.092 is 9.2%. At most one fraction digit, so a win rate reads
 *  58% and a weekly change reads 9.2%; a column that has to align passes `fraction`.
 *  @param {number} value @param {FormatOptions} [options] @param {PxNumberLocale} [px] */
export function percent(value, options = {}, px = readNumberLocale()) {
  const { signed, fraction, ...rest } = options;
  return format(px.locale, { style: "percent", signDisplay: signDisplay(signed), minimumFractionDigits: 0, maximumFractionDigits: 1, ...fixed(fraction), ...rest }, value);
}

/** A contract size, grouped in the page locale and never signed. With a symbol it reads "3 MNQ";
 *  without one it is the bare count, because the noun is product copy and would not translate.
 *  @param {number} count @param {string} [symbol] @param {PxNumberLocale} [px] */
export function contracts(count, symbol, px = readNumberLocale()) {
  const size = format(px.locale, { maximumFractionDigits: 0 }, Math.abs(count));
  return symbol ? `${size} ${symbol}` : size;
}

/** @param {number} value @returns {Tone} */
export function toneOf(value) {
  return value > 0 ? "gain" : value < 0 ? "loss" : "flat";
}

/** The text and the tone of one signed figure, which is the whole of what a signed display needs.
 *  Every kind shows its sign by default: the tint is emphasis over a value that already says
 *  which way it went, so a display that drops the sign would leave colour alone carrying it.
 *  @param {number} value
 *  @param {FormatOptions & { kind?: SignedKind, currency?: string }} [options]
 *  @param {PxNumberLocale} [px]
 *  @returns {{ text: string, tone: Tone }} */
export function signedValue(value, options = {}, px = readNumberLocale()) {
  const { kind = "money", signed = true, ...rest } = options;
  const write = kind === "r" ? rMultiple : kind === "percent" ? percent : money;
  return { text: write(value, { signed, ...rest }, px), tone: toneOf(value) };
}

/** Money from a safe integer number of cents. The fraction is `cents % 100` in the
 *  locale's digits, so the remainder stays exact when dollars-as-float would not.
 *  Only `signed` and `currency`; a change passes `{ signed: true }`.
 *  @param {number} cents @param {{ signed?: Signed, currency?: string }} [options] @param {PxNumberLocale} [px] */
export function moneyFromCents(cents, options = {}, px = readNumberLocale()) {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("moneyFromCents requires a safe integer number of cents");
  }
  const { signed, currency, ...rest } = options;
  if (Object.keys(rest).length !== 0) {
    throw new TypeError("moneyFromCents supports signed and currency only");
  }
  const negative = cents < 0;
  const abs = negative ? -cents : cents;
  const remainder = abs % 100;
  const dollars = (abs - remainder) / 100;
  const sample = cents === 0 ? 0 : dollars === 0 ? (negative ? -1 : 1) : negative ? -dollars : dollars;
  const parts = new Intl.NumberFormat(px.locale, moneyOptions({ signed, currency, fraction: 2 }, px)).formatToParts(sample);
  const remainderDigits = format(px.locale, { useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0 }, remainder);
  const zeroDigit = format(px.locale, { useGrouping: false, maximumFractionDigits: 0 }, 0);
  return parts
    .map((part) => {
      if (part.type === "fraction") return remainderDigits;
      if (part.type === "integer" && dollars === 0 && cents !== 0) return zeroDigit;
      return part.value;
    })
    .join("")
    .replace(/-/g, MINUS);
}

export { MINUS };
