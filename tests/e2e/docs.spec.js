import { test, expect } from '@playwright/test';

// Drives the documentation site, whose pages are also the best fixtures for the components: each one has a live
// playground. These cover behavior that was fixed or added, so it cannot quietly come back.
test.use({ baseURL: 'http://localhost:5174', viewport: { width: 1300, height: 1000 } });

// An option in a playground, by its label and value. (Only click a value that is not already selected.)
const option = (page, label, value) => page.locator('.playground .control-row', { hasText: label })
  .locator(`.lg-seg__item[data-value="${value}"]`).first();

const open = async (page, path, ready) => {
  await page.goto(`/#/${path}`);
  await page.waitForSelector(ready);
  await page.waitForTimeout(500);
};

test.describe('blur benchmark', () => {
  test('keeps its own blur while the page has blur switched off', async ({ page }) => {
    await open(page, 'foundation/blur', '.bench');
    // The page's off rule is !important. Without an !important probe, the run would measure no blur at all.
    await page.evaluate(() => { document.documentElement.dataset.blur = 'off'; });
    const measured = page.evaluate(() => new Promise((resolve) => {
      const seen = new MutationObserver(() => {
        const probe = [...document.body.children].find((n) => n.style && /blur\(18px\)/.test(n.style.cssText));
        if (probe) { seen.disconnect(); resolve(getComputedStyle(probe).backdropFilter); }
      });
      seen.observe(document.body, { childList: true });
    }));
    await page.getByRole('button', { name: 'Run benchmark' }).click();
    expect(await measured).toContain('blur');
  });
});

test.describe('segmented control', () => {
  test('changing an item moves the pill with the track, without wrapping the label or leaving anything behind', async ({ page }) => {
    await open(page, 'components/segmented-control', '.playground .lg-seg__track');
    await option(page, 'Content', 'icons').click();
    await page.waitForTimeout(1200);

    const stage = page.locator('.playground .stage');
    // Icon-only segments still have a name.
    await expect(stage.locator('.lg-seg__item[data-value="list"]')).toHaveAttribute('aria-label', 'List');
    // The old labels are gone once they have faded out.
    await expect(stage.locator('.lg-seg__item > span')).toHaveCount(0);
    // The pill sits on the selected segment (they were measured together, not the pill after the fact).
    const pill = await stage.locator('.lg-seg > .lg-pill').boundingBox();
    const active = await stage.locator('.lg-seg__item.active').boundingBox();
    expect(Math.abs(pill.width - active.width)).toBeLessThan(3);
    expect(Math.abs((pill.x + pill.width / 2) - (active.x + active.width / 2))).toBeLessThan(3);
  });

  test('a longer label does not wrap while the control springs to its new size', async ({ page }) => {
    await open(page, 'components/segmented-control', '#changing-items');
    const card = page.locator('#changing-items .card').first();
    await card.scrollIntoViewIfNeeded();
    const heights = await page.evaluate(async () => {
      const button = [...document.querySelectorAll('#changing-items button')].find((b) => b.textContent.includes('Longer label'));
      const cell = document.querySelector('#changing-items .lg-seg__item[data-value="b"]');
      const seen = [];
      const end = performance.now() + 700;
      button.click();
      await new Promise((done) => {
        const tick = () => { seen.push(cell.offsetHeight); if (performance.now() < end) requestAnimationFrame(tick); else done(); };
        requestAnimationFrame(tick);
      });
      return seen;
    });
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  });
});

