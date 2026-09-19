import { test, expect } from '@playwright/test';

// Viewport 430x900 with the demo's 20px top/bottom margins: available height 860.
//   peek 192px, half 0.5 -> 430px, full 0.85 -> 731px
const PEEK = 192, HALF = 430, FULL = 731;

const state = (page) => page.evaluate(() => ({
  detent: sheet.detent,
  height: Math.round(sheet.height),
  scrollTop: Math.round(sheet.scrollTop),
  gesturing: sheet.isGesturing,
}));

// Wait until the sheet has stopped moving.
async function settle(page) {
  let last = -1, stable = 0;
  for (let i = 0; i < 60 && stable < 4; i++) {
    await page.waitForTimeout(50);
    const h = await page.evaluate(() => sheet.height);
    stable = Math.abs(h - last) < 0.2 ? stable + 1 : 0;
    last = h;
  }
}

const box = async (page, sel) => (await page.locator(sel).boundingBox());
const centerOf = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
// The tab bar floats over the lower part of a collapsed sheet, so hover where the sheet is exposed.
const sheetTop = async (page) => centerOf(await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__header'));

// A drag that comes to rest before it lifts (`hold`), so it is a plain drag and not a fling.
async function mouseDrag(page, from, dy, { steps = 8, pause = 30, hold = 160 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x, from.y + (dy * i) / steps); await page.waitForTimeout(pause); }
  await page.waitForTimeout(hold);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto('/?tab=explore');
  await page.waitForFunction(() => window.sheet);
  await page.waitForTimeout(300);
});

test.describe('tab navigation', () => {
  test('the sheet lives on the Explore tab', async ({ page }) => {
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet')).toBeVisible();
    await expect(page.locator('#panel-home')).toBeHidden();
    await expect(page.locator('.lg-tabbar__tab[data-id="explore"]')).toHaveAttribute('aria-selected', 'true');
  });

  test('leaving the tab hides the sheet, and coming back restores it as it was', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('half', { animate: false }));
    await page.locator('.lg-tabbar__tab[data-id="home"]').click();
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet')).toBeHidden();
    await expect(page.locator('#panel-home')).toBeVisible();
    await page.locator('.lg-tabbar__tab[data-id="explore"]').click();
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await state(page)).toMatchObject({ detent: 'half', height: HALF });
  });

  test('the tab bar stays above the sheet and clickable while the sheet is open', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    await page.waitForTimeout(200);
    await page.locator('.lg-tabbar__tab[data-id="home"]').click();
    await expect(page.locator('#panel-home')).toBeVisible();
  });
});

