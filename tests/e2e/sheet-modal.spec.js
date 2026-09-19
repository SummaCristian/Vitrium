import { test, expect } from '@playwright/test';

const MODAL = '.lg-sheet-frame[data-modal]';
const rectOf = (page, sel) => page.locator(sel).evaluate(e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; });
// Drives one of the demo's list pickers (the library's own) like a user.
async function choose(page, pickerSel, optionName) {
  await page.locator(`${pickerSel} .lg-chip`).click();
  await page.getByRole('option', { name: optionName }).click();
  await page.waitForTimeout(500);
}
const settle = (page) => page.waitForTimeout(700);
const presented = (page) => page.evaluate(() => modalSheet.presented);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.modalSheet);
  await page.waitForTimeout(300);
});

test.describe('modal presentation', () => {
  test('starts dismissed, and present() shows it over an inert page', async ({ page }) => {
    expect(await presented(page)).toBe(false);
    await expect(page.locator(`${MODAL} .lg-sheet`)).toBeHidden();
    await page.locator('#open-modal').scrollIntoViewIfNeeded();
    await page.locator('#open-modal').click();
    await settle(page);
    await expect(page.locator(`${MODAL} .lg-sheet`)).toBeVisible();
    expect(await page.locator('#panel-home').evaluate(e => e.inert)).toBe(true);
    expect(await page.locator('#tabbar').evaluate(e => e.inert)).toBe(true);
    await expect(page.locator(`${MODAL} .lg-sheet`)).toHaveAttribute('aria-modal', 'true');
    // focus moved into the sheet
    expect(await page.evaluate(() => modalSheet.el.contains(document.activeElement))).toBe(true);
  });

  test('Escape dismisses, un-inerts the page and returns focus to the opener', async ({ page }) => {
    await page.locator('#open-modal').focus();
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    await page.keyboard.press('Escape');
    await settle(page);
    expect(await presented(page)).toBe(false);
    expect(await page.locator('#panel-home').evaluate(e => e.inert)).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('open-modal');
    await expect(page.locator(`${MODAL} .lg-sheet`)).toBeHidden();
    await expect(page.locator('#modal-state')).toHaveText('dismissed (escape)');
  });

  test('clicking the scrim dismisses', async ({ page }) => {
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    await page.mouse.click(215, 20);
    await settle(page);
    expect(await presented(page)).toBe(false);
    await expect(page.locator('#modal-state')).toHaveText('dismissed (scrim)');
  });

  test('pulling it down past the smallest detent dismisses; a short pull springs back', async ({ page }) => {
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    const h = await page.locator(`${MODAL} .lg-sheet__handle`).boundingBox();
    const x = h.x + h.width / 2, y = h.y + h.height / 2;
    const drag = async (dy) => {
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(x, y + (dy * i) / 8); await page.waitForTimeout(30); }
      await page.waitForTimeout(160); await page.mouse.up(); await settle(page);
    };
    await drag(30);
    expect(await presented(page)).toBe(true);
    expect(await page.evaluate(() => Math.round(modalSheet.height))).toBe(260);
    await drag(220);
    expect(await presented(page)).toBe(false);
    await expect(page.locator('#modal-state')).toHaveText('dismissed (swipe)');
  });

  test('a function dismissible can veto; dismiss() still works', async ({ page }) => {
    await page.locator('#dismissible').click();
    await page.waitForTimeout(500);   // the toggle reports once its pill has settled
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    await page.keyboard.press('Escape');
    await page.mouse.click(215, 20);
    await settle(page);
    expect(await presented(page)).toBe(true);
    await page.evaluate(() => modalSheet.dismiss());
    await settle(page);
    expect(await presented(page)).toBe(false);
  });

  test('Tab stays inside the sheet', async ({ page }) => {
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => modalSheet.el.contains(document.activeElement))).toBe(true);
    }
  });

  test('backgroundInteraction upTo: the page is usable at the smaller detent and blocked above it', async ({ page }) => {
    await choose(page, '#bg-picker', /up to peek/);
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    expect(await page.locator('#panel-home').evaluate(e => e.inert)).toBe(false);
    await page.evaluate(() => modalSheet.setDetent('full'));
    await settle(page);
    expect(await page.locator('#panel-home').evaluate(e => e.inert)).toBe(true);
    await page.evaluate(() => modalSheet.setDetent('peek'));
    await settle(page);
    expect(await page.locator('#panel-home').evaluate(e => e.inert)).toBe(false);
  });

  test('present() resets to the initial detent', async ({ page }) => {
    await page.evaluate(() => { modalSheet.present(); });
    await settle(page);
    await page.evaluate(() => modalSheet.setDetent('full'));
    await settle(page);
    await page.evaluate(() => modalSheet.dismiss());
    await settle(page);
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    expect(await page.evaluate(() => modalSheet.detent)).toBe('peek');
  });
});

