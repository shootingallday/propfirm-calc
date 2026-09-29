const PAD = { top: 14, end: 10, bottom: 22, start: 48 };
const TICK_GAP = 8;
const MIN_STEP = 2;

const rtlOf = (el) => getComputedStyle(el).direction === "rtl";
const leftAnchor = (f) => (f.rtl ? "end" : "start");
const rightAnchor = (f) => (f.rtl ? "start" : "end");
const localeOf = (el) => getComputedStyle(el).getPropertyValue("--px-locale").trim().replace(/^["']|["']$/g, "") || undefined;

const num = (value, locale, digits = 0) =>
  Math.abs(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const FORMATS = {
  money: (v, l) => (v < 0 ? "−" : "") + "$" + num(v, l),
  signed: (v, l) => (v < 0 ? "−" : "+") + "$" + num(v, l),
  compact: (v, l) => (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1000 ? num(v / 1000, l, 1) + "k" : num(v, l)),
  price: (v, l) => (v < 0 ? "−" : "") + num(v, l, 2),
  number: (v, l) => (v < 0 ? "−" : "") + num(v, l),
  percent: (v, l) => (v < 0 ? "−" : "") + num(v, l, 1) + "%",
};
const formatter = (name, locale) => (value) => (FORMATS[name] ?? FORMATS.number)(value, locale);

const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const attr = (name, value) => (value == null || value === "" ? "" : ` ${name}="${escape(value)}"`);
const mark = (spec) => attr("data-tone", spec.tone) + attr("data-series", spec.series);

export function ticks(min, max, count = 3) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const start = Math.floor(min / step) * step;
  const out = [];
  for (let v = start; v <= max + step / 2; v += step) if (v >= min - step / 2) out.push(+v.toFixed(10));
  return out.length > 1 ? out : [min, max];
}

export function frame(el, spec) {
  const rtl = rtlOf(el);
  const width = el.clientWidth;
  const height = el.clientHeight;
  const pad = { ...PAD, ...(spec.pad ?? {}) };
  const axisX = rtl ? width - pad.start : pad.start;
  const farX = rtl ? pad.end : width - pad.end;
  return {
    el, rtl, width, height, pad, axisX,
    x0: rtl ? farX : axisX,
    x1: rtl ? axisX : farX,
    top: pad.top,
    bottom: height - pad.bottom,
    at(t) { return this.x0 + (this.x1 - this.x0) * t; },
    band(i, n) { return this.x0 + ((this.x1 - this.x0) / n) * (i + 0.5); },
    tickAnchor: "end",
    tickX: axisX + (rtl ? TICK_GAP : -TICK_GAP),
  };
}

let ruler;
function widestTick(f, texts) {
  ruler ??= document.createElement("canvas").getContext("2d");
  const style = getComputedStyle(f.el);
  ruler.font = `500 ${style.getPropertyValue("--px-text-xs").trim() || "12px"} ${style.fontFamily}`;
  return Math.max(0, ...texts.map((text) => ruler.measureText(text).width));
}

export function gutter(f, width) {
  const start = Math.max(f.pad.start, Math.ceil(width) + TICK_GAP * 2);
  if (start === f.pad.start) return;
  f.pad.start = start;
  f.axisX = f.rtl ? f.width - start : start;
  const farX = f.rtl ? f.pad.end : f.width - f.pad.end;
  f.x0 = f.rtl ? farX : f.axisX;
  f.x1 = f.rtl ? f.axisX : farX;
  f.tickX = f.axisX + (f.rtl ? TICK_GAP : -TICK_GAP);
}

function axes(f, values, format, spec) {
  const scale = (v) => f.bottom - ((v - values.min) / (values.max - values.min || 1)) * (f.bottom - f.top);
  const rows = spec.axis === false ? [] : ticks(values.min, values.max, spec.tickCount ?? 3);
  gutter(f, widestTick(f, rows.map(format)));
  const grid = rows
    .map((v) => `<line class="px-chart-grid" x1="${f.x0}" x2="${f.x1}" y1="${scale(v).toFixed(1)}" y2="${scale(v).toFixed(1)}"/>`)
    .join("");
  const labels = rows
    .map((v) => `<text class="px-chart-tick" x="${f.tickX}" y="${(scale(v) + 4).toFixed(1)}" text-anchor="${f.tickAnchor}">${escape(format(v))}</text>`)
    .join("");
  return { scale, svg: `<g>${grid}${labels}</g>` };
}

export function xTicks(f, labels, positions) {
  if (!labels?.length) return "";
  const last = labels.length - 1;
  const count = Math.min(5, labels.length);
  const picked = Array.from({ length: count }, (_, k) => Math.round((k * last) / Math.max(1, count - 1)));
  return [...new Set(picked)]
    .map((i) => {
      const anchor = i === 0 ? leftAnchor(f) : i === last ? rightAnchor(f) : "middle";
      return `<text class="px-chart-tick" x="${positions(i).toFixed(1)}" y="${(f.height - 6).toFixed(1)}" text-anchor="${anchor}">${escape(labels[i])}</text>`;
    })
    .join("");
}

export function lineChart(el, spec, f, format) {
  const all = spec.series.flatMap((s) => s.values);
  const extra = [...(spec.refs ?? []).map((r) => r.value), ...(spec.bands ?? []).flatMap((b) => [b.from, b.to])];
  const pool = [...all, ...extra];
  const span = Math.max(...pool) - Math.min(...pool);
  const values = { min: Math.min(...pool) - span * (spec.padScale ?? 0), max: Math.max(...pool) + span * (spec.padScale ?? 0) };
  const { scale, svg: grid } = axes(f, values, format, spec);
  const count = spec.series[0].values.length;
  const at = (i) => f.at(count > 1 ? i / (count - 1) : 0.5);

  const bands = (spec.bands ?? [])
    .map((b) => `<rect class="px-chart-band"${mark(b)} x="${Math.min(f.x0, f.x1)}" y="${scale(Math.max(b.from, b.to)).toFixed(1)}" width="${Math.abs(f.x1 - f.x0)}" height="${Math.abs(scale(b.to) - scale(b.from)).toFixed(1)}"/>`)
    .join("");
  const refs = (spec.refs ?? [])
    .map((r) => `<line class="px-chart-ref"${mark(r)} x1="${f.x0}" x2="${f.x1}" y1="${scale(r.value).toFixed(1)}" y2="${scale(r.value).toFixed(1)}"/>`
      + `<text class="px-chart-label"${mark(r)} x="${f.x1}" y="${(scale(r.value) - 6).toFixed(1)}" text-anchor="${rightAnchor(f)}">${escape(r.label)}</text>`)
    .join("");

  const paths = spec.series
    .map((s, index) => {
      const d = "M" + s.values.map((v, i) => `${at(i).toFixed(1)},${scale(v).toFixed(1)}`).join(" L");
      const tone = mark({ tone: s.tone, series: s.series ?? (spec.series.length > 1 ? index + 1 : null) });
      const area = spec.area && spec.series.length === 1
        ? `<path class="px-chart-area"${tone} d="${d} L${at(count - 1).toFixed(1)},${f.bottom} L${at(0).toFixed(1)},${f.bottom} Z"/>`
        : "";
      return `${area}<path class="px-chart-line"${tone}${spec.reveal === false ? "" : ' data-reveal=""'} d="${d}"/>`;
    })
    .join("");

  const points = (spec.points ?? [])
    .map((p) => `<circle class="px-chart-point"${mark(p)} cx="${at(p.index).toFixed(1)}" cy="${scale(spec.series[p.series ? p.series - 1 : 0].values[p.index]).toFixed(1)}" r="5"/>`)
    .join("");

  const cursor = `<g class="px-chart-cursor-group" opacity="0"><line class="px-chart-cursor" y1="${f.top}" y2="${f.bottom}"/>`
    + spec.series.map((s, i) => `<circle class="px-chart-point"${mark({ tone: s.tone, series: s.series ?? (spec.series.length > 1 ? i + 1 : null) })} r="4"/>`).join("")
    + `</g>`;

  return {
    svg: grid + bands + paths + refs + points + xTicks(f, spec.labels, at) + cursor,
    hit: (fraction) => {
      const i = Math.round((count - 1) * fraction);
      return i >= 0 && i < count ? { index: i, x: at(i), y: scale(spec.series[0].values[i]), ys: spec.series.map((s) => scale(s.values[i])) } : null;
    },
  };
}

function barChart(el, spec, f, format) {
  const all = spec.series[0].values;
  const diverging = spec.diverging !== false && all.some((v) => v < 0);
  const limit = Math.max(...all.map(Math.abs));
  const values = diverging ? { min: -limit, max: limit } : { min: 0, max: Math.max(...all) };
  const { scale, svg: grid } = axes(f, values, format, { ...spec, axis: spec.axis ?? !diverging });
  const zero = scale(0);
  const n = all.length;
  const width = Math.max(MIN_STEP, Math.abs(f.x1 - f.x0) / n - 6);

  const best = all.indexOf(Math.max(...all));
  const worst = all.indexOf(Math.min(...all));
  const bars = all
    .map((v, i) => {
      const centre = f.band(i, n);
      const height = Math.max(MIN_STEP, Math.abs(scale(v) - zero));
      const y = v >= 0 ? zero - height : zero;
      const tone = spec.series[0].tone ?? (diverging ? (v >= 0 ? "gain" : "loss") : null);
      const anchor = i === 0 ? leftAnchor(f) : i === n - 1 ? rightAnchor(f) : "middle";
      const labelX = i === 0 ? centre - width / 2 : i === n - 1 ? centre + width / 2 : centre;
      const label = spec.labelExtremes !== false && (i === best || i === worst)
        ? `<text class="px-chart-label"${mark({ tone })} x="${labelX.toFixed(1)}" y="${(v >= 0 ? y - 6 : y + height + 13).toFixed(1)}" text-anchor="${anchor}">${escape(format(v))}</text>`
        : "";
      return `<rect class="px-chart-bar"${mark({ tone, series: spec.series[0].series })} data-i="${i}" data-reveal="" style="--baseline:${zero.toFixed(1)}px; --i:${i}" x="${(centre - width / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="3"/>${label}`;
    })
    .join("");

  const baseline = `<line class="px-chart-axis" x1="${f.x0}" x2="${f.x1}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}"/>`;
  return {
    svg: grid + baseline + bars + xTicks(f, spec.labels, (i) => f.band(i, n)),
    marks: true,
    at: (i) => ({ x: f.band(i, n), y: Math.min(zero, scale(all[i])) }),
  };
}

function candleChart(el, spec, f, format) {
  const candles = spec.candles;
  const pool = candles.flatMap((c) => [c.h, c.l]);
  const values = { min: Math.min(...pool), max: Math.max(...pool) };
  const { scale, svg: grid } = axes(f, values, format, spec);
  const n = candles.length;
  const width = Math.max(MIN_STEP, Math.abs(f.x1 - f.x0) / n - 4);

  const body = candles
    .map((c, i) => {
      const centre = f.band(i, n);
      const tone = c.c >= c.o ? "gain" : "loss";
      const top = scale(Math.max(c.o, c.c));
      const height = Math.max(1, Math.abs(scale(c.c) - scale(c.o)));
      return `<g data-i="${i}"><line class="px-chart-line"${mark({ tone })} stroke-width="1" x1="${centre.toFixed(1)}" x2="${centre.toFixed(1)}" y1="${scale(c.h).toFixed(1)}" y2="${scale(c.l).toFixed(1)}"/>`
        + `<rect class="px-chart-bar"${mark({ tone })} x="${(centre - width / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="1"/></g>`;
    })
    .join("");
  return {
    svg: grid + body + xTicks(f, spec.labels, (i) => f.band(i, n)),
    marks: true,
    at: (i) => ({ x: f.band(i, n), y: scale(Math.max(candles[i].o, candles[i].c)) }),
  };
}

/** One `<svg>` string sized for a table row. No axes, no tooltip, and aria-hidden by design:
    the cell beside it already carries the number, so a second reading of the same fact is noise. */
export function sparkline(values, { tone, width = 88, height = 24, dot = true } = {}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) => (i / Math.max(1, values.length - 1)) * (width - 4) + 2;
  const y = (v) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = "M" + values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
  const end = dot ? `<circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(values.at(-1)).toFixed(1)}" r="2"/>` : "";
  return `<svg class="px-sparkline"${attr("data-tone", tone)} viewBox="0 0 ${width} ${height}" style="--spark-w:${width}px; --spark-h:${height}px" aria-hidden="true" focusable="false"><path d="${d}"/>${end}</svg>`;
}

function summary(spec, format) {
  const s = spec.series?.[0];
  const values = s ? s.values : spec.candles?.map((c) => c.c) ?? [];
  if (!values.length) return spec.title ?? "Chart";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const label = (v) => spec.labels?.[values.indexOf(v)];
  return `${spec.title ?? "Chart"}. ${values.length} points from ${format(values[0])} to ${format(values.at(-1))}, `
    + `high ${format(max)}${label(max) ? ` on ${label(max)}` : ""}, low ${format(min)}${label(min) ? ` on ${label(min)}` : ""}.`;
}

function table(spec, format) {
  const columns = spec.candles
    ? [["Open", (c) => c.o], ["High", (c) => c.h], ["Low", (c) => c.l], ["Close", (c) => c.c]]
    : spec.series.map((s) => [s.name ?? "Value", (_, i) => s.values[i]]);
  const rows = (spec.candles ?? spec.series[0].values)
    .map((row, i) => `<tr><th scope="row">${escape(spec.labels?.[i] ?? i + 1)}</th>`
      + columns.map(([, pick]) => `<td class="r px-num">${escape(format(pick(row, i)))}</td>`).join("") + `</tr>`)
    .join("");
  return `<details class="px-chart-data"><summary>${escape(spec.tableLabel ?? "Data table")}</summary>`
    + `<table class="px-table"><thead><tr><th scope="col">${escape(spec.xLabel ?? "Point")}</th>`
    + columns.map(([name]) => `<th scope="col" class="r">${escape(name)}</th>`).join("")
    + `</tr></thead><tbody>${rows}</tbody></table></details>`;
}

function legend(spec) {
  if (!spec.legend && !(spec.series && spec.series.length > 1)) return "";
  const items = (spec.legend ?? spec.series.map((s, i) => ({ name: s.name, tone: s.tone, series: s.series ?? i + 1 })))
    .map((item) => `<li><span class="px-chart-swatch"${mark(item)}></span>${escape(item.name)}</li>`)
    .join("");
  return `<ul class="px-chart-legend">${items}</ul>`;
}

/** Draw one chart into `el` (a `.px-chart`), and keep it drawn: the same call re-runs on resize
    and on `px:locale`, which is what a direction change dispatches. */
export function renderChart(el, spec) {
  el.classList.add("px-chart");
  let plot = el.querySelector(".px-chart-plot");
  if (!plot) {
    plot = document.createElement("div");
    plot.className = "px-chart-plot";
    el.prepend(plot);
  }
  el.__pxChart = spec;
  if (plot.dataset.state) return;

  const format = formatter(spec.format, localeOf(el));
  const f = frame(plot, spec);
  if (!f.width || !f.height) return;

  const painted = spec.candles ? candleChart(el, spec, f, format)
    : spec.kind === "bars" ? barChart(el, spec, f, format)
    : lineChart(el, spec, f, format);

  plot.innerHTML = `<svg width="${f.width}" height="${f.height}" role="img" aria-label="${escape(summary(spec, format))}">${painted.svg}</svg>`
    + `<div class="px-chart-tip" role="presentation"></div>`;

  for (const line of plot.querySelectorAll(".px-chart-line[data-reveal]")) {
    line.style.setProperty("--len", line.getTotalLength());
  }

  const after = el.querySelector(".px-chart-data");
  const dataOpen = after?.open ?? false;
  const dataFocused = after?.querySelector("summary") === document.activeElement;
  const chrome = legend(spec) + (spec.table === false ? "" : table(spec, format));
  if (after) after.remove();
  el.querySelector(".px-chart-legend")?.remove();
  el.insertAdjacentHTML("beforeend", chrome);
  const data = el.querySelector(".px-chart-data");
  if (data) {
    data.open = dataOpen;
    if (dataFocused) data.querySelector("summary").focus({ preventScroll: true });
  }

  wire(plot, painted, spec, format);
}

function wire(plot, painted, spec, format) {
  const tip = plot.querySelector(".px-chart-tip");
  const cursor = plot.querySelector(".px-chart-cursor-group");
  const rtl = rtlOf(plot);

  const place = (x, y, html) => {
    const fraction = x / plot.clientWidth;
    tip.innerHTML = html;
    tip.style.setProperty("--tip-x", `${rtl ? (1 - fraction) * 100 : fraction * 100}%`);
    tip.style.setProperty("--tip-y", `${y}px`);
    tip.style.setProperty("--tip-flip", fraction < 0.15 ? "0" : fraction > 0.85 ? "-1" : "-0.5");
    tip.dataset.open = "";
  };
  const hide = () => {
    delete tip.dataset.open;
    cursor?.setAttribute("opacity", "0");
  };

  if (painted.hit) {
    plot.addEventListener("pointermove", (event) => {
      const box = plot.getBoundingClientRect();
      const fraction = (event.clientX - box.left) / box.width;
      const point = painted.hit(fraction);
      if (!point) return hide();
      cursor?.setAttribute("opacity", "1");
      cursor?.querySelector("line")?.setAttribute("x1", point.x);
      cursor?.querySelector("line")?.setAttribute("x2", point.x);
      cursor?.querySelectorAll("circle").forEach((dot, i) => {
        dot.setAttribute("cx", point.x);
        dot.setAttribute("cy", point.ys[i]);
      });
      const rows = spec.series.map((s) => `${s.name ? `${escape(s.name)} ` : ""}<b>${escape(format(s.values[point.index]))}</b>`).join(" · ");
      place(point.x, point.y, `${escape(spec.labels?.[point.index] ?? `Point ${point.index + 1}`)} · ${rows}`);
    });
  }
  if (painted.marks) {
    for (const node of plot.querySelectorAll("[data-i]")) {
      node.addEventListener("pointerenter", () => {
        const i = +node.dataset.i;
        const point = painted.at(i);
        const body = spec.candles
          ? `O <b>${escape(format(spec.candles[i].o))}</b> · H <b>${escape(format(spec.candles[i].h))}</b> · L <b>${escape(format(spec.candles[i].l))}</b> · C <b>${escape(format(spec.candles[i].c))}</b>`
          : `<b>${escape(format(spec.series[0].values[i]))}</b>`;
        place(point.x, point.y, `${escape(spec.labels?.[i] ?? `Point ${i + 1}`)} · ${body}`);
      });
    }
  }
  plot.addEventListener("pointerleave", hide);
}

/** Find every `[data-px-chart]`, read the spec from the `<script type="application/json">`
    inside it, and keep it drawn. The spec travels in the DOM so a server-rendered page and an
    Electron page mount identically and no bundler is involved. */
export function mountCharts(root = document) {
  const charts = [...root.querySelectorAll("[data-px-chart]")];
  for (const el of charts) {
    const source = el.querySelector('script[type="application/json"]');
    if (!source) continue;
    renderChart(el, JSON.parse(source.textContent));
  }
  const redraw = () => {
    for (const el of charts) if (el.__pxChart) renderChart(el, el.__pxChart);
  };
  let frameId = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(redraw);
  });
  for (const el of charts) observer.observe(el);
  addEventListener("px:locale", redraw);
  return { redraw, disconnect: () => observer.disconnect() };
}
