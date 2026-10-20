// Type-level tests (npm run test:types): the glass role protocol as TypeScript sees it, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createToggle, defineGlassRole, setCuratedRoles, setGlassRole, setGlassStyle } from '../../types/index.js';

// Conforms: every style gives every slot.
defineGlassRole('badge', {
  slots: { blur: 'blur', fill: 'color' },
  styles: { frost: { blur: 6, fill: 'white' }, transparent: { blur: 1, fill: 'transparent' }, curated: 'transparent' },
});

defineGlassRole('missing', {
  slots: { blur: 'blur', fill: 'color' },
  // @ts-expect-error: transparent misses the fill slot
  styles: { frost: { blur: 6, fill: 'white' }, transparent: { blur: 1 }, curated: 'frost' },
});

defineGlassRole('extra', {
  slots: { blur: 'blur' },
  // @ts-expect-error: tint isn't one of its slots
  styles: { frost: { blur: 6, tint: 'red' }, transparent: { blur: 1 }, curated: 'frost' },
});

defineGlassRole('no-curated', {
  slots: { blur: 'blur' },
  // @ts-expect-error: every style, curated included
  styles: { frost: { blur: 6 }, transparent: { blur: 1 } },
});

// @ts-expect-error: not a glass style
setGlassStyle('glossy');
setGlassStyle('curated');
setGlassStyle(document.body, 'transparent');

// @ts-expect-error: under curated a role takes frost or transparent
setCuratedRoles({ rail: 'glossy' });
setCuratedRoles({ rail: 'transparent', lens: null });

setGlassRole(document.createElement('div'), 'lens');
createToggle({ value: true, label: 'Wi-Fi' });