test.describe('preferred side', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/?tab=explore');
    await page.waitForFunction(() => window.sheet);
    await page.waitForTimeout(400);
  });

  test('start, center and end place the desktop panel', async ({ page }) => {
    const sel = '.lg-sheet-frame:not([data-modal]) .lg-sheet';
    await page.evaluate(() => sheet.setSide('start', { animate: false }));
    let r = await rectOf(page, sel);
    expect(Math.round(r.left)).toBe(20);
    await page.evaluate(() => sheet.setSide('end', { animate: false }));
    r = await rectOf(page, sel);
    expect(Math.round(r.right)).toBe(1180);
    await page.evaluate(() => sheet.setSide('center', { animate: false }));
    r = await rectOf(page, sel);
    expect(Math.round((r.left + r.right) / 2)).toBe(600);
  });

  test('each sheet keeps its own side', async ({ page }) => {
    await choose(page, '#side-picker', /Start/);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => [sheet.side, modalSheet.side])).toEqual(['start', 'center']);
    await page.evaluate(() => modalSheet.setSide('end'));
    expect(await page.evaluate(() => [sheet.side, modalSheet.side])).toEqual(['start', 'end']);
  });

  test('changing side glides instead of jumping', async ({ page }) => {
    await page.evaluate(() => sheet.setSide('start'));
    await page.waitForTimeout(80);
    const mid = await page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__glass').evaluate(e => parseFloat(e.style.translate) || 0);
    expect(Math.abs(mid)).toBeGreaterThan(20);
    await page.waitForTimeout(900);
    const end = await page.locator('.lg-sheet-frame:not([data-modal]) .lg-sheet__glass').evaluate(e => e.style.translate);
    expect(end).toBe('');
  });

  test('side has no effect on a phone layout', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.evaluate(() => sheet.setSide('start', { animate: false }));
    await page.waitForTimeout(300);
    const r = await rectOf(page, '.lg-sheet-frame:not([data-modal]) .lg-sheet');
    expect(Math.round(r.left)).toBe(8);
    expect(Math.round(r.right)).toBe(422);
  });
});

test.describe('transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.modalSheet);
    await page.waitForTimeout(300);
  });
  const glass = `${MODAL} .lg-sheet__glass`;

  test('a pop scales and fades in without translating toward the bottom', async ({ page }) => {
    await page.evaluate(() => { modalSheet.setTransition('pop'); modalSheet.present(); });
    await page.waitForTimeout(60);
    const mid = await page.locator(glass).evaluate(e => ({ scale: e.style.scale, translate: e.style.translate, opacity: e.style.opacity }));
    expect(parseFloat(mid.scale)).toBeLessThan(1);
    expect(mid.translate).toBe('');
    await settle(page);
    const end = await page.locator(glass).evaluate(e => ({ scale: e.style.scale, opacity: e.style.opacity }));
    expect(end).toEqual({ scale: '', opacity: '' });
  });

  test('a morph starts on the trigger button and lands on the sheet', async ({ page }) => {
    await page.locator('#open-modal').scrollIntoViewIfNeeded();
    const btn = await page.locator('#open-modal').boundingBox();
    await page.locator('#open-modal').click();
    await page.waitForTimeout(30);
    const r = await page.locator(glass).boundingBox();
    // Early on the glass is still about the button's size and near it, not the sheet's.
    expect(r.width).toBeLessThan(btn.width * 2.5);
    expect(await page.locator('#open-modal').evaluate(e => e.style.visibility)).toBe('hidden');
    await settle(page);
    const full = await page.locator(glass).boundingBox();
    expect(full.width).toBeGreaterThan(300);
    // and it goes back into the button, which comes back and gets focus.
    await page.keyboard.press('Escape');
    await settle(page);
    expect(await page.locator('#open-modal').evaluate(e => e.style.visibility)).toBe('');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('open-modal');
  });
});

test.describe('layout', () => {
  test('the first row starts below the header, even after a pop-in scaled the header during measuring', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.modalSheet);
    await page.evaluate(() => { modalSheet.setTransition('pop'); modalSheet.present(); });
    await settle(page);
    const { header, row } = await page.evaluate(() => ({
      header: modalSheet.headerEl.getBoundingClientRect().bottom,
      row: document.querySelector('.filter-row').getBoundingClientRect().top,
    }));
    expect(row).toBeGreaterThanOrEqual(header - 0.5);
  });
});

test.describe('dragging over rows', () => {
  test('a drag that starts on a label row resizes the sheet, selects nothing and does not toggle it', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.modalSheet);
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    const r = await page.locator('.filter-row').first().boundingBox();
    const x = r.x + 60, y = r.y + 10;
    await page.mouse.move(x, y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x, y - 45 * i); await page.waitForTimeout(30); }
    await page.waitForTimeout(150); await page.mouse.up(); await settle(page);
    expect(await page.evaluate(() => modalSheet.detent)).toBe('full');
    expect(await page.evaluate(() => getSelection().toString())).toBe('');
    expect(await page.locator('#filter-0').isChecked()).toBe(false);
  });

  test('a plain click on a label row still toggles it', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.modalSheet);
    await page.evaluate(() => modalSheet.present());
    await settle(page);
    await page.locator('.filter-row').first().click();
    expect(await page.locator('#filter-0').isChecked()).toBe(true);
  });
});
