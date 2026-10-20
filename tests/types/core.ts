// Type-level tests (npm run test:types): the core helpers' options and what they return, through the published types
// (the package root, and vitrium/core/*).
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import {
  Spring, onSpringFrame, wakeSprings,
  snapGeometry, morphGeometry, hideInnerBoxInstantly, unhideInnerBox,
  glide, glideDuration, glideSpring, travelDistance, arcOffset, arcKeyframes, playArc, edgeShift, liquidKeyframes,
  stretchScale, stretchWindow, glideTime, playLiquid, appleSpring, appleSpringConfig, springEasing, dropletShape,
  dropletAlong,
  attachLiquidGlass, initLiquidGlass,
  createPillDragCore, createMorphPopup, createModalLayer,
  clamp, snapToStep, toFraction, fromFraction,
  sheetPhysics,
  BLUR_STATE_EVENT, getBlurMode, setBlurMode, resolveBlurCapability, applyBlurState, scheduleIdleBenchmark,
  reevaluateBlurCapability, initBlurCapability, runBlurBenchmark, getCachedBlurVerdict, BLUR_BENCHMARK,
  GLASS_SURFACES, initRefraction, setRefraction, getRefraction, REFRACTION_STATE_EVENT, attachRefraction,
  detachRefraction, supportsRefraction, displacementMap, fitBend, cornerExponent, morphRefraction, holdRefraction,
} from '../../types/index.js';
import type {
  SpringConfig, MorphGeometryOptions, Rect, ArcOptions, PlayArcOptions, LiquidOptions, LiquidGlassOptions,
  PillDragCoreOptions, PillDragCore, PillLift, MorphPopupOptions, MorphPopup, ModalLayer, DragArbiterOptions,
  WheelArbiterOptions, RefractionOptions, RefractionStateDetail, BlurStateDetail, BlurMode, DisplacementMapOptions,
  MorphRefractionOptions,
} from '../../types/index.js';
import { createMorphPopup as createMorphPopupCore } from '../../types/core/morph-popup.js';
import type { ChipPickerPopup } from '../../types/index.js';

const box = document.createElement('div');
const rect: Rect = { left: 0, top: 0, width: 100, height: 40 };

/* --- Spring ------------------------------------------------------------------------------- */
const config: SpringConfig = { stiffness: 400, damping: 35 };
const sp = new Spring(1);
sp.to(0, config);
sp.to(1);
sp.set(0.5);
const value: number = sp.value;
const moving: boolean = sp.step(0.016);
sp.stop();
sp.dispose();
const off: () => void = onSpringFrame(() => {});
wakeSprings();
// @ts-expect-error: a spring's target is a number
sp.to('1');
// @ts-expect-error: not a spring setting (it's `damping`)
sp.to(1, { friction: 30 });

/* --- FLIP and the glide ------------------------------------------------------------------- */
snapGeometry(box, rect, '16px');
snapGeometry(box, box.getBoundingClientRect(), null);
const flip: MorphGeometryOptions = { fromRadius: '999px', toRadius: '16px', onSettle: () => {}, sync: true };
morphGeometry(box, rect, { ...rect, width: 200 }, flip);
hideInnerBoxInstantly(box);
unhideInnerBox(box);
// @ts-expect-error: a rect has left, top, width and height
morphGeometry(box, { x: 0, y: 0 }, rect);
// @ts-expect-error: radii are CSS strings
morphGeometry(box, rect, rect, { toRadius: 16 });

