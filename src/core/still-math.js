// The still reflection's work (core/refraction.js, A still reflection) that needs nothing of the page: the map,
// the picture of what's around (painted by hand where the page can't draw it), its blurs, and the pixels. Plain
// data in and out, and canvases of its own (OffscreenCanvas where there is one), so it runs in a worker
// (still-worker.js) as well as here.

export const STILL_RES = 0.5;     // the picture of what's around, px per CSS px: it's blurred by 12 px and more

// A canvas of `w` x `h`: an OffscreenCanvas where there is one (a worker has nothing else).
export function canvasOf(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

// Can this context draw what stillPixels needs (a 2D canvas; a worker in an older Safari has none)?
export function canPaint() {
  try { return !!canvasOf(1, 1).getContext('2d'); } catch { return false; }
}

// A CSS color as [r, g, b, a], 0 to 1, whatever its notation: drawn on a pixel and read back.
let swatch = null;
const colors = new Map();
function colorOf(css) {
  let c = colors.get(css);
  if (c) return c;
  swatch ??= canvasOf(1, 1).getContext('2d', { willReadFrequently: true });
  swatch.clearRect(0, 0, 1, 1);
  swatch.fillStyle = '#0000';
  swatch.fillStyle = css;
  swatch.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data;
  c = [r / 255, g / 255, b / 255, a / 255];
  if (colors.size > 256) colors.clear();
  colors.set(css, c);
  return c;
}

// The reflection's map (core/refraction.js, Reflection), as RGBA bytes over the `w` x `h` box: red and green
// the offset as displacementMap's, blue how much of the reflection shows there (the filter's mask). The rim of
// a slab of glass curves away toward its edge, so it mirrors what's around it: a point `d` px in from the edge
// shows what's beyond it, d to the edge and then out, more the deeper it is, as a curved mirror squeezes a
// wide view into a thin band. Out to `reach` (per side: top, right, bottom, left, px past the edge), over the
// band (from `inset` to `band` px in from the edge), along an arc (atan) that gives the first few px most of it. It shows only in a
// band in from the rim: over the outer `inset` px (where the rim's highlight is) the same sample as the band's first
// px, as strong, so the rim takes on its color, then fading out across the band (smootherstep) from `strength`, as a reflection fades where the rim levels off into the face,
// and fading too with how far past the edge the point it shows is, gone `falloff` px out (smootherstep): what's
// right beside the glass reflects in it plainly, what's further off only faintly.
// In units of `scale` px (the filter's scale is twice it).
/**
 * @param {number} w
 * @param {number} h
 * @param {{ radius?: number, n?: number, res?: number, reach: number[], band: number, inset: number,
 *   strength: number, falloff?: number, rimWidth?: number }} options
 * @returns {{ data: Uint8ClampedArray, width: number, height: number, rim: Uint8ClampedArray, scale: number }}
 */
export function reflectionMap(w, h, { radius = 0, n = 2, res = 1, reach, band, inset, strength, falloff = Infinity, rimWidth = 0 }) {
  const pw = Math.max(1, Math.round(w * res));
  const ph = Math.max(1, Math.round(h * res));
  const data = new Uint8ClampedArray(pw * ph * 4);
  // The rim, the outer `rimWidth` px: red how lit it is (the top and bottom edges), green how shaded (the sides),
  // by the edge's normal, so the corners turn from one to the other.
  const rim = new Uint8ClampedArray(pw * ph * 4);
  const hw = w / 2, hh = h / 2;
  const r = Math.max(0, Math.min(radius, hw, hh));
  const [rt, rr, rb, rl] = reach;
  const b = Math.max(inset + 1, band);
  const arc = Math.tan(1.3);
  // 0 where the band starts (`inset` in), 1 at its inner edge: the first of it shows what's right at the edge.
  const out = (d) => Math.atan(Math.min(1, Math.max(0, d - inset) / (b - inset)) * arc) / 1.3;
  const scale = Math.max(1, b + Math.max(rt, rr, rb, rl));
  const smoother = (t) => t * t * t * (t * (6 * t - 15) + 10);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const e = edge((x + 0.5) / res - hw, (y + 0.5) / res - hh, hw, hh, r, n);
      const i = (y * pw + x) * 4;
      data[i + 3] = 255;
      const d = e.inward;
      rim[i + 3] = 255;
      if (rimWidth > 0 && d > -0.5 && d < rimWidth) {
        // Full over the outer px (eased over the pixel the edge crosses), fading out across the rest.
        const wgt = Math.min(1, d * res + 0.5) * (1 - smoother(Math.min(1, Math.max(0, (d - 1) / Math.max(0.01, rimWidth - 1)))));
        rim[i] = 255 * wgt * e.oy * e.oy;
        rim[i + 1] = 255 * wgt * e.ox * e.ox;
      }
      if (d < 0 || d >= b) { data[i] = 128; data[i + 1] = 128; data[i + 2] = 0; continue; }
      const dd = Math.max(d, inset);   // inside the inset it looks where the band's first px does: the band reaches the rim
      const k = out(dd);
      const ax = k * (e.ox < 0 ? rl : rr), ay = k * (e.oy < 0 ? rt : rb);   // how far past the edge it looks
      const sx = e.ox * (dd + ax);
      const sy = e.oy * (dd + ay);
      data[i] = 128 + 127 * sx / scale;
      data[i + 1] = 128 + 127 * sy / scale;
      const on = Math.min(1, Math.max(0, d + 0.5));              // eased over the pixel the edge crosses
      const fade = 1 - smoother(Math.min(1, Math.max(0, (dd - inset) / (b - inset))));
      const far = 1 - smoother(Math.min(1, Math.hypot(e.ox * ax, e.oy * ay) / falloff));
      data[i + 2] = 255 * Math.min(1, strength * on * fade * far);
    }
  }
  return { data, rim, width: pw, height: ph, scale };
}