test.describe('presentation', () => {
  test('starts at the peek detent', async ({ page }) => {
    expect(await state(page)).toMatchObject({ detent: 'peek', height: PEEK });
    const handle = page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__handle');
    await expect(handle).toHaveAttribute('role', 'separator');
    await expect(handle).toHaveAttribute('aria-valuetext', 'peek');
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet')).toHaveAttribute('role', 'region');
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet')).toHaveAttribute('aria-label', 'Places');
  });

  test('does not block what is behind it', async ({ page }) => {
    await page.locator('#m1').click();
    await expect(page.locator('#marker-count')).toHaveText('1');
  });

  test('uses the clear material below the largest detent and the regular one at it', async ({ page }) => {
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__glass')).toHaveClass(/is-clear/);
    await page.evaluate(() => sheet.setDetent('full'));
    await settle(page);
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__glass')).not.toHaveClass(/is-clear/);
  });

  test('sits the bottom margin plus the safe-area inset above the viewport bottom, tab bar included', async ({ page }) => {
    const gaps = () => page.evaluate(() => ({
      sheet: Math.round(innerHeight - document.querySelector('.lg-sheet-frame:not([data-modal]) .lg-sheet').getBoundingClientRect().bottom),
      bar: Math.round(innerHeight - document.querySelector('.lg-tabbar__bar').getBoundingClientRect().bottom),
      available: document.querySelector('.lg-sheet-frame:not([data-modal])').clientHeight,
    }));
    // Without an inset: 20px for the sheet, 28px for the tab bar (8px apart, so the sheet wraps it).
    expect(await gaps()).toMatchObject({ sheet: 20, bar: 28 });

    // With an iPhone-style bottom inset both rise by exactly that much, and the room
    // the detents are fractions of shrinks by the same amount.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 34, left: 0, right: 0 } });
    await page.waitForTimeout(400);
    const g = await gaps();
    expect(g).toMatchObject({ sheet: 20 + 34, bar: 28 + 34 });
    expect(g.available).toBe(860 - 34);
    await page.evaluate(() => sheet.setDetent('half', { animate: false }));
    expect((await state(page)).height).toBe(Math.round(0.5 * (860 - 34)));
  });

  test('the corner radius eases from 38.7px at the smallest detent to 28px at the largest', async ({ page }) => {
    const radius = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.lg-sheet-frame:not([data-modal]) .lg-sheet')).getPropertyValue('--lg-sheet-radius')));
    expect(await radius()).toBeCloseTo(38.7, 1);                    // peek
    await page.evaluate(() => sheet.setDetent('half', { animate: false }));
    await page.waitForTimeout(200);
    const t = (HALF - PEEK) / (FULL - PEEK);
    expect(await radius()).toBeCloseTo(38.7 + (28 - 38.7) * t, 1);  // linear with the size
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    await page.waitForTimeout(200);
    expect(await radius()).toBeCloseTo(28, 1);
    // and it is what is actually painted, not just the variable
    const painted = await page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__glass').evaluate(n => parseFloat(getComputedStyle(n).borderTopLeftRadius));
    expect(painted).toBeCloseTo(28, 1);
  });

  test('a fixed-width panel keeps a plain 28px radius at every detent', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(300);
    const radius = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.lg-sheet-frame:not([data-modal]) .lg-sheet')).getPropertyValue('--lg-sheet-radius')));
    for (const id of ['peek', 'half', 'full']) {
      await page.evaluate((d) => sheet.setDetent(d, { animate: false }), id);
      await page.waitForTimeout(150);
      expect(await radius()).toBeCloseTo(28, 1);
    }
  });

  test('is a stretched bottom sheet on narrow screens and a fixed panel on wide ones', async ({ page }) => {
    let b = await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet');
    expect(Math.round(b.width)).toBe(430 - 16);          // 8px inline margin each side
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(300);
    b = await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet');
    expect(Math.round(b.width)).toBe(420);
    expect(Math.round(b.x + b.width)).toBe(800 - 20);    // pinned to the end, 20px in
  });

  test('keeps its detent (as a fraction) when the viewport height changes', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('half', { animate: false }));
    await page.setViewportSize({ width: 430, height: 700 });
    await page.waitForTimeout(400);
    const s = await state(page);
    expect(s.detent).toBe('half');
    expect(s.height).toBe(Math.round(0.5 * (700 - 40)));
  });
});

