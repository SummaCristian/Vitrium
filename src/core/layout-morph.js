// FLIP-style morph between two layouts of the same elements (e.g. a picker
// switching from a row to a column), driven by one spring.
//
//   const cancel = layoutMorph(targets, apply, { onDone });
//
// `apply()` performs the layout change synchronously. Each target is measured
// before and after it; the elements are then put back where they were and a
// spring carries them to their new place. Target modes:
//   'translate'  glide from the old position to the new one (labels, cells)
//   'lens'       translate + scale, so a box also morphs between the two sizes
//                (the pill lens)
//   'box'        animate the element's own width/height (and border-radius)
//                from old to new. Assumes its top-left corner stays put, so use
//                it on the container that holds the others
// Translation uses the independent `translate` / `scale` properties, so it
// composes with any `transform` the element already has.
//
// Returns cancel(): stops the morph and clears every inline style it set,
// without calling onDone.
import { Spring, onSpringFrame } from './spring.js';

const CONFIG = { stiffness: 220, damping: 20, mass: 1 };

const radiusOf = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

export function layoutMorph(targets, apply, { onDone, config = CONFIG } = {}) {
  const before = targets.map(t => ({
    ...t,
    r: t.el.getBoundingClientRect(),
    radius: t.mode === 'box' ? radiusOf(t.el) : 0,
  }));

  apply();

  const items = before.map(b => {
    const r1 = b.el.getBoundingClientRect();
    const box = b.mode === 'box';
    return {
      ...b,
      // Centres, so a lens scales about its middle (transform-origin: center).
      dx: (b.r.left + b.r.width / 2) - (r1.left + r1.width / 2),
      dy: (b.r.top + b.r.height / 2) - (r1.top + r1.height / 2),
      sx: r1.width ? b.r.width / r1.width : 1,
      sy: r1.height ? b.r.height / r1.height : 1,
      w1: r1.width, h1: r1.height,
      radius1: box ? radiusOf(b.el) : 0,
      // Restored at the end (apply() may have set them, e.g. a synced radius).
      keep: { boxSizing: b.el.style.boxSizing, borderRadius: b.el.style.borderRadius },
    };
  });

  // Border-box sizing so the interpolated width/height match the measured boxes.
  for (const it of items) if (it.mode === 'box') it.el.style.boxSizing = 'border-box';

  const clear = () => {
    for (const it of items) {
      it.el.style.translate = '';
      it.el.style.scale = '';
      if (it.mode === 'box') {
        it.el.style.width = it.el.style.height = '';
        it.el.style.boxSizing = it.keep.boxSizing;
        it.el.style.borderRadius = it.keep.borderRadius;
      }
    }
  };

  const sp = new Spring(0);
  let stop = () => {};
  let finished = false;

  const finish = (callDone) => {
    if (finished) return;
    finished = true;
    stop();
    sp.dispose();
    clear();
    if (callDone) onDone?.();
  };

  const render = () => {
    const k = 1 - sp.value;   // 1 = still at the old layout, 0 = arrived (goes negative on overshoot)
    for (const it of items) {
      if (it.mode === 'box') {
        it.el.style.width = `${it.w1 + k * (it.r.width - it.w1)}px`;
        it.el.style.height = `${it.h1 + k * (it.r.height - it.h1)}px`;
        it.el.style.borderRadius = `${Math.max(0, it.radius1 + k * (it.radius - it.radius1))}px`;
        continue;
      }
      it.el.style.translate = `${k * it.dx}px ${k * it.dy}px`;
      if (it.mode === 'lens') it.el.style.scale = `${1 + k * (it.sx - 1)} ${1 + k * (it.sy - 1)}`;
    }
    if (sp.resting) finish(true);
  };

  stop = onSpringFrame(render);
  sp.to(1, config);   // start before the first render: a fresh spring reads as "resting"
  render();           // first frame at the old layout, before the next paint
  return () => finish(false);
}
