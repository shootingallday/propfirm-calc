const NS = "http://www.w3.org/2000/svg";
const SHAPES = "path,circle,ellipse,rect,line,polyline,polygon";
const POINTS = 96;

const traced = new Map();
const poses = new WeakMap();
const flights = new WeakMap();

/* Where a glyph's shapes run, read from the browser's own geometry engine rather than from a path
   parser of our own: every SVG shape answers `getPointAtLength`, so a line, a circle and a curve
   all resample into the same fixed run of equidistant points and can be interpolated against each
   other. A closed shape's last point lands back on its first, so it draws as a loop without a
   command the two sides would have to agree on. */
function resample(shape) {
  const span = shape.getTotalLength();
  const pts = [];
  for (let i = 0; i < POINTS; i += 1) {
    const at = shape.getPointAtLength((span * i) / (POINTS - 1));
    pts.push(at.x, at.y);
  }
  return pts;
}

/* A `d` holding several movetos is several subpaths, and sampling it whole would draw the jumps
   between them. Each piece is measured on its own, and a piece that opens relative keeps every
   number it was written with: an absolute move to wherever the pieces before it left off is put in
   front of it, which is a subpath of no length and nothing drawn, so the piece carries on from the
   point it was authored against. */
function carve(d, scratch) {
  const chunks = d.match(/[Mm][^Mm]*/g) ?? [];
  const out = [];
  let ahead = "";
  for (const chunk of chunks) {
    let piece = chunk;
    if (ahead && chunk.startsWith("m")) {
      scratch.setAttribute("d", ahead);
      const at = scratch.getPointAtLength(scratch.getTotalLength());
      piece = `M${at.x},${at.y}${chunk}`;
    }
    out.push(piece);
    ahead += chunk;
  }
  return out;
}

function trace(host) {
  const scratch = host.ownerDocument.createElementNS(NS, "path");
  host.append(scratch);
  const out = [];
  try {
    for (const shape of host.querySelectorAll(SHAPES)) {
      if (shape === scratch) continue;
      const d = shape.tagName === "path" ? shape.getAttribute("d") ?? "" : "";
      if (!d) {
        out.push({ pts: resample(shape), loop: !["line", "polyline"].includes(shape.tagName) });
        continue;
      }
      for (const piece of carve(d, scratch)) {
        scratch.setAttribute("d", piece);
        out.push({ pts: resample(scratch), loop: /z/i.test(piece) });
      }
    }
  } finally {
    scratch.remove();
  }
  return out;
}

const middle = (pts) => {
  let x = 0;
  let y = 0;
  for (let i = 0; i < pts.length; i += 2) {
    x += pts[i];
    y += pts[i + 1];
  }
  return [(x * 2) / pts.length, (y * 2) / pts.length];
};

const collapse = (pts) => {
  const [x, y] = middle(pts);
  return Array.from({ length: pts.length }, (_, i) => (i % 2 ? y : x));
};

const cost = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 2) sum += (a[i] - b[i]) ** 2 + (a[i + 1] - b[i + 1]) ** 2;
  return sum;
};

const reverse = (pts) => {
  const out = [];
  for (let i = POINTS - 1; i >= 0; i -= 1) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
};

const spin = (pts, by) => {
  const out = [];
  for (let i = 0; i < POINTS - 1; i += 1) {
    const at = ((i + by) % (POINTS - 1)) * 2;
    out.push(pts[at], pts[at + 1]);
  }
  out.push(out[0], out[1]);
  return out;
};

/* Which point of the arriving subpath answers which point of the leaving one. A loop can be
   entered anywhere and either way round, so every start and both directions are weighed; an open
   run has two ends and nothing else to choose between. Without this a circle would turn itself
   inside out on the way to another circle drawn from a different corner. */
function orient(from, to, loop) {
  let best = to;
  let score = Infinity;
  for (const way of [to, reverse(to)]) {
    for (let by = 0; by < (loop ? POINTS - 1 : 1); by += 1) {
      const tried = by ? spin(way, by) : way;
      const now = cost(from, tried);
      if (now < score) {
        score = now;
        best = tried;
      }
    }
  }
  return best;
}

/* The leaving glyph's subpaths against the arriving one's, matched by where each sits rather than
   by the order they were drawn in. A subpath with no counterpart shrinks into its own centre, or
   grows out of it, so a pair that does not have the same number of strokes still resolves. */
function link(from, to) {
  const options = from.flatMap((one, i) => to.map((other, j) => ({ i, j, gap: cost(collapse(one.pts), collapse(other.pts)) })));
  options.sort((one, other) => one.gap - other.gap);
  const taken = new Map();
  const used = new Set();
  for (const option of options) {
    if (taken.has(option.i) || used.has(option.j)) continue;
    taken.set(option.i, option.j);
    used.add(option.j);
  }
  const pairs = from.map((one, i) => {
    const j = taken.get(i);
    if (j === undefined) return { a: one.pts, b: collapse(one.pts), loop: one.loop };
    const loop = one.loop && to[j].loop;
    return { a: one.pts, b: orient(one.pts, to[j].pts, loop), loop };
  });
  for (const [j, other] of to.entries()) if (!used.has(j)) pairs.push({ a: collapse(other.pts), b: other.pts, loop: other.loop });
  return pairs;
}