test.describe('mouse drag', () => {
  test('dragging the grabber up snaps to the nearest detent', async ({ page }) => {
    const h = centerOf(await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__grabber'));
    await mouseDrag(page, h, -250);            // 192 + 250 = 442, nearest is half
    await settle(page);
    expect(await state(page)).toMatchObject({ detent: 'half', height: HALF });
  });

  test('a small drag snaps back', async ({ page }) => {
    const h = centerOf(await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__grabber'));
    await mouseDrag(page, h, -30);
    await settle(page);
    expect(await state(page)).toMatchObject({ detent: 'peek', height: PEEK });
  });

  test('dragging down from half goes back toward peek', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('half', { animate: false }));
    const h = centerOf(await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__grabber'));
    await mouseDrag(page, h, 260);
    await settle(page);
    expect((await state(page)).detent).toBe('peek');
  });

  test('a fast flick commits to another detent even if it did not travel far', async ({ page }) => {
    const h = centerOf(await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__grabber'));
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x, h.y - 20); await page.waitForTimeout(15);
    await page.mouse.move(h.x, h.y - 45); await page.waitForTimeout(15);
    await page.mouse.up();
    await settle(page);
    expect((await state(page)).detent).not.toBe('peek');
  });

  test('dragging a non-control part of the header resizes it', async ({ page }) => {
    const b = await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__header .sheet-title');
    await mouseDrag(page, centerOf(b), -250);
    await settle(page);
    expect((await state(page)).detent).toBe('half');
  });

  test('pressing a button in the header is a click, not a drag', async ({ page }) => {
    await page.locator('#header-btn').click();
    await expect(page.locator('#header-count')).toHaveText('1');
    expect((await state(page)).detent).toBe('peek');
  });

  test('dragging the content below the largest detent resizes the sheet', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('half', { animate: false }));
    const b = await box(page, '.item:first-child');
    await mouseDrag(page, { x: b.x + 200, y: b.y + 20 }, -260);
    await settle(page);
    expect((await state(page)).detent).toBe('full');
  });
});

