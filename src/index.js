// Liquid Glass Web — foundation.
// Styles are imported separately: `import 'liquid-glass-web/styles'`.

export { Spring, onSpringFrame, wakeSprings } from './core/spring.js';
export { snapGeometry, morphGeometry, hideInnerBoxInstantly, unhideInnerBox } from './core/flip-morph.js';
export { attachLiquidGlass, initLiquidGlass } from './core/liquid-glass.js';
export { createPillDragCore } from './core/pill-drag-core.js';
export { haptics, setHaptics } from './core/haptics.js';
export {
  BLUR_MODE_KEY, BLUR_STATE_EVENT,
  getBlurMode, setBlurMode,
  resolveBlurCapability, applyBlurState, scheduleIdleBenchmark, reevaluateBlurCapability,
  initBlurCapability,
} from './core/blur-capability.js';