// Where (px, py), from the middle of a `2hw` x `2hh` box with corners of radius `r` and exponent `n`,
// stands against its edge: `inward`, how far in from the nearest edge (negative outside), and that edge's
// outward normal (ox, oy).
export function edge(px, py, hw, hh, r, n) {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  let inward, nx, ny;
  if (qx > 0 && qy > 0) {
    // In a corner: distance from the superellipse arc, normal along its gradient.
    const len = n === 2 ? Math.hypot(qx, qy) : (qx ** n + qy ** n) ** (1 / n);
    inward = r - len;
    const gx = n === 2 ? qx : qx ** (n - 1);
    const gy = n === 2 ? qy : qy ** (n - 1);
    const gl = Math.hypot(gx, gy) || 1;
    nx = gx / gl; ny = gy / gl;
  } else if (qx > qy) {
    inward = r - qx; nx = 1; ny = 0;
  } else {
    inward = r - qy; nx = 0; ny = 1;
  }
  return { inward, ox: Math.sign(px) * nx, oy: Math.sign(py) * ny };
}

// A separable Gaussian blur of a `w` x `h` field in place, `sigma` in its own pixels, its edges held.
export function gaussian(f, w, h, sigma) {
  const rad = Math.ceil(3 * sigma);
  const k = new Float32Array(2 * rad + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) sum += k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(f.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += k[i + rad] * f[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += k[i + rad] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      f[y * w + x] = a;
    }
  }
}

// The boxes painted on the canvas by hand: their background colors and their linear and radial gradients, in
// their rounded corners. What else a background can be (images, conic gradients, sizes and repeats) is left out.
export function paintBoxes(ctx, boxes, ground) {
  ctx.reset?.();
  ctx.save();
  ctx.scale(STILL_RES, STILL_RES);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, ctx.canvas.width / STILL_RES, ctx.canvas.height / STILL_RES);
  for (const { x, y, w, h, radii: corners, opacity, bg, image } of boxes) {
    ctx.save();
    ctx.globalAlpha = parseFloat(opacity) || 0;
    const corner = (v) => {
      const [a] = v.split(' ');
      return a.endsWith('%') ? Math.min(w, h) * parseFloat(a) / 100 : parseFloat(a) || 0;
    };
    const radii = corners.map(corner).map((r) => Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radii); else ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    for (const layer of splitTop(image, ',').reverse()) {
      try { fillGradient(ctx, layer.trim(), x, y, w, h); } catch { /* one it can't read is left out */ }
    }
    ctx.restore();
  }
  ctx.restore();
}

// `str` split at `sep` where it's outside any parentheses.
export function splitTop(str, sep) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (sep === ' ' ? /\s/.test(c) : c === sep)) { out.push(str.slice(from, i)); from = i + 1; }
  }
  out.push(str.slice(from));
  return out.map((t) => t.trim()).filter(Boolean);
}

