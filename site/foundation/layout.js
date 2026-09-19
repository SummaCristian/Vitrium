import { h, section, table, codeBlock } from '../dom.js';
import { html } from './util.js';

const SPACE = [
  ['--lg-tabbar-top-space', 'A bar along the top edge, or a rail whose top is at the edge.'],
  ['--lg-tabbar-bottom-space', 'The bottom row on phones.'],
  ['--lg-tabbar-start-space', 'A rail on the start edge (the left, in left-to-right text).'],
  ['--lg-tabbar-end-space', 'A rail on the end edge.'],
];

const OFFSETS = [
  ['--lg-tabbar-bottom-offset', '28px', 'Clearance from the bottom edge. Also the rail\'s distance from the bottom when railAlign is "bottom".'],
  ['--lg-tabbar-top-offset', '20px', 'Clearance from the top edge, for a top row or the rail.'],
  ['--lg-tabbar-start-offset', '20px', 'The rail\'s distance from the start edge.'],
  ['--lg-tabbar-end-offset', '20px', 'The rail\'s distance from the end edge.'],
  ['--lg-tabbar-inset', '1.25rem', 'Side inset of the row when a prominent tab is used.'],
];

export default {
  id: 'layout',
  title: 'Layout',
  abstract: 'How the fixed tab bar tells the rest of the page how much room it takes.',
  sections() {
    // Live readout: these are the values on this very page, so resizing shows them change.
    const cells = new Map(SPACE.map(([name]) => [name, h('code', {}, '')]));
    const read = () => { for (const [name, el] of cells) el.textContent = getComputedStyle(html).getPropertyValue(name).trim() || '0px'; };
    read();
    const timer = setInterval(() => { if (!cells.values().next().value.isConnected) clearInterval(timer); else read(); }, 300);

    return [
      section('Overview', {},
        h('p', {}, 'The tab bar is fixed, like a native one. On narrow screens it is a row pinned to the bottom; on wide screens it is a vertical rail in a corner, or, in compact mode, a single bar centred at the top. This site uses the compact bar.'),
        h('p', {}, 'Because it floats above the page, the page needs to know how much space to leave. The bar publishes that as CSS variables on <html>.')),
      section('Reserved space', {},
        h('p', {}, 'There is one variable per side. Only the side the bar occupies is non-zero, and it is the bar\'s size plus its clearance from that edge. The last column shows the live values for this page.'),
        table(['Variable', 'When it is non-zero', 'Now'], SPACE.map(([name, when]) => [h('code', {}, name), when, cells.get(name)])),
        codeBlock(`
body {
  padding-top: var(--lg-tabbar-top-space, 0px);
  padding-bottom: var(--lg-tabbar-bottom-space, 0px);
  padding-inline: var(--lg-tabbar-start-space, 0px) var(--lg-tabbar-end-space, 0px);
}`, 'text')),
      section('Offsets', {},
        h('p', {}, 'The clearance from each edge is also a variable. Call tabbar.refresh() after changing one, so the published space follows.'),
        table(['Variable', 'Default', 'What it sets'], OFFSETS.map(([name, def, what]) => [h('code', {}, name), h('code', {}, def), what]))),
      section('Orientation and placement', {},
        h('p', {}, 'orientation is "auto", "horizontal" or "vertical". In auto, the bar is a rail from 600px wide and a row below that; breakpoint changes the threshold. placement picks the edge: row is "bottom" or "top", rail is "start" or "end", and railAlign is "top", "center" or "bottom".'),
        h('p', {}, 'compact: true replaces the rail on wide screens with one horizontal bar at the top. When the layout on screen has to change, the bar animates between the two.')),
    ];
  },
};
