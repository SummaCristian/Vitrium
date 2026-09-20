import { test, expect } from '@playwright/test';

// Drives the test page's Controls section with real pointer and keyboard input.
const centerOf = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const out = (page, id) => page.locator(`#${id}`);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.controls);
  await page.waitForTimeout(300);
});

test.describe('slider', () => {
  test('dragging the thumb sets the value and lifts it while held', async ({ page }) => {
    const slider = page.locator('#controls-section .lg-slider').first();
    await slider.scrollIntoViewIfNeeded();
    const thumb = slider.locator('.lg-slider__thumb');
    const t = centerOf(await thumb.boundingBox());
    const track = await slider.boundingBox();

    const lens = thumb.locator('.lg-pill');

    await page.mouse.move(t.x, t.y);
    await page.mouse.down();
    await expect(lens).toHaveClass(/lg-pill--lifted/);   // the lens lifts into glass, as in the pickers
    await page.mouse.move(track.x + track.width - 2, t.y, { steps: 8 });
    await page.mouse.up();

    await expect(lens).not.toHaveClass(/lg-pill--lifted/);
    expect(await page.evaluate(() => controls.slider.value)).toBe(100);
    await expect(thumb).toHaveAttribute('aria-valuenow', '100');
    await expect(out(page, 'slider-out')).toHaveText('100');
  });

  test('no outline appears after a pointer interaction; the lens shows keyboard focus instead', async ({ page }) => {
    const slider = page.locator('#controls-section .lg-slider').first();
    await slider.scrollIntoViewIfNeeded();
    const thumb = slider.locator('.lg-slider__thumb');
    const b = await slider.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(600);
    expect(await thumb.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('none');
    await expect(thumb.locator('.lg-pill')).not.toHaveClass(/lg-pill--lifted/);

    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Tab');
    await thumb.focus();
    await page.keyboard.press('ArrowRight');
    expect(await thumb.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('none');
    await expect(thumb.locator('.lg-pill')).toHaveClass(/lg-pill--lifted/);
  });

  test('a tap on the track jumps there', async ({ page }) => {
    const slider = page.locator('#controls-section .lg-slider').first();
    await slider.scrollIntoViewIfNeeded();
    const b = await slider.boundingBox();
    await page.mouse.click(b.x + 2, b.y + b.height / 2);
    expect(await page.evaluate(() => controls.slider.value)).toBe(0);
  });

  test('arrow keys, PageUp and Home / End move it', async ({ page }) => {
    const thumb = page.locator('#controls-section .lg-slider').first().locator('.lg-slider__thumb');
    await thumb.focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => controls.slider.value)).toBe(41);
    await page.keyboard.press('PageUp');
    expect(await page.evaluate(() => controls.slider.value)).toBe(51);
    await page.keyboard.press('End');
    expect(await page.evaluate(() => controls.slider.value)).toBe(100);
    await page.keyboard.press('Home');
    expect(await page.evaluate(() => controls.slider.value)).toBe(0);
  });

  test('a range keeps its thumbs apart by minGap', async ({ page }) => {
    const range = page.locator('#controls-section .lg-slider--range');
    await range.scrollIntoViewIfNeeded();
    const [low, high] = await range.locator('.lg-slider__thumb').all();
    await expect(low).toHaveAttribute('aria-label', 'Price, Minimum price');
    await high.focus();
    await page.keyboard.press('Home');   // can't go below low + minGap
    expect(await page.evaluate(() => controls.range.value)).toEqual([20, 30]);
    await low.focus();
    await page.keyboard.press('End');    // can't pass high - minGap
    expect(await page.evaluate(() => controls.range.value)).toEqual([20, 30]);
    await expect(out(page, 'range-out')).toHaveText('20 – 30');
  });

  test('set() is silent by default', async ({ page }) => {
    await page.evaluate(() => controls.slider.set(75));
    await expect(out(page, 'slider-out')).toHaveText('40');
    await expect(page.locator('#controls-section .lg-slider__thumb').first()).toHaveAttribute('aria-valuenow', '75');
  });
});