const round = (value) => Math.round(value * 100) / 100;

/* A subpath collapsed onto its own centre has no extent at all, and a round cap would paint that as
   a dot, so it draws nothing until it has somewhere to go. Lucide's own dots are a hundredth of a
   unit wide rather than nothing, and still draw. */
function draw(pts) {
  const low = [Infinity, Infinity];
  const high = [-Infinity, -Infinity];
  let out = "";
  for (let i = 0; i < pts.length; i += 2) {
    for (const axis of [0, 1]) {
      low[axis] = Math.min(low[axis], pts[i + axis]);
      high[axis] = Math.max(high[axis], pts[i + axis]);
    }
    out += `${i ? "L" : "M"}${round(pts[i])} ${round(pts[i + 1])}`;
  }
  return Math.max(high[0] - low[0], high[1] - low[1]) < 1e-6 ? "" : out;
}

function linearEase(curve) {
  const points = (curve.match(/linear\((.*)\)/)?.[1] ?? "0, 1").split(",").map(Number);
  const last = points.length - 1;
  return (t) => {
    const at = Math.min(Math.max(t, 0), 1) * last;
    const low = Math.min(Math.floor(at), last - 1);
    return points[low] + (points[low + 1] - points[low]) * (at - low);
  };
}

/* The flight the tokens in force describe, read off the icon itself so the page, a subtree or the
   reduced-motion block in tokens.css all reach it the same way. A zero duration is what lands a
   reader who asked for stillness on the end glyph with nothing interpolated. */
function flight(svg) {
  const style = getComputedStyle(svg);
  return {
    duration: parseFloat(style.getPropertyValue("--ui-spring-snappy-duration")) || 0,
    ease: linearEase(style.getPropertyValue("--ui-spring-snappy")),
  };
}

const paint = (svg, pose) => {
  const paths = [...svg.querySelectorAll(":scope > path")];
  while (paths.length < pose.length) paths.push(svg.appendChild(svg.ownerDocument.createElementNS(NS, "path")));
  pose.forEach((sub, index) => {
    const d = draw(sub.pts);
    if (paths[index].getAttribute("d") !== d) paths[index].setAttribute("d", d);
  });
  poses.set(svg, pose);
};

/* The glyph arriving is measured out of sight and inside the icon's own `svg`, because a shape has
   to be in a rendered document before the geometry engine will answer for it. The workbench is put
   up and taken down inside one turn, so no frame of the change holds a second glyph. */
function glyphOf(svg, markup) {
  const known = traced.get(markup);
  if (known) return known;
  const bench = svg.ownerDocument.createElementNS(NS, "g");
  bench.setAttribute("opacity", "0");
  bench.setAttribute("aria-hidden", "true");
  bench.innerHTML = markup;
  svg.append(bench);
  try {
    const read = trace(bench);
    traced.set(markup, read);
    return read;
  } finally {
    bench.remove();
  }
}

/** Draw what the `svg` already holds as the resampled paths a morph travels between, so the shapes
 *  the reader sees at rest are the ones a later change moves. */
export function drawGlyph(svg) {
  cancelAnimationFrame(flights.get(svg) ?? 0);
  const pose = trace(svg);
  svg.replaceChildren(...pose.map(() => svg.ownerDocument.createElementNS(NS, "path")));
  paint(svg, pose);
  return pose;
}

/** One glyph becoming another in place, by the paths already drawn taking the other's shape.
 *
 *  The two are resampled into runs of equidistant points, their subpaths matched by where they sit
 *  and entered from the point that costs the least travel, and what changes is the `d` of the paths
 *  that drew the leaving glyph. A glyph with more strokes than the one before it adds the paths it
 *  needs, once, and keeps them; a glyph with fewer leaves them collapsed and drawing nothing rather
 *  than taking them away.
 *
 *  Two glyphs interpolate cleanly when their strokes correspond. Where they do not — a circle
 *  against a single line — the strokes with no counterpart shrink into their own centres, which
 *  reads as a collapse rather than a change of meaning; pair glyphs that are built the same way.
 */
export function morphGlyph(svg, markup) {
  const to = glyphOf(svg, markup);
  const from = poses.get(svg) ?? drawGlyph(svg);
  cancelAnimationFrame(flights.get(svg) ?? 0);
  const pairs = link(from, to);
  const settle = () => paint(svg, pairs.map((pair) => ({ pts: pair.b, loop: pair.loop })));
  const { duration, ease } = flight(svg);
  if (!(duration > 0)) return settle();
  const began = performance.now();
  const step = () => {
    const through = Math.min(1, (performance.now() - began) / duration);
    if (through >= 1) return settle();
    const eased = ease(through);
    paint(svg, pairs.map((pair) => ({ pts: pair.a.map((value, index) => value + (pair.b[index] - value) * eased), loop: pair.loop })));
    flights.set(svg, requestAnimationFrame(step));
  };
  flights.set(svg, requestAnimationFrame(step));
}
