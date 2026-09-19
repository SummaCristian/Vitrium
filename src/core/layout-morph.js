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
//                from old to new, anchored at its top-left corner (which also
//                glides if the layout moves it)
// Targets may be nested (a cell inside a bar inside a group): a child's glide
// is corrected for its parent target's own motion, so each still travels from
// where it visibly was to where it visibly ends up.
//
// The elements must not have a CSS `transition` on translate/scale while it
// runs (this writes them every frame); .liquid-glass, for one, has a spring on
// them and needs `transition: none` for the duration.
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
      // Centres, so a lens scales about its middle (transform-origin: center);
      // top-left for a box, which is resized from that corner.
      dx: box ? b.r.left - r1.left : (b.r.left + b.r.width / 2) - (r1.left + r1.width / 2),
      dy: box ? b.r.top - r1.top : (b.r.top + b.r.height / 2) - (r1.top + r1.height / 2),
      sx: r1.width ? b.r.width / r1.width : 1,
      sy: r1.height ? b.r.height / r1.height : 1,
      w1: r1.width, h1: r1.height,
      radius1: box ? radiusOf(b.el) : 0,
      // Restored at the end (apply() may have set them, e.g. a synced radius).
      keep: { boxSizing: b.el.style.boxSizing, borderRadius: b.el.style.borderRadius },
    };
  });

  // Correct each target's glide for the translation its parent already applies.
  // Every target's *total* visible shift is k * its own delta (by construction),
  // so a child only has to subtract its NEAREST target ancestor's delta; that one
  // already includes everything above it.
  for (const it of items) {
    const ancestors = items.filter(a => a !== it && a.el.contains(it.el));
    // Nearest = the one no other ancestor sits inside of.
    const parent = ancestors.find(a => !ancestors.some(o => o !== a && a.el.contains(o.el)));
    it.edx = it.dx - (parent?.dx ?? 0);
    it.edy = it.dy - (parent?.dy ?? 0);
  }

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
      }
      it.el.style.translate = `${k * it.edx}px ${k * it.edy}px`;
      if (it.mode === 'lens') it.el.style.scale = `${1 + k * (it.sx - 1)} ${1 + k * (it.sy - 1)}`;
    }
    if (sp.resting) finish(true);
  };

  stop = onSpringFrame(render);
  sp.to(1, config);   // start before the first render: a fresh spring reads as "resting"
  render();           // first frame at the old layout, before the next paint
  return () => finish(false);
}
