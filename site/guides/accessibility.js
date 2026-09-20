import { h, section, table } from '../dom.js';

export default {
  id: 'accessibility',
  title: 'Accessibility',
  abstract: 'What the components do for you, and what is left to you.',
  sections() {
    return [
      section('Overview', {},
        h('p', {}, 'Glass is a visual effect, and the components are built so that it does not get in the way. They use real elements and the matching ARIA roles, they work from the keyboard, and they respect the preferences a person has set on their device. This page collects it in one place. Each component page has the detail.'),
        h('p', {}, 'A few things cannot be done for you, because only you know what things mean. Those are listed at the end.')),

      section('Roles and keyboard', {},
        table(['Component', 'Role', 'Keyboard'], [
          ['Buttons', 'Native `button`.', 'Enter and Space.'],
          ['Toggle', '`switch`, with `aria-checked`.', 'Space and Enter.'],
          ['Segmented control', '`radiogroup` of `radio`s.', 'Arrows, with the selected segment in the tab order.'],
          ['Slider', '`slider`, one per thumb.', 'Arrows, Page Up and Down, Home and End.'],
          ['Stepper', '`group` of two buttons, with a live region for the value.', 'Tab to each, Enter or Space.'],
          ['Text field', 'Native `input` or `textarea`.', 'As a native field. Escape clears a search.'],
          ['Tab bar', '`tablist` of `tab`s.', 'Arrows, Home and End, selecting as they go.'],
          ['Menu', '`menu` of `menuitem`s.', 'Arrows, type-ahead, Enter, Escape.'],
          ['List picker', '`listbox` of `option`s.', 'Arrows, Home and End, type-ahead.'],
          ['Chip picker', '`dialog` panel (or your role).', 'Escape closes, and a dialog traps focus.'],
          ['Popover', '`dialog`, or `tooltip`.', 'Escape closes and returns focus.'],
          ['Sheet', '`dialog` when modal, `region` otherwise.', 'A focusable handle resizes it with the arrow keys.'],
          ['Alert', '`alertdialog`.', 'Focus starts on the default action. Escape cancels.'],
          ['Progress', '`progressbar`.', 'Not interactive.'],
        ])),

      section('What the user has asked for', {},
        table(['Preference', 'What happens'], [
          ['`prefers-reduced-motion`', 'The springs jump to their target. The morphs of the pickers, menu and alert become plain appearances. Presses keep their feedback but lose the overshoot. The indeterminate progress pulses instead of sweeping.'],
          ['`prefers-reduced-transparency`', 'Blur is turned off and the glass becomes near-opaque, unless a person has explicitly set blur to on.'],
          ['`prefers-color-scheme`', 'The theme follows it, unless a theme is pinned on `<html>`.'],
          ['`hover: none`', 'Hover effects are not applied, so a touch screen has no stuck hover state.'],
        ])),

      section('Focus', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'A visible ring, for the keyboard. '), 'Controls show a focus ring in the accent color on keyboard focus, and not after a click, using `:focus-visible`.'),
          h('li', {}, h('strong', {}, 'Some controls show focus as light. '), 'The slider\'s thumb and the toggle lift into glass on keyboard focus instead of drawing an outline.'),
          h('li', {}, h('strong', {}, 'Focus goes where it should. '), 'Opening a dialog moves focus into it, closing returns it to what opened it, and a blocking layer traps Tab and makes the page behind it `inert`.'))),

      section('Right-to-left text', {},
        h('p', {}, 'Where a component has a direction, it follows the writing direction. The tab bar\'s `start` and `end` placements are logical, and its Left and Right arrows swap in right-to-left rows. The slider\'s keys and travel flip. The sheet\'s `side` is `start` or `end`. The indeterminate progress sweeps the other way.')),

      section('Contrast', {},
        h('p', {}, 'Glass is translucent, so what is behind it affects the contrast of what is on it. The regular material is dense enough to keep text legible over most content, and the clear one is not: it is for surfaces that hold little text. Test your own content over the backgrounds it will meet, in both themes. When blur is off, the near-opaque tint takes over, so the worst case is the case with blur on.'),
        h('p', {}, 'A tinted surface picks its own text color, but check that too. See Tint on the Glass page.')),

      section('What is left to you', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Names. '), 'An icon-only button, toggle, slider or stepper has no text to name it. Pass `label`, and give icon-only segments an `ariaLabel`. Use words that say what it does: "Add a guest", not "Plus".'),
          h('li', {}, h('strong', {}, 'Visible labels and messages. '), 'The text field and the slider show no label and no error message of their own. Connect yours with `aria-labelledby` and `aria-describedby`.'),
          h('li', {}, h('strong', {}, 'Announcing results. '), 'A progressbar is not a live region. Announce completion, or errors, yourself.'),
          h('li', {}, h('strong', {}, 'Something to do when hover is the only way. '), 'A hover card is invisible to a keyboard and a touch screen. Trigger it on focus too, and keep anything essential out of it.'),
          h('li', {}, h('strong', {}, 'Target size. '), 'The controls are sized for touch. If you shrink one with your own CSS, keep the hit area at least about 44px.'))),
    ];
  },
};