test.describe('popover', () => {
  test('a held-open popover stays open when its anchor is pressed, and stays inside its boundary', async ({ page }) => {
    await open(page, 'components/popover', '.popover-arena');
    const arena = page.locator('.popover-arena');
    await arena.scrollIntoViewIfNeeded();
    await expect(page.locator('.lg-popover[data-show]')).toHaveCount(1);

    // Drag the anchor to a corner. Pressing it must not dismiss the popover (dismissible: false).
    const anchor = await page.locator('.popover-anchor').boundingBox();
    await page.mouse.move(anchor.x + 28, anchor.y + 28);
    await page.mouse.down();
    await page.mouse.move(anchor.x - 500, anchor.y - 200, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const popover = page.locator('.lg-popover[data-show]');
    await expect(popover).toHaveCount(1);
    const box = await popover.boundingBox();
    const bounds = await arena.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(bounds.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
  });

  test('changing the side moves the popover to that side of the anchor', async ({ page }) => {
    await open(page, 'components/popover', '.popover-arena');
    await page.locator('.popover-arena').scrollIntoViewIfNeeded();
    await option(page, 'Side', 'right').click();
    await page.waitForTimeout(900);
    const anchor = await page.locator('.popover-anchor').boundingBox();
    const box = await page.locator('.lg-popover[data-show]').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(anchor.x + anchor.width - 1);
  });
});

test.describe('alert', () => {
  test('pops in with a transition instead of appearing at once, and answers through its promise', async ({ page }) => {
    await open(page, 'components/alert', '.playground');
    const playground = page.locator('.playground').first();
    await playground.scrollIntoViewIfNeeded();
    // Created and presented in the same tick, which is how it is usually used: the pop-in must still have a closed state to start from.
    const opacities = await page.evaluate(async () => {
      const shown = [...document.querySelectorAll('.playground button')].find((b) => b.textContent === 'Show alert');
      const seen = [];
      const end = performance.now() + 400;
      shown.click();
      await new Promise((done) => {
        const tick = () => {
          const box = document.querySelector('.lg-alert');
          if (box) seen.push(+getComputedStyle(box).opacity);
          if (performance.now() < end) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
      return seen;
    });
    expect(opacities[0]).toBeLessThan(0.5);
    expect(opacities.at(-1)).toBe(1);

    // A destructive alert starts on Cancel, never on the destructive action, and Escape picks Cancel.
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Cancel');
    await page.keyboard.press('Escape');
    await expect(playground.locator('.readout')).toHaveText('present() resolved with "cancel"');
  });

  test('a modal layer makes the page inert and traps Tab, then puts everything back', async ({ page }) => {
    await open(page, 'components/alert', '#modal-behavior');
    await page.locator('#modal-behavior').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Open a custom layer' }).click();
    expect(await page.evaluate(() => document.getElementById('shell').inert)).toBe(true);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.demo-layer'))).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.getElementById('shell').inert)).toBe(false);
  });
});

test.describe('progress', () => {
  test('a ring draws the fraction it was given, from plain dash numbers', async ({ page }) => {
    await open(page, 'components/progress', '.progress-rings');
    const dashes = await page.locator('.progress-rings .lg-progress__arc').evaluateAll((arcs) => arcs.map((a) => ({
      total: parseFloat(a.style.strokeDasharray), offset: parseFloat(a.style.strokeDashoffset), style: a.getAttribute('style'),
    })));
    const [quarter, threeQuarters, spinning] = dashes;
    // The offset is what is left undrawn, so a quarter leaves three quarters of the ring.
    expect(quarter.offset / quarter.total).toBeCloseTo(0.75, 2);
    expect(threeQuarters.offset / threeQuarters.total).toBeCloseTo(0.25, 2);
    // An indeterminate ring is drawn by CSS alone.
    expect(spinning.style).toBeFalsy();
  });

  test('a value of zero draws nothing, and full draws the whole ring', async ({ page }) => {
    await open(page, 'components/progress', '.playground');
    await option(page, 'Variant', 'circular').click();
    await page.waitForTimeout(900);
    const arc = page.locator('.playground .lg-progress__arc');
    await option(page, 'Value', '0').click();
    await page.waitForTimeout(600);
    await expect(arc).toHaveCSS('opacity', '0');
    await option(page, 'Value', '100').click();
    await page.waitForTimeout(600);
    expect(parseFloat(await arc.evaluate((a) => a.style.strokeDashoffset))).toBeCloseTo(0, 1);
  });

  test('going indeterminate drops the value from the progressbar', async ({ page }) => {
    await open(page, 'components/progress', '.playground');
    const bar = page.locator('.playground .lg-progress');
    await expect(bar).toHaveAttribute('aria-valuenow', '0.5');
    await option(page, 'Mode', 'indeterminate').click();
    await page.waitForTimeout(400);
    await expect(bar).not.toHaveAttribute('aria-valuenow', /.*/);
    await expect(bar).toHaveClass(/is-indeterminate/);
  });
});

test.describe('previews', () => {
  test('a desktop preview lays out at desktop width even in a narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 1000 });
    await open(page, 'components/tab-bar', '.preview-frame');
    await page.waitForTimeout(1500);
    const measured = await page.evaluate(() => {
      const frame = document.querySelector('.preview-frame');
      return { inner: frame.contentWindow.innerWidth, shown: frame.getBoundingClientRect().width, orientation: frame.contentWindow.preview.tabbar.orientation };
    });
    expect(measured.inner).toBeGreaterThanOrEqual(900);
    expect(measured.shown).toBeLessThan(measured.inner);
    expect(measured.orientation).toBe('vertical');
  });
});

test.describe('guides', () => {
  const GUIDES = [
    ['start', 'Get started'], ['start/frameworks', 'Using a framework'], ['start/ssr', 'Server-side rendering'],
    ['start/browser-support', 'Browser support'], ['start/accessibility', 'Accessibility'], ['start/theming', 'Theming'],
  ];

  for (const [path, title] of GUIDES) {
    test(`${title} has its own page`, async ({ page }) => {
      await open(page, path, 'main h1');
      await expect(page.locator('main h1').first()).toHaveText(title);
      expect(await page.locator('main section[id] > h2').count()).toBeGreaterThan(3);
    });
  }

  test('the sidebar lists every guide, and the Guides tab stays selected on all of them', async ({ page }) => {
    await open(page, 'start/theming', 'main h1');
    const links = page.locator('.sidebar .node--root').first().locator('.side-link');
    await expect(links).toHaveText(GUIDES.map(([, title]) => title));
    await expect(page.locator('.lg-tabbar [role="tab"][aria-selected="true"]')).toHaveText(/Guides/);
  });

  test('Get started links on to the other guides', async ({ page }) => {
    await open(page, 'start', 'main h1');
    await page.locator('#next-steps a', { hasText: 'Using a framework' }).click();
    await expect(page.locator('main h1').first()).toHaveText('Using a framework');
  });
});

test.describe('core', () => {
  test('a control built on the pill core selects by tap and by arrow key, and moves its pill', async ({ page }) => {
    await open(page, 'foundation/core', '.dial');
    const dial = page.locator('.dial');
    await dial.scrollIntoViewIfNeeded();
    const pill = dial.locator('.lg-pill');
    const before = await pill.boundingBox();
    const xl = await dial.locator('.dial__cell[data-value="XL"]').boundingBox();
    await page.mouse.click(xl.x + xl.width / 2, xl.y + xl.height / 2);
    await page.waitForTimeout(900);
    await expect(dial.locator('.dial__cell.active')).toHaveText('XL');
    expect((await pill.boundingBox()).x).toBeGreaterThan(before.x + 40);
    await page.keyboard.press('ArrowLeft');
    await expect(dial.locator('.dial__cell.active')).toHaveText('L');
  });

  test('a morph popup made from the exported pieces opens, takes focus and closes on Escape', async ({ page }) => {
    await open(page, 'foundation/core', '.dial');
    await page.getByRole('button', { name: 'Add a note' }).click();
    await expect(page.locator('.lg-morph.lg-morph--open')).toHaveCount(1);
    await expect(page.locator('.core-note')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lg-morph.lg-morph--open')).toHaveCount(0);
  });

  test('the detent calculator resolves detents and merges ones that meet', async ({ page }) => {
    await open(page, 'foundation/core', '.dial');
    const calc = page.locator('#sheet-physics .core-calc').first();
    await calc.scrollIntoViewIfNeeded();
    // Each detent is a line on the drawing of the screen.
    await expect(calc.locator('.viz--detents .viz-line')).toHaveCount(3);
    await calc.locator('.lg-seg__item[data-value="two that meet"]').click();
    await expect(calc.locator('.viz--detents .viz-line')).toHaveCount(2);
  });
});

test.describe('home', () => {
  test('is a live board of the real components', async ({ page }) => {
    await open(page, 'home', '.tile');
    expect(await page.locator('.tile').count()).toBeGreaterThanOrEqual(9);
    // A component on it responds: the stepper moves and drives the ring beside it.
    const tile = page.locator('.tile', { hasText: 'Stepper and ring' });
    await tile.getByRole('button', { name: 'Add a guest' }).click();
    await expect(tile.locator('.tile-line strong')).toHaveText('3');
    await expect(tile.locator('.lg-progress')).toHaveAttribute('aria-valuenow', '0.3');
  });

  test('an alert from it answers, and a sheet blocks the page until it is dismissed', async ({ page }) => {
    await open(page, 'home', '.tile');
    const overlays = page.locator('.tile', { hasText: 'Alert and sheet' });
    await overlays.getByRole('button', { name: 'Alert' }).click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(overlays.locator('.readout')).toHaveText('present() resolved with "delete"');

    await overlays.getByRole('button', { name: 'Sheet' }).click();
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => document.getElementById('shell').inert)).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.getElementById('shell').inert)).toBe(false);
  });

  test('the accent applies to the board only, and the glass switch reaches every tile', async ({ page }) => {
    await open(page, 'home', '.tile');
    await page.locator('.swatch[aria-label="Pink"]').click();
    expect(await page.locator('.board').evaluate((n) => n.style.getPropertyValue('--lg-accent'))).toBe('#ff375f');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--lg-accent'))).toBe('');
    await page.locator('.board-opt', { hasText: 'Glass' }).locator('.lg-seg__item[data-value="clear"]').click();
    await expect(page.locator('.tile.lg-glass--clear')).toHaveCount(await page.locator('.tile').count());
  });

  test('leaves nothing behind on the body when the page is left', async ({ page }) => {
    await open(page, 'home', '.tile');
    const before = await page.evaluate(() => document.body.children.length);
    await page.goto('/#/components');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.body.children.length);
    expect(after).toBeLessThan(before);
    expect(await page.locator('.lg-popover').count()).toBe(0);
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page, 'home', '.tile');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe('segmented control blur', () => {
  test('the track blurs what is behind it only when asked to', async ({ page }) => {
    // Blur stays off until the device has been benchmarked, so force it on for this test, the way a person can.
    await page.addInitScript(() => localStorage.setItem('lg:blur-mode', 'on'));
    await open(page, 'components/segmented-control', '.playground .lg-seg__track');
    const track = page.locator('.playground .stage .lg-seg__track');
    const filter = () => track.evaluate((n) => getComputedStyle(n).backdropFilter);
    expect(await filter()).toBe('none');
    await page.locator('.playground .control-row', { hasText: 'Blur' }).locator('[role="switch"]').click();
    await page.waitForTimeout(600);
    expect(await filter()).toContain('blur');
    // The pill is a sibling of the track, so the two filters do not nest.
    expect(await page.locator('.playground .stage .lg-seg__track .lg-pill').count()).toBe(0);
  });

  test('the theme switcher in the corner has it', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lg:blur-mode', 'on'));
    await open(page, 'home', '.tile');
    expect(await page.locator('.theme-seg .lg-seg__track').evaluate((n) => getComputedStyle(n).backdropFilter)).toContain('blur');
  });
});

test.describe('cards that are links', () => {
  test('keep the text color of every other card, on all the pages that list them', async ({ page }) => {
    for (const path of ['home', 'start', 'components', 'components/button', 'foundation']) {
      await open(page, path, '.card-link');
      const colors = await page.evaluate(() => {
        const body = getComputedStyle(document.querySelector('#page')).color;
        return [...document.querySelectorAll('.card-link h3, .card-link p')].filter((n) => getComputedStyle(n).color !== body).length;
      });
      expect(colors, `${path}: card text that is not the page's text color`).toBe(0);
    }
  });
});

test.describe('cards that are links, on a phone', () => {
  test('press down but do not drag, and never take over scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, 'components', '.card-link');
    const card = page.locator('a.card-link').first();
    // No stretch physics: it would claim touch gestures (touch-action: none) and stop a swipe from scrolling.
    await expect(card).not.toHaveClass(/liquid-glass/);
    expect(await card.evaluate((n) => getComputedStyle(n).touchAction)).toBe('auto');
    // A plain press still scales down, and a drag does not move it.
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(300);
    expect(parseFloat(await card.evaluate((n) => getComputedStyle(n).scale))).toBeLessThan(1);
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 5 });
    expect(await card.evaluate((n) => getComputedStyle(n).translate)).toBe('none');
    await page.mouse.up();
  });
});
