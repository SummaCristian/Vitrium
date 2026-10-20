// Vitrium — foundation.
// Styles are imported separately: `import 'vitrium/styles'`.

export { Spring, onSpringFrame, wakeSprings } from './core/spring.js';
/** @typedef {import('./core/spring.js').SpringConfig} SpringConfig */
export { snapGeometry, morphGeometry, hideInnerBoxInstantly, unhideInnerBox } from './core/flip-morph.js';
/** @typedef {import('./core/flip-morph.js').MorphGeometryOptions} MorphGeometryOptions */
export { glide, glideDuration, glideSpring, travelDistance, arcOffset, arcKeyframes, playArc, edgeShift, liquidKeyframes, stretchScale, stretchWindow, glideTime, playLiquid, appleSpring, appleSpringConfig, springEasing, dropletShape, dropletAlong } from './core/motion-path.js';
/** @typedef {import('./core/motion-path.js').Rect} Rect */
/** @typedef {import('./core/motion-path.js').Size} Size */
/** @typedef {import('./core/motion-path.js').Easing} Easing */
/** @typedef {import('./core/motion-path.js').Vec2} Vec2 */
/** @typedef {import('./core/motion-path.js').EdgeFit} EdgeFit */
/** @typedef {import('./core/motion-path.js').ArcOptions} ArcOptions */
/** @typedef {import('./core/motion-path.js').PlayArcOptions} PlayArcOptions */
/** @typedef {import('./core/motion-path.js').LiquidOptions} LiquidOptions */
/** @typedef {import('./core/motion-path.js').LiquidKeyframes} LiquidKeyframes */
/** @typedef {import('./core/motion-path.js').DropletShape} DropletShape */
export { attachLiquidGlass, initLiquidGlass } from './core/liquid-glass.js';
/** @typedef {import('./core/liquid-glass.js').LiquidGlassOptions} LiquidGlassOptions */
export { createPillDragCore } from './core/pill-drag-core.js';
/** @typedef {import('./core/pill-drag-core.js').PillDragCoreOptions} PillDragCoreOptions */
/** @typedef {import('./core/pill-drag-core.js').PillDragCore} PillDragCore */
/** @typedef {import('./core/pill-drag-core.js').PillLift} PillLift */
/** @typedef {import('./core/pill-drag-core.js').PillWalls} PillWalls */
/** @typedef {import('./core/pill-drag-core.js').PillStretch} PillStretch */
/** @typedef {import('./core/pill-drag-core.js').PillHover} PillHover */
/** @typedef {import('./core/pill-drag-core.js').PillTrail} PillTrail */
export { createMorphPopup } from './core/morph-popup.js';
/** @typedef {import('./core/morph-popup.js').MorphPopupOptions} MorphPopupOptions */
/** @typedef {import('./core/morph-popup.js').MorphPopup} MorphPopup */
export { createModalLayer } from './core/modal-layer.js';
/** @typedef {import('./core/modal-layer.js').ModalLayer} ModalLayer */
export { clamp, snapToStep, toFraction, fromFraction } from './core/value-math.js';
export * as sheetPhysics from './core/sheet-physics.js';
/** @typedef {import('./core/sheet-physics.js').DetentDef} DetentDef */
/** @typedef {import('./core/sheet-physics.js').DetentPoint} DetentPoint */
/** @typedef {import('./core/sheet-physics.js').DragArbiterOptions} DragArbiterOptions */
/** @typedef {import('./core/sheet-physics.js').DragArbiter} DragArbiter */
/** @typedef {import('./core/sheet-physics.js').DragMove} DragMove */
/** @typedef {import('./core/sheet-physics.js').WheelArbiterOptions} WheelArbiterOptions */
/** @typedef {import('./core/sheet-physics.js').WheelArbiter} WheelArbiter */
/** @typedef {import('./core/sheet-physics.js').WheelTickInput} WheelTickInput */
/** @typedef {import('./core/sheet-physics.js').WheelTick} WheelTick */
export {
  BLUR_MODE_KEY, BLUR_STATE_EVENT,
  getBlurMode, setBlurMode,
  resolveBlurCapability, applyBlurState, scheduleIdleBenchmark, reevaluateBlurCapability,
  initBlurCapability, runBlurBenchmark, getCachedBlurVerdict, BLUR_BENCHMARK,
} from './core/blur-capability.js';
/** @typedef {import('./core/blur-capability.js').BlurMode} BlurMode */
/** @typedef {import('./core/blur-capability.js').BlurBenchmarkFrame} BlurBenchmarkFrame */
/** @typedef {import('./core/blur-capability.js').BlurStateDetail} BlurStateDetail */
export {
  GLASS_SURFACES, initRefraction, setRefraction, getRefraction, REFRACTION_STATE_EVENT, attachRefraction, detachRefraction, supportsRefraction,
  displacementMap, fitBend, cornerExponent, morphRefraction, holdRefraction,
} from './core/refraction.js';
/** @typedef {import('./core/refraction.js').RefractionOptions} RefractionOptions */
/** @typedef {import('./core/refraction.js').RefractionStateDetail} RefractionStateDetail */
/** @typedef {import('./core/refraction.js').DisplacementMapOptions} DisplacementMapOptions */
/** @typedef {import('./core/refraction.js').RefractionMap} RefractionMap */
/** @typedef {import('./core/refraction.js').MorphRefractionOptions} MorphRefractionOptions */