test.describe('wheel and trackpad', () => {
  test('below the largest detent, the wheel resizes and then snaps', async ({ page }) => {
    const c = await sheetTop(page);
    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(60); }
    await page.waitForTimeout(300);
    await settle(page);
    const s = await state(page);
    expect(s.height).toBeGreaterThan(PEEK);
    expect([PEEK, HALF, FULL]).toContain(s.height);
  });

  test('a fast wheel burst commits to the next detent', async ({ page }) => {
    const c = await sheetTop(page);
    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 70); await page.waitForTimeout(6); }
    await settle(page);
    expect((await state(page)).detent).not.toBe('peek');
  });

  test('at the largest detent, the wheel scrolls the content natively', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    const c = centerOf(await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__content'));
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(300);
    const s = await state(page);
    expect(s.scrollTop).toBeGreaterThan(100);
    expect(s).toMatchObject({ detent: 'full', height: FULL });
  });

  test('scrolling up at the top of the content collapses the sheet', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    const c = centerOf(await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__content'));
    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -60); await page.waitForTimeout(70); }
    await page.waitForTimeout(350);
    await settle(page);
    expect((await state(page)).detent).not.toBe('full');
  });

  test('scrolling up hands over from the content to the sheet when it reaches the top', async ({ page }) => {
    await page.evaluate(() => { sheet.setDetent('full', { animate: false }); sheet.scrollTop = 150; });
    const c = centerOf(await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__content'));
    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -60); await page.waitForTimeout(70); }
    await page.waitForTimeout(350);
    await settle(page);
    const s = await state(page);
    expect(s.scrollTop).toBe(0);
    expect(s.detent).not.toBe('full');
  });

  test('a wheel burst does not scroll the page behind the sheet', async ({ page }) => {
    const before = await page.evaluate(() => window.scrollY);
    const c = await sheetTop(page);
    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 50); await page.waitForTimeout(40); }
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe('keyboard', () => {
  test('the grabber steps through the detents', async ({ page }) => {
    await page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__handle').focus();
    await page.keyboard.press('ArrowUp'); await settle(page);
    expect((await state(page)).detent).toBe('half');
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__handle')).toHaveAttribute('aria-valuetext', 'half');
    await expect(page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__handle')).toHaveAttribute('aria-valuenow', '1');
    await page.keyboard.press('End'); await settle(page);
    expect((await state(page)).detent).toBe('full');
    await page.keyboard.press('ArrowDown'); await settle(page);
    expect((await state(page)).detent).toBe('half');
    await page.keyboard.press('Home'); await settle(page);
    expect((await state(page)).detent).toBe('peek');
  });

  test('Enter cycles through the detents and wraps', async ({ page }) => {
    await page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__handle').focus();
    const seen = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Enter'); await settle(page); seen.push((await state(page)).detent); }
    expect(seen).toEqual(['half', 'full', 'peek', 'half']);
  });

  test('focus moving into the content expands the sheet', async ({ page }) => {
    await page.evaluate(() => document.getElementById('sheet-input').focus({ preventScroll: true }));
    await settle(page);
    expect((await state(page)).detent).toBe('full');
  });

  test('the content is scrollable by keyboard once the sheet is fully open', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    await page.evaluate(() => sheet.contentEl.focus?.());
    await page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__content').evaluate(n => { n.tabIndex = 0; n.focus(); });
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(400);
    expect((await state(page)).scrollTop).toBeGreaterThan(50);
  });
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  async function touchDrag(page, from, to, { steps = 10, pause = 30, hold = 160 } = {}) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= steps; i++) {
      const y = from.y + ((to.y - from.y) * i) / steps;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y }] });
      await page.waitForTimeout(pause);
    }
    await page.waitForTimeout(hold);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  test('dragging the content up from the peek resizes the sheet', async ({ page }) => {
    const b = await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet');
    const from = { x: b.x + b.width / 2, y: b.y + 80 };
    await touchDrag(page, from, { x: from.x, y: from.y - 250 });
    await settle(page);
    expect((await state(page)).detent).toBe('half');
  });

  test('at the largest detent, dragging up scrolls the content and the sheet stays', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    const b = await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__content');
    const from = { x: b.x + b.width / 2, y: b.y + b.height - 120 };
    await touchDrag(page, from, { x: from.x, y: from.y - 260 }, { steps: 14 });
    await page.waitForTimeout(500);
    const s = await state(page);
    expect(s.scrollTop).toBeGreaterThan(50);
    expect(s).toMatchObject({ detent: 'full', height: FULL });
  });

  test('at the largest detent with the content at its top, pulling down collapses the sheet', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    const b = await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__content');
    const from = { x: b.x + b.width / 2, y: b.y + 200 };
    await touchDrag(page, from, { x: from.x, y: from.y + 320 });
    await settle(page);
    const s = await state(page);
    expect(s.detent).not.toBe('full');
    expect(s.scrollTop).toBe(0);
  });

  test('pulling down while the content is scrolled scrolls it back instead of collapsing', async ({ page }) => {
    await page.evaluate(() => { sheet.setDetent('full', { animate: false }); sheet.scrollTop = 400; });
    const b = await box(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet__content');
    const from = { x: b.x + b.width / 2, y: b.y + 150 };
    await touchDrag(page, from, { x: from.x, y: from.y + 120 });
    await page.waitForTimeout(500);
    const s = await state(page);
    expect(s).toMatchObject({ detent: 'full', height: FULL });
    expect(s.scrollTop).toBeLessThan(400);
  });

  test('a tap on a header button is a click, not a drag', async ({ page }) => {
    await page.locator('#header-btn').tap();
    await expect(page.locator('#header-count')).toHaveText('1');
    expect((await state(page)).detent).toBe('peek');
  });
});

test.describe('text selection', () => {
  const selected = (page) => page.evaluate(() => getSelection().toString());

  test('dragging over the content below the largest detent resizes without selecting text', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('half', { animate: false }));
    await page.waitForTimeout(300);
    const b = await box(page, '.lg-sheet-frame:not([data-modal]) .item:first-child');
    await mouseDrag(page, { x: b.x + 60, y: b.y + 10 }, -120);
    await settle(page);
    expect(await selected(page)).toBe('');
  });

  test('a pull-down from the top of the content at the largest detent leaves no selection', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    await page.waitForTimeout(300);
    const b = await box(page, '.lg-sheet-frame:not([data-modal]) .item:first-child');
    await mouseDrag(page, { x: b.x + 60, y: b.y + 10 }, 150);
    await settle(page);
    expect(await selected(page)).toBe('');
  });

  test('at the largest detent the content text is selectable', async ({ page }) => {
    await page.evaluate(() => sheet.setDetent('full', { animate: false }));
    await page.waitForTimeout(300);
    const us = await page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__content').evaluate(e => getComputedStyle(e).userSelect);
    expect(us).toBe('text');
  });
});
