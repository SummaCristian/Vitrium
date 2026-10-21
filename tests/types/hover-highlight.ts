// Type-level tests (npm run test:types): createHoverHighlight's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createHoverHighlight, highlightRect } from '../../types/index.js';
import type { HoverHighlightOptions, HoverHighlight, HoverHighlightShape } from '../../types/index.js';

const bar = document.createElement('div');
const shape: HoverHighlightShape = { x: 4, y: 4, width: 40, height: 36 };
const options: HoverHighlightOptions = {
  items: '.item', inset: 4, lean: 0.12, leanCross: 0.1, contentLean: 0.06, scale: 1.04, refract: false,
  content: 'self',
  shape: () => shape,
  onChange: (item) => { const el: HTMLElement | null = item; },
};
const hl: HoverHighlight = createHoverHighlight(bar, options);
createHoverHighlight(bar);
createHoverHighlight(bar, { items: (c) => c.querySelectorAll('button'), content: (item) => [item.firstElementChild!], scale: (item) => (item.textContent ? 1.035 : 1.08) });

const el: HTMLElement = hl.el;
const item: HTMLElement | null = hl.item;
hl.refresh();
hl.clear();
hl.destroy();

const r = highlightRect(100, 44, 4);
const n: number = r.width + r.height + r.x + r.y + r.radius;

// @ts-expect-error: the container is required
createHoverHighlight();
// @ts-expect-error: content is 'children', 'self', 'none' or a function
createHoverHighlight(bar, { content: 'all' });
// @ts-expect-error: not an option (it's `lean`)
createHoverHighlight(bar, { tilt: 0.1 });
// @ts-expect-error: refract is a boolean
createHoverHighlight(bar, { refract: 'yes' });
// @ts-expect-error: a shape needs a height
createHoverHighlight(bar, { shape: () => ({ x: 0, y: 0, width: 10 }) });