export { icons } from './components/icons.js';
export { setGlassTint } from './components/glass-tint.js';
export { setGlass } from './components/glass-mode.js';
/** @typedef {import('./components/glass-mode.js').GlassMode} GlassMode */
export { setGlassStyle, getGlassStyle, rememberGlassStyle, restoreGlassStyle } from './components/glass-style.js';
export { defineGlassRole, setGlassRole, setCuratedRoles, getGlassRoles, GLASS_STYLES } from './components/glass-roles.js';
export { createButton, createToolbar, createBackButton } from './components/button.js';
/** @typedef {import('./components/button.js').ButtonOptions} ButtonOptions */
/** @typedef {import('./components/button.js').BackButtonOptions} BackButtonOptions */
export { createSegmentedControl } from './components/segmented-control.js';
/** @typedef {import('./components/segmented-control.js').SegmentedControlOptions} SegmentedControlOptions */
/** @typedef {import('./components/segmented-control.js').SegmentedControl} SegmentedControl */
/** @typedef {import('./components/segmented-control.js').SegmentedItem} SegmentedItem */
/** @typedef {import('./components/segmented-control.js').SegmentedItemChange} SegmentedItemChange */
export { createToggle } from './components/toggle.js';
/** @typedef {import('./components/toggle.js').ToggleOptions} ToggleOptions */
/** @typedef {import('./components/toggle.js').Toggle} Toggle */
export { createTabBar } from './components/tabbar.js';
/** @typedef {import('./components/tabbar.js').TabBarOptions} TabBarOptions */
/** @typedef {import('./components/tabbar.js').TabBar} TabBar */
/** @typedef {import('./components/tabbar.js').TabBarTab} TabBarTab */
/** @typedef {import('./components/tabbar.js').TabBarPlacement} TabBarPlacement */
export { createChipPicker } from './components/chip-picker.js';
/** @typedef {import('./components/chip-picker.js').ChipPickerOptions} ChipPickerOptions */
/** @typedef {import('./components/chip-picker.js').ChipPicker} ChipPicker */
/** @typedef {import('./components/chip-picker.js').ChipPickerPopup} ChipPickerPopup */
/** @typedef {import('./components/chip-picker.js').PanelTitle} PanelTitle */
export { createListPicker } from './components/list-picker.js';
/** @typedef {import('./components/list-picker.js').ListPickerOptions} ListPickerOptions */
/** @typedef {import('./components/list-picker.js').ListPicker} ListPicker */
/** @typedef {import('./components/list-picker.js').ListPickerOption} ListPickerOption */
/** @typedef {import('./components/list-picker.js').ListPickerSection} ListPickerSection */
export { createPopover } from './components/popover.js';
/** @typedef {import('./components/popover.js').PopoverOptions} PopoverOptions */
/** @typedef {import('./components/popover.js').Popover} Popover */
/** @typedef {import('./components/popover.js').PopoverPlacement} PopoverPlacement */
export { createSheet, DEFAULT_SHEET_DETENTS } from './components/sheet.js';
/** @typedef {import('./components/sheet.js').SheetOptions} SheetOptions */
/** @typedef {import('./components/sheet.js').Sheet} Sheet */
/** @typedef {import('./components/sheet.js').SheetDetent} SheetDetent */
/** @typedef {import('./components/sheet.js').SheetMargin} SheetMargin */
/** @typedef {import('./components/sheet.js').SheetBreakpoint} SheetBreakpoint */
/** @typedef {import('./components/sheet.js').SheetSide} SheetSide */
/** @typedef {import('./components/sheet.js').SheetDismissReason} SheetDismissReason */
/** @typedef {import('./components/sheet.js').SheetBackgroundInteraction} SheetBackgroundInteraction */
/** @typedef {import('./components/sheet.js').SheetPresentOptions} SheetPresentOptions */
export { createSlider } from './components/slider.js';
/** @typedef {import('./components/slider.js').SliderValue} SliderValue */
/**
 * @template {SliderValue} [V=SliderValue]
 * @typedef {import('./components/slider.js').SliderOptions<V>} SliderOptions
 */
/**
 * @template {SliderValue} [V=SliderValue]
 * @typedef {import('./components/slider.js').Slider<V>} Slider
 */
export { createStepper } from './components/stepper.js';
/** @typedef {import('./components/stepper.js').StepperOptions} StepperOptions */
/** @typedef {import('./components/stepper.js').Stepper} Stepper */
export { createTextField } from './components/text-field.js';
/** @typedef {import('./components/text-field.js').TextFieldOptions} TextFieldOptions */
/**
 * @template {HTMLInputElement | HTMLTextAreaElement} [I=HTMLInputElement | HTMLTextAreaElement]
 * @typedef {import('./components/text-field.js').TextField<I>} TextField
 */
export { createAlert } from './components/alert.js';
/** @typedef {import('./components/alert.js').AlertOptions} AlertOptions */
/** @typedef {import('./components/alert.js').Alert} Alert */
/** @typedef {import('./components/alert.js').AlertAction} AlertAction */
/** @typedef {import('./components/alert.js').AlertPresentOptions} AlertPresentOptions */
export { createMenu } from './components/menu.js';
/** @typedef {import('./components/menu.js').MenuOptions} MenuOptions */
/** @typedef {import('./components/menu.js').Menu} Menu */
/** @typedef {import('./components/menu.js').MenuEntry} MenuEntry */
/** @typedef {import('./components/menu.js').MenuItem} MenuItem */
/** @typedef {import('./components/menu.js').MenuSeparator} MenuSeparator */
/** @typedef {import('./components/menu.js').MenuLabel} MenuLabel */
export { createProgress } from './components/progress.js';
/** @typedef {import('./components/progress.js').ProgressOptions} ProgressOptions */
/** @typedef {import('./components/progress.js').Progress} Progress */
