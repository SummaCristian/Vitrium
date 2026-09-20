import buttonPage from './button.js';
import togglePage from './toggle.js';
import segmentedControlPage from './segmented-control.js';
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
    id: 'sheet',
    group: 'Overlays',
    title: 'Sheet',
    abstract: 'A glass panel that resizes between detents, as a bottom sheet or a side panel.',
    page: sheetPage,
    related: ['popover', 'tab-bar'],
  },
];

export const byId = (id) => components.find((c) => c.id === id);