// A computed linear-gradient() or radial-gradient() over the box, as the page lays it out with the default size.
function fillGradient(ctx, layer, x, y, w, h) {
  const g = /^(?:repeating-)?(linear|radial)-gradient\((.*)\)$/s.exec(layer);
  if (!g) return;
  const args = splitTop(g[2], ',');
  const isLength = (t) => /^-?[\d.]+(px|%)?$/.test(t);
  const len = (t, of) => (t.endsWith('%') ? of * parseFloat(t) / 100 : parseFloat(t));
  // The color stops, positions as a share of the gradient's length `of` (missing ones spread out between).
  const stops = (list, of) => {
    const out = list.map((s) => {
      const parts = splitTop(s, ' ');
      const at = parts.filter(isLength);
      return { color: parts.filter((t) => !isLength(t)).join(' '), at: at.length ? len(at[0], of) / of : null };
    });
    if (out[0].at == null) out[0].at = 0;
    if (out.at(-1).at == null) out.at(-1).at = 1;
    for (let i = 1; i < out.length; i++) {
      if (out[i].at != null) continue;
      let j = i;
      while (out[j].at == null) j++;
      for (let k = i; k < j; k++) out[k].at = out[i - 1].at + (out[j].at - out[i - 1].at) * (k - i + 1) / (j - i + 1);
    }
    let last = 0;
    for (const s of out) { s.at = Math.max(last, s.at); last = s.at; }
    // CSS fades between stops premultiplied, a canvas doesn't: a stop with nothing of its own (transparent) takes
    // the color of the nearest one that has some, at none of it, so a fade to transparent doesn't go dark on the way.
    const c = out.map((s) => colorOf(s.color));
    for (let i = 0; i < out.length; i++) {
      if (c[i][3] > 0) continue;
      let j = -1;
      for (let d = 1; d < out.length && j < 0; d++) {
        if (c[i - d]?.[3] > 0) j = i - d; else if (c[i + d]?.[3] > 0) j = i + d;
      }
      if (j >= 0) out[i].color = `rgba(${c[j].slice(0, 3).map((v) => Math.round(v * 255)).join(',')},0)`;
    }
    return out;
  };
  const cx = x + w / 2, cy = y + h / 2;
  let grad, list, of;
  if (g[1] === 'linear') {
    let angle = 180;
    list = args;
    const first = args[0];
    if (/^-?[\d.]+(deg|turn|rad|grad)$/.test(first)) {
      const v = parseFloat(first);
      angle = first.endsWith('turn') ? v * 360 : first.endsWith('rad') && !first.endsWith('grad') ? v * 180 / Math.PI : first.endsWith('grad') ? v * 0.9 : v;
      list = args.slice(1);
    } else if (first.startsWith('to ')) {
      const to = first.slice(3);
      const dx = /right/.test(to) ? 1 : /left/.test(to) ? -1 : 0, dy = /bottom/.test(to) ? 1 : /top/.test(to) ? -1 : 0;
      angle = dx && dy ? Math.atan2(dx * h, -dy * w) * 180 / Math.PI : Math.atan2(dx, -dy) * 180 / Math.PI;
      list = args.slice(1);
    }
    const a = angle * Math.PI / 180, sx = Math.sin(a), sy = -Math.cos(a);
    of = Math.abs(w * sx) + Math.abs(h * sy);
    grad = ctx.createLinearGradient(cx - sx * of / 2, cy - sy * of / 2, cx + sx * of / 2, cy + sy * of / 2);
  } else {
    // radial-gradient([circle | ellipse] [size] [at x y], stops…), its size the default, farthest-corner.
    let px = cx, py = cy, circle = false;
    list = args;
    const first = args[0];
    if (/^(circle|ellipse)|^at |closest|farthest/.test(first)) {
      circle = /^circle/.test(first);
      const at = / ?at (.+)$/.exec(first);
      if (at) {
        const [ax = '50%', ay = '50%'] = splitTop(at[1], ' ');
        const pos = (t, of, lo, hi) => (t === lo ? 0 : t === hi ? of : t === 'center' ? of / 2 : len(t, of));
        px = x + pos(ax, w, 'left', 'right'); py = y + pos(ay, h, 'top', 'bottom');
      }
      list = args.slice(1);
    }
    const fx = Math.max(px - x, x + w - px), fy = Math.max(py - y, y + h - py);
    let rxr, ryr;
    if (circle) { rxr = ryr = Math.hypot(fx, fy); } else { const k = fx / Math.max(1e-6, fy); rxr = Math.hypot(fx, fy * k); ryr = rxr / k; }
    of = rxr;
    grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rxr);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, ryr / Math.max(1e-6, rxr));
    for (const s of stops(list, of)) grad.addColorStop(Math.min(1, s.at), s.color);
    ctx.fillStyle = grad;
    ctx.fillRect(-rxr, -rxr, 2 * rxr, 2 * rxr);
    ctx.restore();
    return;
  }
  for (const s of stops(list, of)) grad.addColorStop(Math.min(1, s.at), s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

// The picture blurred by `sigma` CSS px, as floats 0 to 1 (rgb, three to a px), `k` px per CSS px: no finer than a
// blur needs, BLUR_PX px to its sigma (what comes out of a 12 px blur has no detail a 12th of that would miss), so
// the blur, here in JS where the canvas can't (Safari), has a few px to work over, not hundreds.
const BLUR_PX = 2.5;
function blurredOf(base, cw, ch, sigma) {
  const k = sigma > 0 ? Math.min(STILL_RES, BLUR_PX / sigma) : STILL_RES;
  const w = Math.max(1, Math.round(cw * k / STILL_RES)), h = Math.max(1, Math.round(ch * k / STILL_RES));
  const ctx = canvasOf(w, h).getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  const native = sigma > 0 && canvasBlurs();
  if (native) ctx.filter = `blur(${sigma * k}px)`;
  ctx.drawImage(base, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const f = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { f[j] = d[i] / 255; f[j + 1] = d[i + 1] / 255; f[j + 2] = d[i + 2] / 255; }
  if (sigma > 0 && !native) {
    const one = new Float32Array(w * h);
    for (let n = 0; n < 3; n++) {
      for (let i = 0; i < one.length; i++) one[i] = f[i * 3 + n];
      gaussian(one, w, h, sigma * k);
      for (let i = 0; i < one.length; i++) f[i * 3 + n] = one[i];
    }
  }
  return { f, w, h, k };
}

// Whether a 2D canvas blurs through ctx.filter: a red px drawn blurred spreads to its neighbors.
let canvasBlur;
function canvasBlurs() {
  if (canvasBlur !== undefined) return canvasBlur;
  try {
    const a = canvasOf(9, 1);
    a.getContext('2d').fillRect(4, 0, 1, 1);
    const b = canvasOf(9, 1).getContext('2d', { willReadFrequently: true });
    b.filter = 'blur(2px)';
    b.drawImage(a, 0, 0);
    canvasBlur = b.getImageData(2, 0, 1, 1).data[3] > 0;
  } catch { canvasBlur = false; }
  return canvasBlur;
}


// The still reflection's pixels for a `w` x `h` glass, `res` px per CSS px: the rim's light (already lightened
// against what the picture has under it) and the band, as RGBA bytes, `W` x `H`. `picture` is what's around it,
// `m` CSS px past its box on every side at STILL_RES: its bytes (`data`, drawn by the page), or the boxes to paint
// (`boxes`, over `ground`). `p` is the measured reflection (measureReflection), `map` the map's options.
export function stillPixels({ w, h, res, m, map, p, picture }) {
  const mm = reflectionMap(w, h, { ...map, res });
  const { cw, ch } = picture;
  const base = canvasOf(cw, ch);
  const bctx = base.getContext('2d', { willReadFrequently: true });
  if (picture.data) bctx.putImageData(new ImageData(new Uint8ClampedArray(picture.data), cw, ch), 0, 0);
  else paintBoxes(bctx, picture.boxes, picture.ground);
  const near = blurredOf(base, cw, ch, p.blur), around = blurredOf(base, cw, ch, p.ambient), plain = blurredOf(base, cw, ch, 0);
  // Bilinear, at CSS px (x, y) in the picture.
  const at = ({ f, w: fw, h: fh, k }, x, y, out) => {
    const fx = Math.min(Math.max(0, fw - 1.001), Math.max(0, x * k - 0.5)), fy = Math.min(Math.max(0, fh - 1.001), Math.max(0, y * k - 0.5));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const a = (y0 * fw + x0) * 3, b = fw > 1 ? a + 3 : a, c = fh > 1 ? a + fw * 3 : a, d = c + (fw > 1 ? 3 : 0);
    for (let k = 0; k < 3; k++) {
      out[k] = (f[a + k] * (1 - tx) + f[b + k] * tx) * (1 - ty) + (f[c + k] * (1 - tx) + f[d + k] * tx) * ty;
    }
    return out;
  };
  const S = p.saturation;
  const sat = [
    0.213 + 0.787 * S, 0.715 - 0.715 * S, 0.072 - 0.072 * S,
    0.213 - 0.213 * S, 0.715 + 0.285 * S, 0.072 - 0.072 * S,
    0.213 - 0.213 * S, 0.715 - 0.715 * S, 0.072 + 0.928 * S,
  ];
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const W = mm.width, H = mm.height;
  const light = { data: new Uint8ClampedArray(W * H * 4) }, shown = { data: new Uint8ClampedArray(W * H * 4) };
  const soft = [0, 0, 0], amb = [0, 0, 0], viv = [0, 0, 0], under = [0, 0, 0];
  const spec = p.rimLight * Math.min(1, 2 * p.rimSpecular);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const B = mm.data[i + 2] / 255, lit = mm.rim[i] / 255, shade = mm.rim[i + 1] / 255;
      if (!B && !lit && !shade) continue;
      const sx = (mm.data[i] - 128) * mm.scale / 127, sy = (mm.data[i + 1] - 128) * mm.scale / 127;
      const qx = m + (x + 0.5) / res + sx, qy = m + (y + 0.5) / res + sy;
      at(near, qx, qy, soft);
      for (let k = 0; k < 3; k++) viv[k] = clamp(sat[3 * k] * soft[0] + sat[3 * k + 1] * soft[1] + sat[3 * k + 2] * soft[2]);
      // The band: as far as it stands out from what's around it.
      if (B) {
        at(around, qx, qy, amb);
        const diff = Math.abs(soft[0] - amb[0]) + Math.abs(soft[1] - amb[1]) + Math.abs(soft[2] - amb[2]);
        const a = p.glow * B * clamp(p.nearContrast * (diff - p.nearThreshold));
        if (a > 0) { shown.data[i] = 255 * viv[0]; shown.data[i + 1] = 255 * viv[1]; shown.data[i + 2] = 255 * viv[2]; shown.data[i + 3] = 255 * a; }
      }
      // The rim's light, each layer over the last: the shaded sides, then (leaving the page out) its own light,
      // then the lit edges.
      let r = 0, g = 0, b = 0, al = 0;
      const over = (cr, cg, cb, ca) => {
        if (ca <= 0) return;
        const o = ca + al * (1 - ca);
        r = (cr * ca + r * al * (1 - ca)) / o; g = (cg * ca + g * al * (1 - ca)) / o; b = (cb * ca + b * al * (1 - ca)) / o; al = o;
      };
      if (shade) over(clamp(viv[0] * p.rimShade), clamp(viv[1] * p.rimShade), clamp(viv[2] * p.rimShade), p.rimLight * shade);
      if (lit) {
        let reach = 1;
        if (p.page) {
          over(1, 1, 1, spec * lit);
          const d = Math.abs(soft[0] - p.page[0]) + Math.abs(soft[1] - p.page[1]) + Math.abs(soft[2] - p.page[2]);
          reach = clamp(p.contrast * (d - p.threshold));
        }
        over(clamp(viv[0] * p.rimGain + p.rimSpecular), clamp(viv[1] * p.rimGain + p.rimSpecular), clamp(viv[2] * p.rimGain + p.rimSpecular), reach * p.rimLight * lit);
      }
      // As light, each channel the brighter of it and the glass under it (what the picture has there): a blend
      // mode on the canvas would make the glass a backdrop root and leave its pane with nothing behind it.
      if (al > 0) {
        at(plain, m + (x + 0.5) / res, m + (y + 0.5) / res, under);
        light.data[i] = 255 * Math.max(r, under[0]); light.data[i + 1] = 255 * Math.max(g, under[1]); light.data[i + 2] = 255 * Math.max(b, under[2]);
        light.data[i + 3] = 255 * al;
      }
    }
  }
  return { W, H, light: light.data, band: shown.data };
}