const t: number = glide(0.5) + glideDuration(400) + glideTime(0.5) + travelDistance(rect, rect) + stretchWindow(0.1);
const glideCfg: SpringConfig = glideSpring(400);
const stiffness: number = appleSpringConfig(0.3, 400).stiffness;
const curve: (u: number) => number = appleSpring(0.15, 1.1);
const easing: string = springEasing(0.3);
const [ax, ay]: [number, number] = arcOffset(100, 50, 0.5);
const nudge: [number, number] = edgeShift({ start: rect, end: rect, margin: 12 }, 0.5, [ax, ay]);
const stretch: [number, number] = stretchScale(1, 200, 0.5, 0.5);
const arc: ArcOptions = { easing: 'ease-out', reverse: true, travel: true, fit: { start: rect, end: rect } };
const frames: { offset: number, translate: string }[] = arcKeyframes(100, 50, arc);
arcKeyframes(100, 50, { easing: (x) => x * x });
const play: PlayArcOptions = { duration: 400, easing: 'linear' };
const anim: Animation | null = playArc(box, 100, 50, play);
const liquid: LiquidOptions = { easing: glide, mirror: 'ease' };
const { scale, translate, radius } = liquidKeyframes(rect, rect, rect, 20, 16, liquid);
const anims: Animation[] = playLiquid(box, rect, rect, rect, 20, 16, { duration: 400, mirror: null });
const drop = dropletShape({ width: 80, height: 40 }, { width: 200, height: 300 }, 20, 16, { x: 0.5 });
const dropR: number = dropletAlong({ width: 80, height: 40 }, { width: 200, height: 300 }, 20, 16, 0.5).radius + drop.width;
// @ts-expect-error: not an arc option (it's `reverse`)
arcKeyframes(100, 50, { backwards: true });
// @ts-expect-error: playArc needs its duration
playArc(box, 100, 50, { easing: 'ease' });
// @ts-expect-error: an easing is a CSS string or a function of time
arcKeyframes(100, 50, { easing: 0.5 });

/* --- Liquid glass, value math ------------------------------------------------------------- */
const lg: LiquidGlassOptions = { from: '.title', exclude: '.body', controls: true, claimTouch: true };
attachLiquidGlass(box, lg);
attachLiquidGlass(box);
initLiquidGlass();
// @ts-expect-error: not an option (it's `claimTouch`)
attachLiquidGlass(box, { claim: true });
// @ts-expect-error: from is a selector
attachLiquidGlass(box, { from: box });

const v: number = clamp(5, 0, 10) + snapToStep(3.3, { min: 0, max: 10, step: 0.5 }) + toFraction(5, 0, 10) + fromFraction(0.5, 0, 10);
// @ts-expect-error: snapToStep needs the step
snapToStep(3, { min: 0, max: 10 });

/* --- Pill drag core ----------------------------------------------------------------------- */
const lift: PillLift = {
  up: { stiffness: 824, damping: 32.7, mass: 1 }, down: config, press: 1, pressMs: 0, fall: 'linear', fallS: 0.185,
  landKeep: 0, glass: [0, 1], glassDown: [0.59, 1], glassLag: 0.081, tapSlide: config, tapSlideMs: 0, tapHoldMs: 130,
};
const coreOptions: PillDragCoreOptions = {
  root: box, items: box, pill: box, hit: box, activeRow: box, cellSelector: '.cell',
  hover: null, hoverLens: { selScale: 1, selLean: 0.06, leanMax: 3 }, activeCellClass: 'cell-copy', liftedClass: 'lifted',
  tapScale: 1.6, liftOutset: null, liftScale: 1.02, lift, walls: { travel: 9.9, squash: 0 },
  stretch: { speed: 0.019, speedLag: { stiffness: 136, damping: 23.3, mass: 1 }, crossStretch: 0.67 },
  follow: { stiffness: 350, damping: 37.4, mass: 1 }, copyScale: 1.2,
  trail: { follow: 0.013, give: 60, giveCross: 4, wall: { follow: 0.2, give: 10, stretch: 0.002 } },
  axis: 'y', keyboard: false, canSelect: (i) => i !== 2, onReject: (i) => {}, onRender: ({ pos }) => { const p: number = pos; },
  onAim: (i) => {}, flipUnlessCrossed: true, holdMs: 0, onPillTap: () => {},
  onChange: (i, { silent }) => { const s: boolean = silent; },
};
const core: PillDragCore = createPillDragCore(coreOptions);
createPillDragCore({ root: box, items: box, pill: box, hit: box, activeRow: box, cellSelector: '.cell', hoverLens: true });
core.select(1, { animate: false, silent: true });
core.deselect();
core.refresh({ snap: true });
core.setAxis('x');
core.setTrail({ wall: { follow: 0.2, give: 10, stretch: 0.002 } });
core.setTrail(null);
const index: number = core.index;
const cells: HTMLElement[] = core.cells;
const at: number = core.indexOf(box);
core.destroy();
// @ts-expect-error: the core needs its elements and cellSelector
createPillDragCore({ root: box });
// @ts-expect-error: the core takes options
createPillDragCore();
// @ts-expect-error: not an option (it's `lift`)
createPillDragCore({ ...coreOptions, rise: lift });
// @ts-expect-error: a fall is 'parabola' or 'linear'
createPillDragCore({ ...coreOptions, lift: { fall: 'ease' } });
// @ts-expect-error: glass is a [from, to] pair of heights
createPillDragCore({ ...coreOptions, lift: { glass: 0.5 } });
// @ts-expect-error: the axis is 'x' or 'y'
createPillDragCore({ ...coreOptions, axis: 'horizontal' });
// @ts-expect-error: a trail given at creation replaces TRAIL, so it needs follow, give and giveCross
createPillDragCore({ ...coreOptions, trail: { follow: 0.02 } });

