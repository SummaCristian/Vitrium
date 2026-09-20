import buttonPage from './button.js';
import togglePage from './toggle.js';
import segmentedControlPage from './segmented-control.js';
import sliderPage from './slider.js';
import chipPickerPage from './chip-picker.js';
import listPickerPage from './list-picker.js';
import alertPage from './alert.js';
import menuPage from './menu.js';
import textFieldPage from './text-field.js';
import stepperPage from './stepper.js';
import progressPage from './progress.js';
import popoverPage from './popover.js';
import tabbarPage from './tabbar.js';
import sheetPage from './sheet.js';

// One entry per component page. `page` is the page's own file, exporting `sections()` like a foundation page.
export const components = [
  {
    id: 'button',
    group: 'Controls',
    title: 'Buttons',
    abstract: 'Round glass buttons, toolbars and the back button.',
    page: buttonPage,
    related: ['toggle', 'segmented-control'],
  },
  {
    id: 'toggle',
    group: 'Controls',
    title: 'Toggle',
    abstract: 'A draggable switch with a springy thumb.',
    page: togglePage,
    related: ['segmented-control', 'button'],
  },
  {
    id: 'segmented-control',
    group: 'Controls',
    title: 'Segmented control',
    abstract: 'A sliding-pill picker, horizontal or vertical.',
    page: segmentedControlPage,
    related: ['toggle', 'button'],
  },
  {
    id: 'progress',
    group: 'Status',
    title: 'Progress',
    abstract: 'A bar or ring that fills to a value, or spins while the amount is unknown.',
    page: progressPage,
    related: ['slider', 'stepper'],
  },
  {
    id: 'stepper',
    group: 'Controls',
    title: 'Stepper',
    abstract: 'A glass capsule with minus and plus halves. Press and hold to repeat.',
    page: stepperPage,
    related: ['slider', 'text-field'],
  },
  {
    id: 'text-field',
    group: 'Controls',
    title: 'Text field',
    abstract: 'A glass capsule around a native input, with search and multiline forms.',
    page: textFieldPage,
    related: ['list-picker', 'slider'],
  },
  {
    id: 'slider',
    group: 'Controls',
    title: 'Slider',
    abstract: 'A glass lens on a track, for one value or a range.',
    page: sliderPage,
    related: ['toggle', 'segmented-control'],
  },
  {
    id: 'chip-picker',
    group: 'Pickers',
    title: 'Chip picker',
    abstract: 'A glass chip that morphs into a panel holding anything.',
    page: chipPickerPage,
    related: ['list-picker', 'popover'],
  },
  {
    id: 'list-picker',
    group: 'Pickers',
    title: 'List picker',
    abstract: 'A select: a chip that morphs into a listbox, with sections and type-ahead.',
    page: listPickerPage,
    related: ['chip-picker', 'segmented-control'],
  },
  {
    id: 'popover',
    group: 'Overlays',
    title: 'Popover',
    abstract: 'A glass panel attached to an element, with an arrow that follows it.',
    page: popoverPage,
    related: ['button', 'toggle'],
  },
  {
    id: 'tab-bar',
    group: 'Navigation',
    title: 'Tab bar',
    abstract: 'A fixed glass bar of tabs, as a row, a rail or one compact bar.',
    page: tabbarPage,
    related: ['segmented-control', 'button'],
  },
  {
    id: 'menu',
    group: 'Overlays',
    title: 'Menu',
    abstract: 'A button that morphs into a list of actions.',
    page: menuPage,
    related: ['popover', 'list-picker'],
  },
  {
    id: 'alert',
    group: 'Overlays',
    title: 'Alert',
    abstract: 'A small modal dialog that asks for a decision and returns the answer.',
    page: alertPage,
    related: ['sheet', 'popover'],
  },
  {
    id: 'sheet',
    group: 'Overlays',
    title: 'Sheet',
    abstract: 'A glass panel that resizes between detents, as a bottom sheet or a side panel.',
    page: sheetPage,
    related: ['popover', 'tab-bar'],
  },
];

export const byId = (id) => components.find((c) => c.id === id);