test.describe('stepper', () => {
  test('buttons step the value and stop at the bounds', async ({ page }) => {
    const stepper = page.locator('#controls-section .lg-stepper');
    await stepper.scrollIntoViewIfNeeded();
    await stepper.getByRole('button', { name: 'Increase' }).click();
    await expect(out(page, 'stepper-out')).toHaveText('3');
    await stepper.getByRole('button', { name: 'Decrease' }).click();
    await stepper.getByRole('button', { name: 'Decrease' }).click();
    await stepper.getByRole('button', { name: 'Decrease' }).click();
    await expect(out(page, 'stepper-out')).toHaveText('0');
    await expect(stepper.getByRole('button', { name: 'Decrease' })).toHaveAttribute('aria-disabled', 'true');
    await stepper.getByRole('button', { name: 'Decrease' }).click({ force: true });
    expect(await page.evaluate(() => controls.stepper.value)).toBe(0);
  });

  test('pressing it deforms the whole capsule, like the other glass controls', async ({ page }) => {
    const stepper = page.locator('#controls-section .lg-stepper');
    await stepper.scrollIntoViewIfNeeded();
    const c = centerOf(await stepper.getByRole('button', { name: 'Increase' }).boundingBox());
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await expect(stepper).toHaveClass(/lg-pressing/);
    await page.mouse.up();
    await expect(stepper).not.toHaveClass(/lg-pressing/);
    expect(await page.evaluate(() => controls.stepper.value)).toBe(3);   // the press still counted once
  });

  test('holding repeats; a keyboard press steps once', async ({ page }) => {
    const stepper = page.locator('#controls-section .lg-stepper');
    await stepper.scrollIntoViewIfNeeded();
    const inc = stepper.getByRole('button', { name: 'Increase' });
    const c = centerOf(await inc.boundingBox());
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    // 1 immediate + repeats after the hold delay; capped at the max.
    expect(await page.evaluate(() => controls.stepper.value)).toBeGreaterThan(5);

    await page.evaluate(() => controls.stepper.set(2));
    await inc.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => controls.stepper.value)).toBe(3);
  });
});

test.describe('text field', () => {
  test('the clear button appears with text, empties it and keeps focus', async ({ page }) => {
    const field = page.locator('#controls-section .lg-field--search');
    await field.scrollIntoViewIfNeeded();
    const input = field.locator('input');
    await input.fill('pizza');
    await expect(field).toHaveClass(/has-value/);
    await field.locator('.lg-field__clear').click();
    await expect(input).toHaveValue('');
    await expect(field).not.toHaveClass(/has-value/);
    expect(await page.evaluate(() => document.activeElement === controls.search.input)).toBe(true);
  });

  test('Enter submits, and Escape clears a search field', async ({ page }) => {
    const field = page.locator('#controls-section .lg-field--search');
    await field.scrollIntoViewIfNeeded();
    await field.locator('input').fill('tacos');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => controls.submitted)).toEqual(['tacos']);
    await page.keyboard.press('Escape');
    await expect(field.locator('input')).toHaveValue('');
  });

  test('pressing the capsule surface gives the glass press; typing in the input does not', async ({ page }) => {
    const field = page.locator('#controls-section .lg-field--search');
    await field.scrollIntoViewIfNeeded();
    const b = await field.boundingBox();
    await page.mouse.move(b.x + 3, b.y + b.height / 2);
    await page.mouse.down();
    await expect(field).toHaveClass(/lg-pressing/);
    await page.mouse.up();
    const input = await field.locator('input').boundingBox();
    await page.mouse.move(input.x + 10, input.y + input.height / 2);
    await page.mouse.down();
    await expect(field).not.toHaveClass(/lg-pressing/);
    await page.mouse.up();
  });

  test('clicking the capsule padding focuses the input; multiline is a textarea', async ({ page }) => {
    const field = page.locator('#controls-section .lg-field--search');
    await field.scrollIntoViewIfNeeded();
    const b = await field.boundingBox();
    await page.mouse.click(b.x + 3, b.y + b.height / 2);
    expect(await page.evaluate(() => document.activeElement === controls.search.input)).toBe(true);
    expect(await page.locator('#controls-section .lg-field--multiline textarea').count()).toBe(1);
  });
});