/* --- Morph popup, modal layer ------------------------------------------------------------- */
const trigger = document.createElement('button');
const popupOptions: MorphPopupOptions = {
  trigger, role: 'listbox', label: 'Country', title: { icon: '<svg></svg>', text: 'Country' }, width: 240, radius: 22,
  maxHeight: 'page', glassStyle: 'inherit', onOpen: () => {}, onAfterOpen: () => {}, onClose: () => {},
};
const popup: MorphPopup = createMorphPopup(popupOptions);
const sameShape: ChipPickerPopup = popup;
const fromCore: MorphPopup = createMorphPopupCore({ trigger });
popup.inner.appendChild(document.createElement('ul'));
const panel: HTMLDivElement = popup.panel;
const popupOpen: boolean = popup.isOpen;
popup.open();
popup.toggle();
popup.close();
popup.destroy();
// @ts-expect-error: the options, and its trigger, are required
createMorphPopup();
// @ts-expect-error: the trigger is required
createMorphPopup({ role: 'menu' });
// @ts-expect-error: not an option (it's `title`)
createMorphPopup({ trigger, heading: { text: 'Country' } });
// @ts-expect-error: maxHeight is 'normal', 'page' or px
createMorphPopup({ trigger, maxHeight: 'tall' });

const modal: ModalLayer = createModalLayer(box);
modal.activate();
const active: boolean = modal.active;
modal.deactivate();
// @ts-expect-error: createModalLayer takes the layer element
createModalLayer('.layer');

