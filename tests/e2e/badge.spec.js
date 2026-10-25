import { test, expect } from '@playwright/test';

// Drives the test page's Badges section (window.badges) and its popover: where they sit, what they show,
// and that their glass is one shape that keeps its blur.
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.badges);
  await page.locator('#badges-row').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
});

// The tip of a shaped glass, from its outline (the clip path's point farthest toward its pointer's side).
const tipOf = (page, selector, side) => page.evaluate(({ selector, side }) => {
  const root = document.querySelector(selector);
  const glass = root.querySelector('.lg-shaped__glass');
  const d = root.querySelector('.lg-shaped__defs path').getAttribute('d');
  const nums = d.match(/-?[\d.]+/g).map(Number);
  // Every segment ends on a point: walk the commands and keep their last two numbers.
  const pts = d.split(/(?=[MLCAZ])/).filter((s) => !s.startsWith('Z')).map((s) => s.match(/-?[\d.]+/g).map(Number).slice(-2));
  const far = { top: (p) => -p[1], bottom: (p) => p[1], left: (p) => -p[0], right: (p) => p[0] }[side];
  const [x, y] = pts.reduce((a, b) => (far(b) > far(a) ? b : a));
  const r = glass.getBoundingClientRect();
  return nums.length ? { x: r.left + x, y: r.top + y } : null;
}, { selector, side });

test.describe('badge', () => {
  test('a count sits on the corner of a glass button, beside it rather than inside it', async ({ page }) => {
    const inbox = page.locator('#badge-inbox');
    const badge = page.locator('.lg-badge').first();
    await expect(badge).toHaveAttribute('data-show', '');
    await expect(badge).toHaveText('3');
    // The button is glass: inside it, the badge's blur would only see the button.
    expect(await badge.evaluate((b) => b.parentElement === document.getElementById('badge-inbox').parentElement)).toBe(true);
    const b = await inbox.boundingBox(), c = center(await badge.boundingBox());
    expect(Math.abs(c.x - (b.x + b.width))).toBeLessThan(1.5);
    expect(Math.abs(c.y - b.y)).toBeLessThan(1.5);
  });

  test('a number past max reads max+, and 0 hides it until it rises again', async ({ page }) => {
    const badge = page.locator('.lg-badge').first();
    const before = (await badge.boundingBox()).width;
    await page.evaluate(() => badges.count.set(150));
    await expect(badge).toHaveText('99+');
    await page.waitForTimeout(600);
    expect((await badge.boundingBox()).width).toBeGreaterThan(before + 8);
    await page.evaluate(() => badges.count.set(0));
    await expect(badge).not.toHaveAttribute('data-show', '');
    await page.evaluate(() => badges.count.set(4));
    await expect(badge).toHaveAttribute('data-show', '');
    await expect(badge).toHaveText('4');
  });

  test('outside an edge it stands off by the gap and points at the spot', async ({ page }) => {
    const box = await page.locator('#badge-box').boundingBox();
    await page.locator('.lg-badge', { hasText: 'East' }).evaluate((e) => { e.id = 'east-badge'; });
    const tip = await tipOf(page, '#east-badge', 'left');
    expect(Math.abs(tip.x - (box.x + box.width + 6))).toBeLessThan(1.5);
    expect(Math.abs(tip.y - (box.y + box.height / 2))).toBeLessThan(1.5);
  });

  test('moving it glides it there, and its pointer follows the spot', async ({ page }) => {
    const bar = await page.locator('#badge-bar').boundingBox();
    const now = page.locator('.lg-badge', { hasText: 'Now' });
    await now.evaluate((e) => { e.id = 'now-badge'; });
    await page.evaluate(() => badges.now.setPosition({ align: 0.8 }));
    // Mid-glide it is between where it was and where it's going.
    await page.waitForTimeout(60);
    const mid = center(await now.boundingBox());
    expect(mid.x).toBeLessThan(bar.x + bar.width * 0.8 - 4);
    await page.waitForTimeout(900);
    const tip = await tipOf(page, '#now-badge', 'bottom');
    expect(Math.abs(tip.x - (bar.x + bar.width * 0.8))).toBeLessThan(1.5);
    expect(Math.abs(tip.y - (bar.y - 6))).toBeLessThan(1.5);
  });

  test('its glass keeps the blur of the page inside a rounded card that clips its overflow', async ({ page }) => {
    const glass = page.locator('.lg-badge', { hasText: 'North' }).locator('.lg-shaped__glass');
    // Chromium blurs in pieces, each cut only by its own box: the glass on top blurs nothing.
    expect(await glass.evaluate((g) => getComputedStyle(g).backdropFilter)).toBe('none');
    const body = page.locator('.lg-badge', { hasText: 'North' }).locator('.lg-shaped__body');
    expect(await body.evaluate((b) => getComputedStyle(b).backdropFilter)).toContain('blur');
    // Nothing around the blur cuts it off from the page.
    expect(await body.evaluate((b) => {
      for (let n = b.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.filter !== 'none' || Number(cs.opacity) < 1 || cs.clipPath !== 'none' || cs.maskImage !== 'none' || cs.backdropFilter !== 'none') return n.className;
      }
      return null;
    })).toBeNull();
  });
});

test.describe('popover pointer', () => {
  test('is part of its outline and points at the anchor', async ({ page }) => {
    const trigger = page.locator('#popovers-row button');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.waitForTimeout(800);
    const pop = page.locator('.lg-popover[data-show]');
    await pop.evaluate((p) => { p.id ||= 'open-popover'; });
    const id = await pop.getAttribute('id');
    const tip = await tipOf(page, `#${id}`, 'top');
    const b = await trigger.boundingBox();
    expect(Math.abs(tip.x - (b.x + b.width / 2))).toBeLessThan(1.5);
    // 8px off the anchor to its body, the 7px pointer reaching across all but 1 of them.
    expect(Math.abs(tip.y - (b.y + b.height + 1))).toBeLessThan(1.5);
    expect(await pop.locator('.lg-popover__arrow').evaluate((a) => getComputedStyle(a).visibility)).toBe('hidden');
  });
});
