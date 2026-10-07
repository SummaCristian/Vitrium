import { test, expect } from '@playwright/test';

// The liquid-glass press inside something scrollable, driven with real touch input: like Liquid Glass on iOS, a
// finger that lands on glass still scrolls what the glass sits in, and the glass stays pressed (lit, and stretching
// toward the finger where it slides off) until the finger lifts.

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.controls);
  // A scroller with a glass pill near its top, laid over the page.
  await page.evaluate(() => {
    const scroller = document.createElement('div');
    scroller.id = 'glass-scroller';
    scroller.style.cssText = 'position:fixed;z-index:50;left:20px;top:100px;width:300px;height:320px;overflow:auto;background:#888';
    const content = document.createElement('div');
    content.style.cssText = 'height:1600px;padding:40px 20px';
    const btn = document.createElement('button');
    btn.id = 'glass-in-scroller';
    btn.className = 'lg-btn pill lg-glass liquid-glass';
    btn.textContent = 'Glass in a scroller';
    btn.style.cssText = 'width:200px;height:60px';
    window.glassClicks = 0;
    btn.addEventListener('click', () => { window.glassClicks++; });
    content.appendChild(btn);
    scroller.appendChild(content);
    document.body.appendChild(scroller);
  });
});

const center = async (page, sel) => {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// A touch that goes down at `from`, moves to `to` in steps (calling `during` at the last step, finger still down),
// and lifts.
async function touchDrag(page, from, to, { steps = 12, pause = 30, during } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  await page.waitForTimeout(60);
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(pause);
  }
  const seen = during ? await during() : null;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return seen;
}

const glassState = (page) => page.evaluate(() => {
  const btn = document.getElementById('glass-in-scroller');
  return {
    pressed: btn.classList.contains('lg-pressing') || btn.classList.contains('lg-dragging'),
    translate: btn.style.translate,
    scrollTop: document.getElementById('glass-scroller').scrollTop,
  };
});

test('a swipe that starts on glass scrolls its container, and the glass stays pressed until the finger lifts', async ({ page }) => {
  const from = await center(page, '#glass-in-scroller');
  const during = await touchDrag(page, from, { x: from.x, y: from.y - 200 }, { during: () => glassState(page) });

  expect(during.scrollTop).toBeGreaterThan(100);   // the container scrolled under the finger
  expect(during.pressed).toBe(true);                // and the glass is still pressed and lit
  // Carried along by the scroll, it barely stretches: the finger is still on it. (A little: the scroll trails the
  // finger by a frame or two. The same drag on glass that claims the touch pulls it about 29px.)
  const [tx = 0, ty = 0] = (during.translate || '0px 0px').split(' ').map(parseFloat);
  expect(Math.hypot(tx, ty)).toBeLessThan(18);

  await page.waitForTimeout(100);
  const after = await glassState(page);
  expect(after.pressed).toBe(false);
  expect(after.translate).toBe('');
  expect(await page.evaluate(() => window.glassClicks)).toBe(0);   // a scroll is not a click
});

test('a drag along an axis nothing can scroll stretches the glass toward the finger', async ({ page }) => {
  const from = await center(page, '#glass-in-scroller');
  const during = await touchDrag(page, from, { x: from.x + 90, y: from.y }, { during: () => glassState(page) });

  expect(during.scrollTop).toBe(0);
  expect(during.pressed).toBe(true);
  const [tx] = during.translate.split(' ').map(parseFloat);
  expect(tx).toBeGreaterThan(10);   // pulled toward the finger, to the right

  await page.waitForTimeout(100);
  expect((await glassState(page)).pressed).toBe(false);
});

test('a tap on glass in a scroller is still a click', async ({ page }) => {
  const { x, y } = await center(page, '#glass-in-scroller');
  await page.touchscreen.tap(x, y);
  await expect.poll(() => page.evaluate(() => window.glassClicks)).toBe(1);
  expect((await glassState(page)).pressed).toBe(false);
});

test('glass on a layer above the content claims its touches; glass in the content lets them scroll it', async ({ page }) => {
  const touchAction = (sel) => page.locator(sel).first().evaluate((node) => getComputedStyle(node).touchAction);
  // The tab bar's round buttons, and a popover, float above the page.
  expect(await page.locator('.lg-tabbar__prominent, .lg-tabbar__action').count()).toBeGreaterThan(0);
  expect(await touchAction('.lg-tabbar__prominent, .lg-tabbar__action')).toBe('none');
  expect(await touchAction('.lg-popover.liquid-glass')).toBe('none');
  // Opting in by hand.
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'claimed';
    b.className = 'lg-btn pill lg-glass liquid-glass lg-claim-touch';
    document.body.appendChild(b);
  });
  expect(await touchAction('#claimed')).toBe('none');
  // Content glass pans.
  expect(await touchAction('#glass-in-scroller')).toBe('manipulation');
  expect(await touchAction('#panel-home .lg-btn.liquid-glass')).toBe('manipulation');
});

test('a swipe on glass that claims its touches stretches it and never scrolls what is behind', async ({ page }) => {
  await page.evaluate(() => document.getElementById('glass-in-scroller').classList.add('lg-claim-touch'));
  const from = await center(page, '#glass-in-scroller');
  const during = await touchDrag(page, from, { x: from.x, y: from.y - 200 }, { during: () => glassState(page) });
  expect(during.scrollTop).toBe(0);
  expect(during.pressed).toBe(true);
  const [, ty] = during.translate.split(' ').map(parseFloat);
  expect(ty).toBeLessThan(-10);   // pulled up, toward the finger
});
