// The two ways the docs animate a change in a demo, so every playground reads the same.
//
//   swapIcon(el, node)    one thing replaced by another: the old one shrinks, fades and blurs away as the new one
//                         grows in (the copy button's swap).
//   crossfade(el, container, apply)   a change that can't be interpolated (a tint or a material is a stack of
//                         gradients): a copy of the old look fades out over the new one fading in.
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const HIDDEN = { opacity: 0, scale: 0.25, filter: 'blur(4px)' };
const SHOWN = { opacity: 1, scale: 1, filter: 'blur(0px)' };
const SWAP = { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' };
const FADE_MS = 350;

// Replaces the icon inside `el`. Both icons share one grid cell while they cross, so nothing shifts.
export function swapIcon(el, next) {
  const prev = [...el.children];
  el.style.display = 'grid';
  el.style.placeItems = 'center';
  next.style.gridArea = '1 / 1';
  prev.forEach((p) => { p.style.gridArea = '1 / 1'; });
  el.append(next);
  if (reduceMotion()) { prev.forEach((p) => p.remove()); return; }
  // Reduced motion aside, a second swap mid-flight simply starts from wherever the icons are.
  const from = [HIDDEN, SHOWN], to = [SHOWN, HIDDEN];
  next.animate(from, SWAP);
  prev.forEach((p) => p.animate(to, SWAP).finished.then(() => p.remove(), () => p.remove()));
}

export function crossfade(el, container, apply) {
  if (reduceMotion()) { apply(); return; }
  const ghost = el.cloneNode(true);
  Object.assign(ghost.style, { position: 'absolute', left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, margin: '0', pointerEvents: 'none', transition: 'none' });
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  container.append(ghost);
  apply();
  const opts = { duration: FADE_MS, easing: 'ease', fill: 'both' };
  ghost.animate([{ opacity: 1 }, { opacity: 0 }], opts).finished.then(() => ghost.remove());
  el.animate([{ opacity: 0 }, { opacity: 1 }], opts).finished.then((a) => a.cancel());
}