/* --- Sheet physics ------------------------------------------------------------------------ */
const points = sheetPhysics.resolveDetents(
  [{ id: 'peek', size: 192, material: 'clear' as const }, { id: 'full', size: 'full' as const }],
  { available: 800, content: 400 },
);
const material: 'clear' | undefined = points[0].material;
const px: number = sheetPhysics.nearestDetent(points, 300).px;
const next: string = sheetPhysics.nextDetent(points, 300, 1).id;
sheetPhysics.flungDetent(points, 300, -1, 2, sheetPhysics.DEFAULTS.hardFlingVelocity);
const banded: number = sheetPhysics.withGive(900, 100, 800) + sheetPhysics.rubber(20, 40);
const dragOptions: DragArbiterOptions = { deadZone: 6, now: () => 0 };
const drag = sheetPhysics.createDragArbiter(dragOptions);
drag.start({ y: 0, size: 300, zone: 'handle', atLargest: false });
const move = drag.move({ y: 10, size: 300, scrollTop: 0 });
const mode: 'pending' | 'resize' | 'native' = move.mode;
const raw: number | undefined = move.raw;
const { velocity } = drag.end();
const wheelOptions: WheelArbiterOptions = { flingVelocity: 0.6 };
const wheel = sheetPhysics.createWheelArbiter(wheelOptions);
const tick = wheel.tick({ deltaY: 10, size: 300, min: 100, max: 800, atLargest: false, scrollTop: 0, scrollable: true });
const dir: 1 | -1 | undefined = tick.dir;
const snap: boolean = wheel.idle();
wheel.settled();
const dismiss: boolean = sheetPhysics.shouldDismiss({ pulled: 60, height: 192, velocity: 0.3 });
// @ts-expect-error: a detent's size is a number, 'full' or 'content'
sheetPhysics.resolveDetents([{ id: 'half', size: '50%' }], { available: 800 });
// @ts-expect-error: resolveDetents needs the available height
sheetPhysics.resolveDetents([{ id: 'half', size: 0.5 }], { content: 400 });
// @ts-expect-error: a drag's zone is 'handle' or 'content'
drag.start({ y: 0, size: 300, zone: 'header' });
// @ts-expect-error: not a wheel arbiter option (it's `flingVelocity`)
sheetPhysics.createWheelArbiter({ fling: 0.6 });

/* --- Blur capability ---------------------------------------------------------------------- */
const blurMode: BlurMode = getBlurMode();
setBlurMode('off');
const capable: boolean = resolveBlurCapability();
applyBlurState(capable);
scheduleIdleBenchmark();
initBlurCapability();
const verdict: boolean | null = getCachedBlurVerdict();
const sample: number = BLUR_BENCHMARK.SAMPLE_MS;
const run: Promise<boolean> = runBlurBenchmark({ onFrame: ({ index, elapsed, gap, warmup, jank }) => { const j: boolean = jank; } });
const again: Promise<boolean> = reevaluateBlurCapability();
window.addEventListener(BLUR_STATE_EVENT, (e) => { const d: BlurStateDetail = (e as CustomEvent<BlurStateDetail>).detail; });
// @ts-expect-error: the blur mode is 'auto', 'on' or 'off'
setBlurMode('always');
// @ts-expect-error: a frame has no `fps`
runBlurBenchmark({ onFrame: (frame) => frame.fps });

/* --- Refraction --------------------------------------------------------------------------- */
const refraction: RefractionOptions = { enabled: false, selector: '.my-glass', refractMorph: true };
initRefraction(refraction);
initRefraction();
setRefraction(true);
const refracting: boolean = getRefraction() && supportsRefraction();
const surfaces: string = GLASS_SURFACES;
window.addEventListener(REFRACTION_STATE_EVENT, (e) => {
  const { active, supported }: RefractionStateDetail = (e as CustomEvent<RefractionStateDetail>).detail;
});
attachRefraction(box);
detachRefraction(box);
const mapOptions: DisplacementMapOptions = { radius: 16, bezel: 12, n: 4, res: 0.5, curve: 2 };
const map = displacementMap(100, 40, mapOptions);
const bytes: Uint8ClampedArray = map.data;
const { bezel, shift }: { bezel: number, shift: number } = fitBend(100, 40, { depth: '50%' });
const n: number = cornerExponent('superellipse(2)') + cornerExponent(null);
const morph: MorphRefractionOptions = { radius: 16, duration: 400, land: false };
morphRefraction(box, morph);
const release: () => void = holdRefraction(box, { radius: 22, max: 2000 });
release();
// @ts-expect-error: not an option (it's `enabled`)
initRefraction({ on: false });
// @ts-expect-error: morphRefraction needs the duration
morphRefraction(box, { radius: 16 });
// @ts-expect-error: the bezel is a number of px
displacementMap(100, 40, { bezel: '12px' });
// @ts-expect-error: setRefraction takes a boolean
setRefraction('on');
