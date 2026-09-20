import buttonPage from './button.js';
import togglePage from './toggle.js';
import segmentedControlPage from './segmented-control.js';

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
];

export const byId = (id) => components.find((c) => c.id === id);
