// Vitrium — foundation.
// Styles are imported separately: `import 'vitrium/styles'`.

export { Spring, onSpringFrame, wakeSprings } from './core/spring.js';
export { snapGeometry, morphGeometry, hideInnerBoxInstantly, unhideInnerBox } from './core/flip-morph.js';
export { glide, glideDuration, glideSpring, travelDistance, arcOffset, arcKeyframes, playArc, edgeShift, liquidKeyframes, playLiquid, appleSpring, appleSpringConfig, springEasing, dropletShape, dropletAlong } from './core/motion-path.js';
export { attachLiquidGlass, initLiquidGlass } from './core/liquid-glass.js';
export { createPillDragCore } from './core/pill-drag-core.js';
export { createMorphPopup } from './core/morph-popup.js';
export { createModalLayer } from './core/modal-layer.js';
export { clamp, snapToStep, toFraction, fromFraction } from './core/value-math.js';
export * as sheetPhysics from './core/sheet-physics.js';
export {
  BLUR_MODE_KEY, BLUR_STATE_EVENT,
  getBlurMode, setBlurMode,
  resolveBlurCapability, applyBlurState, scheduleIdleBenchmark, reevaluateBlurCapability,
  initBlurCapability, runBlurBenchmark, getCachedBlurVerdict, BLUR_BENCHMARK,
} from './core/blur-capability.js';
export {
  GLASS_SURFACES, initRefraction, setRefraction, getRefraction, REFRACTION_STATE_EVENT, attachRefraction, detachRefraction, supportsRefraction,
  displacementMap, cornerExponent, morphRefraction,
} from './core/refraction.js';

export { icons } from './components/icons.js';
export { setGlassTint } from './components/glass-tint.js';
export { setGlass } from './components/glass-mode.js';
export { setGlassStyle, getGlassStyle } from './components/glass-style.js';
export { createButton, createToolbar, createBackButton } from './components/button.js';
export { createSegmentedControl } from './components/segmented-control.js';
export { createToggle } from './components/toggle.js';
export { createTabBar } from './components/tabbar.js';
export { createChipPicker } from './components/chip-picker.js';
export { createListPicker } from './components/list-picker.js';
export { createPopover } from './components/popover.js';
export { createSheet } from './components/sheet.js';
export { createSlider } from './components/slider.js';
export { createStepper } from './components/stepper.js';
export { createTextField } from './components/text-field.js';
export { createAlert } from './components/alert.js';
export { createMenu } from './components/menu.js';
export { createProgress } from './components/progress.js';
