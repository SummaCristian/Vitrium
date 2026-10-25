import { createBadge, createSlider } from '../../src/index.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade, swapText } from '../swap.js';
import { button } from '../foundation/util.js';

const SIDES = ['top', 'right', 'bottom', 'left'];
const ALIGNS = ['start', 'center', 'end'];
const CONTENTS = { '3': 3, '120': 120, 'New': 'New', 'dot': null };
const TINTS = { accent: undefined, red: '#ff3b30', green: '#1f9d46', plain: null };
const POINTERS = { auto: 'auto', on: true, off: false };

// Badges live in the page, but they keep watching their target; everything the page made is destroyed once
// `marker` has left the document.
function cleanup(badges, marker) {
  const timer = setInterval(() => {
    if (marker.isConnected) return;
    badges.forEach((b) => b.destroy());
    clearInterval(timer);
  }, 500);
}

export default {
  sections() {
    const badges = [];
    const make = (opts) => { const b = createBadge(opts); badges.push(b); return b; };

    // --- Playground: one badge on a box. Where it sits, what it shows and its tint change on the live one ---
    let target, badge, host;
    const build = (s) => {
      badge?.destroy();
      badge = createBadge({
        target, content: CONTENTS[s.content], dot: s.content === 'dot', max: 99,
        side: s.side, align: s.align, overlap: s.overlap, pointer: POINTERS[s.pointer], tint: TINTS[s.tint], glass: s.glass,
      });
    };
    const playground = createPlayground({
      stageClass: 'stage--backdrop',
      options: [
        { key: 'side', label: 'Side', type: 'choice', choices: SIDES, default: 'top' },
        { key: 'align', label: 'Align', type: 'choice', choices: ALIGNS, default: 'end' },
        { key: 'overlap', label: 'Overlap', type: 'bool', default: true },
        { key: 'pointer', label: 'Pointer', type: 'choice', choices: Object.keys(POINTERS), default: 'auto' },
        { key: 'content', label: 'Content', type: 'choice', choices: Object.keys(CONTENTS), default: '3' },
        { key: 'tint', label: 'Tint', type: 'choice', choices: Object.keys(TINTS), default: 'accent' },
        { key: 'glass', label: 'Glass', type: 'choice', choices: ['regular', 'clear'], default: 'regular' },
      ],
      render(s, stage) {
        target = h('div', { class: 'badge-target' }, 'Inbox');
        host = h('div', { class: 'badge-arena' }, target);
        stage.append(host);
        // Built once it is in the page, which it needs to be to show.
        requestAnimationFrame(() => build(s));
      },
      patch(s, stage, key) {
        if (['side', 'align', 'overlap', 'pointer'].includes(key)) {
          badge.setPosition({ side: s.side, align: s.align, overlap: s.overlap, pointer: POINTERS[s.pointer] });
        } else if (key === 'tint') badge.setTint(TINTS[s.tint]);
        else if (key === 'glass') badge.setGlass(s.glass);
        else if (key === 'content' && s.content !== 'dot' && !badge.el.classList.contains('lg-badge--dot')) badge.set(CONTENTS[s.content]);
        else crossfade(host, stage, () => build(s));
      },
      code(s) {
        const rows = [
          'target: inbox,',
          s.content === 'dot' ? 'dot: true,' : `content: ${typeof CONTENTS[s.content] === 'string' ? `'${CONTENTS[s.content]}'` : CONTENTS[s.content]},`,
          s.content === '120' && 'max: 99,             // shows 99+',
          s.side !== 'top' && `side: '${s.side}',`,
          s.align !== 'end' && `align: '${s.align}',`,
          !s.overlap && 'overlap: false,       // outside the edge, pointing at it',
          s.pointer !== 'auto' && `pointer: ${POINTERS[s.pointer]},`,
          s.tint !== 'accent' && `tint: ${TINTS[s.tint] === null ? 'null,                // plain glass' : `'${TINTS[s.tint]}',`}`,
          s.glass === 'clear' && "glass: 'clear',",
        ].filter(Boolean);
        return `import { createBadge } from 'vitrium';\n\nconst badge = createBadge({\n${rows.map((r) => `  ${r}`).join('\n')}\n});\n\nbadge.set(4);                 // glides to its new width`;
      },
    });

    // --- Counts on glass buttons ---
    const mail = h('button', { class: 'lg-btn lg-glass lg-glass--circle liquid-glass badge-icon', type: 'button', 'aria-label': 'Mail' }, '✉');
    const chat = h('button', { class: 'lg-btn lg-glass lg-glass--circle liquid-glass badge-icon', type: 'button', 'aria-label': 'Messages' }, '💬');
    const bell = h('button', { class: 'lg-btn lg-glass lg-glass--circle liquid-glass badge-icon', type: 'button', 'aria-label': 'Alerts' }, '🔔');
    const counts = h('div', { class: 'row badge-row' }, mail, chat, bell);
    let unread = 3;
    const mailBadge = () => make({ target: mail, content: unread, max: 99, tint: '#ff3b30', label: `${unread} unread` });
    let mailCount;
    const more = button('More mail', () => { unread = unread < 9 ? unread + 4 : unread * 4; mailCount.set(unread); });
    const read = button('Read all', () => { unread = 0; mailCount.set(0); });

    // --- A callout along a bar: "now" on a day ---
    const day = h('div', { class: 'badge-day' });
    const hour = (f) => { const m = Math.round(f * 24 * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
    let now;
    const slider = createSlider({
      value: 0.42, min: 0, max: 1, step: 0.01, label: 'Time of day',
      onChange: (v) => { now.setPosition({ align: v }); now.set(hour(v)); },
    });

    // --- Motion: it grows in and draws back, glides between places, and widens as its count grows ---
    const mover = h('div', { class: 'badge-target' }, 'Target');
    const STOPS = [
      { side: 'top', align: 'end', overlap: true }, { side: 'right', align: 'center', overlap: false },
      { side: 'bottom', align: 'end', overlap: true }, { side: 'bottom', align: 'start', overlap: true },
      { side: 'left', align: 'center', overlap: false }, { side: 'top', align: 'start', overlap: true },
    ];
    let stop = 0, moving, movingCount = 5;
    const toggle = button('Hide', () => {
      if (moving.isShown) { moving.hide(); swapText(toggle, 'Show'); } else { moving.show(); swapText(toggle, 'Hide'); }
    });
    const move = button('Move', () => { stop = (stop + 1) % STOPS.length; moving.setPosition(STOPS[stop]); });
    const add = button('Add 45', () => { movingCount += 45; moving.set(movingCount); });

    // --- Placements around one box ---
    const box = h('div', { class: 'badge-target badge-target--wide' }, 'Target');
    const compass = [];

    requestAnimationFrame(() => {
      mailCount = mailBadge();
      make({ target: chat, dot: true, tint: '#1f9d46', label: 'New messages' });
      make({ target: bell, content: 12, tint: '#ff9f0a' });
      moving = make({ target: mover, content: movingCount, max: 999, tint: '#ff3b30', ...STOPS[0] });
      now = make({ target: day, content: hour(0.42), side: 'top', align: 0.42, overlap: false, tint: '#2f7cf6' });
      for (const [side, align, label, overlap] of [
        ['top', 'start', 'NW', true], ['top', 'center', 'N', true], ['top', 'end', 'NE', true],
        ['right', 'center', 'E', false], ['bottom', 'center', 'S', false], ['left', 'center', 'W', false],
        ['bottom', 'start', 'SW', true], ['bottom', 'end', 'SE', true],
      ]) compass.push(make({ target: box, content: label, side, align, overlap }));
    });
    cleanup(badges, counts);

    return [
      section('Overview', {},
        h('p', {}, 'A badge is a small piece of tinted glass marking an element. It can be a count on a corner, a word on one of its sides, or a callout pointing at a spot along an edge, like "now" on a timeline.'),
        h('p', {}, 'Its pointer is part of the same piece of glass as its body: one outline, with the rim, the stroke and the shadow running around both, so no seam shows where they meet. It grows out of what it points at when it appears, glides when it moves, and changes width smoothly when its text does.')),

      section('Playground', {},
        h('p', {}, 'Choose a side and where along it the badge sits. With overlap on, it is centered across the edge, as a count on a corner. Turn it off and it moves outside the edge, a gap away, and points at the spot. Changes glide.'),
        playground),

      section('Where it sits', {},
        h('p', {}, '`side` picks an edge of the target, and `align` a point along it: `"start"`, `"center"`, `"end"`, or a fraction from 0 (the left or top end) to 1. Corners are a side and an end; the compass points are a side and its center.'),
        h('div', { class: 'card stage--backdrop badge-card' }, h('div', { class: 'badge-arena badge-arena--tall' }, box)),
        table(['Option', 'What it does'], [
          ['`overlap: true`', 'The default. The badge is centered on the point, across the edge. No pointer.'],
          ['`overlap: false`', 'The badge sits outside the edge, `gap` px off it (default 6), and points at the point. It stays within the length of the side, and its pointer slides to keep pointing.'],
          ['`pointer`', '`"auto"` (default) shows one only outside the edge. `true` or `false` force it.'],
        ])),

      section('Appearing and moving', {},
        h('p', {}, '`show()` grows it out of what it points at, or out of its middle when it has no pointer, on the same glide as the popover: the axis away from the target leads and the one across it follows, and it draws back the same way. `setPosition()` glides it to its new place along a slight curve, and `set()` glides it to its new width.'),
        h('div', { class: 'card stage--backdrop badge-card' }, h('div', { class: 'demo-stack' },
          h('div', { class: 'badge-arena badge-arena--big' }, mover), h('div', { class: 'row' }, toggle, move, add))),
        codeBlock(`
badge.hide();                                            // draws back in
badge.show();                                            // grows out again
badge.setPosition({ side: 'right', align: 'center', overlap: false });   // glides there
badge.set(50);                                           // glides to its new width`)),

      section('Counts', {},
        h('p', {}, 'Give it a number and it shows it. Above `max` it reads `99+`. At 0 or below it hides, and comes back when the number rises, unless `showZero` is set. `dot: true` is a dot with nothing in it.'),
        h('div', { class: 'card stage--backdrop badge-card' }, h('div', { class: 'demo-stack' }, counts, h('div', { class: 'row' }, more, read)))),

      section('Callouts', {},
        h('p', {}, 'Outside an edge, with a fraction for `align`, a badge marks a spot along it: a time on a day, a value on a track. Move it with `setPosition()` and it glides there. Drag the slider.'),
        h('div', { class: 'card stage--backdrop badge-card' }, h('div', { class: 'demo-stack badge-timeline' }, day, slider.el)),
        codeBlock(`
const now = createBadge({ target: day, content: '10:05', side: 'top', align: 0.42, overlap: false });

slider.onChange = (v) => { now.setPosition({ align: v }); now.set(hour(v)); };`)),

      section('Inside or beside', {},
        h('p', {}, 'A badge on glass cannot go inside it. Glass, and anything with a filter, opacity below 1, a mask or a clip-path, cuts what is inside it off from the page behind it, so a badge in there would only blur the button, not the page. A badge on a corner also cannot go inside something that clips its overflow.'),
        h('p', {}, 'So by default (`mount: "auto"`) a badge goes right after its target, beside it, when the target is glass or clips, and inside it otherwise. Beside, it is placed over the target and follows it as it moves or resizes. Inside, it moves with the target for free. Force one with `mount: "inside"` or `"beside"`. A badge goes in the target\'s positioned ancestor\'s coordinates, so the target should not be the last child that some selector of yours depends on.')),

      section('How it works', {},
        h('p', {}, 'A badge and a popover share one piece of core: `createShapedGlass`. It cuts a glass surface to one outline, its body and its pointer together, and draws the material along that outline: the rim, the outline and its shadows, the elevation ring and the outside stroke. It reads them off a hidden `.lg-glass` in the same place, so the theme, tint, clear or regular glass, elevation and glass style all apply, exactly as on any other glass.'),
        h('p', {}, 'The blur takes two routes. In Chromium, a blurred element that is masked or clipped is drawn wrongly under pinch zoom and inside rounded containers that clip, so there the blur comes from two pieces that need no clipping: the body, a plain rounded rectangle, and the pointer, a rotated square. Its pointer has straight sides. Elsewhere the glass blurs itself, cut by an SVG clip path, and its pointer curves out of the body to a rounded tip.')),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Name it. '), 'A badge\'s text is read where it sits. Give it a `label` (such as "3 unread") and it is read as one image with that name instead.'),
          h('li', {}, h('strong', {}, 'Pressable. '), 'With `onPress` it is a button: focusable, and pressed with Enter or Space too.'),
          h('li', {}, h('strong', {}, 'Hidden means gone. '), 'A hidden badge is `visibility: hidden`, out of the tab order and the accessibility tree.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'It appears, moves and resizes without animating.'))),

      section('Styling', {},
        table(['Token or variable', 'What it does'], [
          ['`--lg-badge-font-size`', 'Its text size. Default: 12px. Its padding and its pointer scale with it.'],
          ['`--lg-badge-dot-size`', 'A dot\'s diameter. Default: 10px.'],
          ['`--lg-z-badge`', 'Its stacking order. Default: 5.'],
          ['`--lg-badge-dur`', 'How long it takes to grow in, for a 400px trip (each one is fitted to its size).'],
        ])),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createBadge(options)'),
        table(['Option', 'Type', 'Description'], [
          ['target', 'Element', 'The element it marks. It has to be in the page to show.'],
          ['content', 'string | number | Node', 'What it shows.'],
          ['max', 'number', 'A number above it reads `max+`.'],
          ['showZero', 'boolean', 'Show a number of 0 or less instead of hiding. Default: `false`.'],
          ['dot', 'boolean', 'A dot with nothing in it. Default: `false`.'],
          ['side', "'top' | 'right' | 'bottom' | 'left'", 'The edge it sits on. Default: `"top"`.'],
          ['align', "'start' | 'center' | 'end' | number", 'Where along the edge, or a fraction from 0 to 1. Default: `"end"`.'],
          ['overlap', 'boolean', 'Across the edge (true), or outside it, pointing at it. Default: `true`.'],
          ['gap', 'number', 'px off the edge when outside it. Default: 6.'],
          ['pointer', "boolean | 'auto'", 'Default: `"auto"`, only outside the edge.'],
          ['mount', "'auto' | 'inside' | 'beside'", 'Inside the target or after it. Default: `"auto"`.'],
          ['tint', 'string | null', 'Any CSS color, or `null` for plain glass. Default: the accent.'],
          ['glass', "'regular' | 'clear'", 'The material. Default: `"regular"`.'],
          ['glassStyle', "'inherit' | 'frost' | 'transparent' | 'curated'", 'Default: `"inherit"`, the page\'s.'],
          ['label', 'string', 'Accessible name.'],
          ['onPress', '(event) => void', 'Makes it a button.'],
          ['shown', 'boolean', 'Whether it starts shown. Default: `true`.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The badge element.'],
          ['set(content)', 'Change what it shows. It glides to its new width, and a count of 0 hides it.'],
          ['setPosition({ side, align, overlap, gap, pointer })', 'Move it. Only what you pass changes, and it glides there.'],
          ['setTint(color)', 'A CSS color, or `null` for plain glass.'],
          ['setGlass(mode)', 'Switch between `"regular"` and `"clear"`. `glass` reads it back.'],
          ['show(), hide()', 'Grow it in, or draw it back. `isShown` says which.'],
          ['update()', 'Place it again now. It does this on its own as the target moves or resizes.'],
          ['destroy()', 'Remove it.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
