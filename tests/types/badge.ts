// Type-level tests (npm run test:types): createBadge's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createBadge } from '../../types/index.js';
import type { BadgeOptions, Badge, BadgePosition, BadgeAlign } from '../../types/index.js';

const target = document.createElement('button');
const options: BadgeOptions = {
  target, content: 3, max: 99, showZero: true, dot: false, side: 'right', align: 0.25, overlap: false, gap: 8,
  pointer: 'auto', mount: 'beside', tint: '#ff3b30', glass: 'clear', glassStyle: 'inherit', label: '3 unread',
  onPress: (e) => { e.preventDefault(); }, shown: false,
};
const badge: Badge = createBadge(options);
createBadge({ target, content: 'New', align: 'start', tint: null });
createBadge({ target, content: document.createElement('span'), dot: true, pointer: true });

const el: HTMLDivElement = badge.el;
const shown: boolean = badge.isShown;
const mode: 'regular' | 'clear' = badge.glass;
badge.set(12);
badge.set('Now');
badge.set(null);
const position: BadgePosition = { side: 'bottom', align: 'center', overlap: true };
badge.setPosition(position);
badge.setPosition({ align: 0.5 });
const align: BadgeAlign = 'end';
badge.setPosition({ align });
badge.setTint('oklch(0.6 0.2 30)');
badge.setTint(null);
badge.setGlass('regular');
badge.show();
badge.hide();
badge.update();
badge.destroy();

// @ts-expect-error: it needs a target
createBadge({ content: 3 });
// @ts-expect-error: a side is top, right, bottom or left
createBadge({ target, side: 'north' });
// @ts-expect-error: align is start, center, end or a fraction
createBadge({ target, align: 'middle' });
// @ts-expect-error: mount is auto, inside or beside
createBadge({ target, mount: 'over' });
// @ts-expect-error: glass is 'regular' or 'clear'
badge.setGlass('frost');