test.describe('alert', () => {
  test('presents modally, focuses the default/cancel action, and resolves on Escape', async ({ page }) => {
    await page.locator('#open-alert').scrollIntoViewIfNeeded();
    await page.locator('#open-alert').click();
    const alert = page.getByRole('alertdialog');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAccessibleName('Delete this list?');
    expect(await page.locator('#panel-home').evaluate(e => e.inert)).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Cancel');   // never the destructive one

    await page.keyboard.press('Escape');
    await expect(alert).toBeHidden();
    await expect(out(page, 'alert-out')).toHaveText('cancel');
    expect(await page.locator('#panel-home').evaluate(e => e.inert)).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('open-alert');
  });

  test('morphs out of the button that summoned it, and back into it', async ({ page }) => {
    const opener = page.locator('#open-alert');
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const box = page.getByRole('alertdialog');
    await expect(box).toHaveClass(/lg-alert--morph/);
    await expect(opener).toHaveCSS('visibility', 'hidden');   // the alert stands in for it
    await page.waitForTimeout(700);
    await expect(box).toBeVisible();
    // Landed: centred on the screen, transform released.
    const r = await box.boundingBox();
    expect(Math.abs(r.x + r.width / 2 - 215)).toBeLessThan(2);
    expect(await box.evaluate(e => e.style.transform)).toBe('');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    await expect(box).toBeHidden();
    await expect(opener).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.lg-alert').first()).not.toHaveClass(/lg-alert--morph/);   // its morph styles are gone
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('open-alert');
  });

  test('a pop transition is the default; the alert also takes the glass press', async ({ page }) => {
    await page.evaluate(() => {
      window.__pop = controls.createAlert({ title: 'Heads up', message: 'Saved.' });
      window.__pop.present();
    });
    const box = page.getByRole('alertdialog', { name: 'Heads up' });
    await expect(box).toBeVisible();
    await expect(box).not.toHaveClass(/lg-alert--morph/);
    await page.waitForTimeout(400);
    const b = await box.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + 8);   // the padding: not a corner, which is outside the rounded shape
    await page.mouse.down();
    await expect(box).toHaveClass(/lg-pressing/);
    await page.mouse.up();
    await page.evaluate(() => window.__pop.dismiss());
  });

  test('traps Tab inside, and resolves with the chosen action', async ({ page }) => {
    await page.locator('#open-alert').scrollIntoViewIfNeeded();
    await page.locator('#open-alert').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('.lg-alert'))).toBe(true);
    }
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(out(page, 'alert-out')).toHaveText('delete');
    await expect(page.getByRole('alertdialog')).toBeHidden();
  });

  test('a click on the scrim cancels when there is a cancel action', async ({ page }) => {
    await page.locator('#open-alert').scrollIntoViewIfNeeded();
    await page.locator('#open-alert').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(out(page, 'alert-out')).toHaveText('cancel');
  });

  test('without a cancel action Escape and the scrim do nothing; dismiss() resolves null', async ({ page }) => {
    await page.evaluate(() => {
      window.__lone = controls.createAlert({ title: 'Saved', actions: [{ id: 'ok', label: 'OK', role: 'default' }] });
      window.__loneResult = undefined;
      window.__lone.present().then((r) => { window.__loneResult = r; });
    });
    await expect(page.getByRole('alertdialog', { name: 'Saved' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.click(4, 4);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__lone.isOpen)).toBe(true);
    await page.evaluate(() => window.__lone.dismiss());
    await expect(page.getByRole('alertdialog', { name: 'Saved' })).toBeHidden();
    expect(await page.evaluate(() => window.__loneResult)).toBeNull();
  });
});

test.describe('menu', () => {
  test('opens from the trigger, takes focus, navigates with the keyboard and selects', async ({ page }) => {
    const trigger = page.locator('#open-menu');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toHaveClass(/lg-morph-anim/);   // the trigger has morphed into the panel
    await expect(menu).toHaveClass(/lg-morph/);
    await page.waitForTimeout(700);

    // Keyboard open: first enabled item is active. Size (disabled) is skipped.
    await expect(page.getByRole('menuitemcheckbox', { name: 'Name' })).toHaveClass(/is-active/);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitemcheckbox', { name: 'Date' })).toHaveClass(/is-active/);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Reset' })).toHaveClass(/is-active/);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');

    await expect(menu).toBeHidden();
    await expect(out(page, 'menu-out')).toHaveText('date');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('open-menu');

    // The selection is reflected the next time it opens.
    await trigger.click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Date' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitemcheckbox', { name: 'Size' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('a mouse click picks an item; Escape closes and returns focus', async ({ page }) => {
    const trigger = page.locator('#open-menu');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Reset' }).click();
    await expect(out(page, 'menu-out')).toHaveText('reset');

    await trigger.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('open-menu');
  });

  test('a disabled item cannot be chosen; typing jumps to a label', async ({ page }) => {
    const trigger = page.locator('#open-menu');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.getByRole('menuitemcheckbox', { name: 'Size' }).click({ force: true });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.type('re');
    await expect(page.getByRole('menuitem', { name: 'Reset' })).toHaveClass(/is-active/);
  });
});

test.describe('progress', () => {
  test('determinate bars expose their value; indeterminate ones expose none', async ({ page }) => {
    const bar = page.getByRole('progressbar', { name: 'Upload' });
    await expect(bar).toHaveAttribute('aria-valuenow', '0.4');
    await expect(bar).toHaveAttribute('aria-valuetext', '40%');
    await page.evaluate(() => controls.bar.set(0.9));
    await expect(bar).toHaveAttribute('aria-valuetext', '90%');
    expect(await bar.locator('.lg-progress__fill').evaluate(e => Math.round(e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width * 100))).toBeGreaterThan(30);

    const spinner = page.getByRole('progressbar', { name: 'Loading' });
    await expect(spinner).not.toHaveAttribute('aria-valuenow', /.*/);
    await expect(spinner).toHaveClass(/is-indeterminate/);
    await page.evaluate(() => controls.spinner.set(0.5));
    await expect(spinner).not.toHaveClass(/is-indeterminate/);
    await expect(spinner).toHaveAttribute('aria-valuenow', '0.5');
  });
});
