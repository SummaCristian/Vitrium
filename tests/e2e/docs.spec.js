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
  test('scatters the real components around the logo', async ({ page }) => {
    await open(page, 'home', '.hero-stage .float');
    await expect(page.locator('.hero-mark img')).toBeVisible();
    expect(await page.locator('.hero-stage .float').count()).toBeGreaterThanOrEqual(8);
    // A component on it responds: the stepper moves and drives the ring beside it.
    // The scatter drifts, which Playwright reads as unstable, so hold it still first.
    await page.evaluate(() => document.querySelector('.hero-stage').classList.add('paused'));
    const stepper = page.locator('.float--stepper');
    await stepper.getByRole('button', { name: 'Add a guest' }).click();
    await expect(page.locator('.float--ring .lg-progress')).toHaveAttribute('aria-valuenow', '1');
  });

  test('the calls to action lead on to the docs', async ({ page }) => {
    await open(page, 'home', '.hero-actions');
    await expect(page.locator('.hero-actions a[href="#/start"]')).toBeVisible();
    await expect(page.locator('.hero-actions a[href="#/components"]')).toBeVisible();
    await expect(page.locator('.hero-actions .gh-btn')).toHaveAttribute('href', /github\.com/);
  });

  test('leaves nothing behind on the body when the page is left', async ({ page }) => {
    await open(page, 'home', '.hero-stage .float');
    await page.goto('/#/components');
    await page.waitForTimeout(600);
    expect(await page.locator('.hero-stage').count()).toBe(0);
    expect(await page.locator('.lg-popover').count()).toBe(0);
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page, 'home', '.hero-stage .float');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('every page fits a phone without scrolling sideways', async ({ page }) => {
    // Anything wider than the screen (a long line of inline code, say) widens the whole page, and the fixed layers
    // (the tab bar, a sheet, an alert) then line up against the wrong width.
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page, 'home', '.hero-stage .float');
    const routes = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href')))]);
    expect(routes.length).toBeGreaterThan(10);
    const wide = [];
    for (const route of routes) {
      await page.goto(`/${route}`);
      await page.waitForTimeout(400);
      const w = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (w > 0) wide.push(`${route} (+${w}px)`);
    }
    expect(wide).toEqual([]);
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
    // The docs switch refraction on, which takes the blur's place in Chrome (see the refraction tests below).
    expect(await filter()).toMatch(/blur|url\(/);
    // The pill is a sibling of the track, so the two filters do not nest.
    expect(await page.locator('.playground .stage .lg-seg__track .lg-pill').count()).toBe(0);
  });

  test('the theme switcher in the corner has it', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lg:blur-mode', 'on'));
    await open(page, 'home', '.hero-stage .float');
    expect(await page.locator('.theme-seg .lg-seg__track').evaluate((n) => getComputedStyle(n).backdropFilter)).toMatch(/blur|url\(/);
  });
});

test.describe('refraction', () => {
  test('glass bends the backdrop in place of the blur while blur is on', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lg:blur-mode', 'on'));
    await open(page, 'foundation/glass', '.glass-demo');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.dataset.refraction)).toBe('on');
    const demo = page.locator('.glass-demo');
    // The surface's own blur, as its glass style leaves it, then the refraction.
    const filter = await demo.evaluate((n) => getComputedStyle(n).backdropFilter);
    expect(filter).toMatch(/^(blur\([\d.]+px\) )?url\("#lg-refraction-\d+"\)$/);
    // The filter it points at has a map the size of the surface.
    const size = await demo.evaluate((n) => {
      const id = getComputedStyle(n).backdropFilter.match(/#([\w-]+)/)[1];
      const img = document.getElementById(id).querySelector('feImage');
      return [+img.getAttribute('width'), +img.getAttribute('height'), n.offsetWidth, n.offsetHeight];
    });
    expect(size.slice(0, 2)).toEqual(size.slice(2));
  });

  test('glass that stays inside a morph popup is held through every open, not only the first', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lg:blur-mode', 'on'));
    await open(page, 'foundation/core', '.dial');
    const trigger = page.getByRole('button', { name: 'Add a note' });
    const panel = page.locator('.lg-morph.lg-morph--open');
    await trigger.click();
    await expect(panel).toHaveCount(1);
    // A chip that stays in the panel between opens, as a host's own controls do
    await panel.evaluate((p) => {
      const chip = document.createElement('div');
      chip.className = 'lg-glass held-chip';
      chip.style.cssText = 'width: 120px; height: 40px; margin: 8px; border-radius: 20px';
      p.querySelector('.lg-morph__inner').append(chip);
    });
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await page.waitForTimeout(1000);

    // Every change to the panel's and the chip's refraction through the next open, as it happens
    const changes = page.evaluate(() => new Promise((resolve) => {
      const chip = document.querySelector('.held-chip');
      const shell = chip.closest('.lg-morph');
      const t0 = performance.now();
      const out = [];
      const note = (who, el) => {
        if (!el.classList.contains('lg-refracting')) return;
        const bent = el.style.getPropertyValue('--_lg-refraction').includes('url(');
        if (out.findLast((c) => c.who === who)?.bent !== bent) out.push({ who, bent, t: performance.now() - t0 });
      };
      const seen = new MutationObserver((records) => {
        for (const { target } of records) {
          if (target === shell) note('panel', shell);
          if (target === chip) note('chip', chip);
        }
      });
      seen.observe(shell, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
      setTimeout(() => { seen.disconnect(); resolve(out); }, 1500);
    }));
    await trigger.click();
    const log = await changes;

    const first = (who, bent) => log.find((c) => c.who === who && c.bent === bent);
    // Both start held, flat for the trip, and the chip gets its bend only as the panel lands
    expect(first('chip', false), JSON.stringify(log)).toBeTruthy();
    expect(first('panel', true), JSON.stringify(log)).toBeTruthy();
    expect(first('chip', true).t, JSON.stringify(log)).toBeGreaterThanOrEqual(first('panel', true).t - 50);
  });

  // Whether the surface at `selector` (in a page or a frame) is bent, as it starts and at every change for `ms`.
  const bendLog = (target, selector, ms) => target.evaluate(({ selector, ms }) => new Promise((resolve) => {
    const el = document.querySelector(selector);
    const t0 = performance.now();
    const bent = () => el.classList.contains('lg-refracting') && el.style.getPropertyValue('--_lg-refraction').includes('url(');
    const out = [{ bent: bent(), t: 0 }];
    const seen = new MutationObserver(() => {
      if (out.at(-1).bent !== bent()) out.push({ bent: bent(), t: Math.round(performance.now() - t0) });
    });
    seen.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    setTimeout(() => { seen.disconnect(); resolve(out); }, ms);
  }), { selector, ms });

  // Unbent within `within` ms of the start (a frame or so), and bent again by the end, after `after` ms or more.
  const heldThrough = (log, after, within = 100) => {
    const flat = log.findIndex((c) => !c.bent);
    expect(flat, JSON.stringify(log)).toBeGreaterThanOrEqual(0);
    expect(log[flat].t, JSON.stringify(log)).toBeLessThan(within);
    const back = log.slice(flat).find((c) => c.bent);
    expect(back, JSON.stringify(log)).toBeTruthy();
    expect(back.t, JSON.stringify(log)).toBeGreaterThanOrEqual(after);
    expect(log.at(-1).bent, JSON.stringify(log)).toBe(true);
  };

  test('a popover is held unbent while it grows, and while it glides to a new size', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lg:blur-mode', 'on'));
    await open(page, 'components/popover', '.popover-arena');
    const pop = '.lg-popover[aria-label="What is new"]';
    const trigger = page.getByRole('button', { name: 'Medium' });

    // Opened once and closed, so it has a bend of its own to lose
    await trigger.click();
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    let log = bendLog(page, pop, 1200);
    await trigger.click();
    heldThrough(await log, 150);

    await page.waitForTimeout(300);
    log = bendLog(page, pop, 1200);
    await page.locator(pop).getByRole('button', { name: 'Show more' }).click();
    heldThrough(await log, 150);
  });

  test('the tab bar is held unbent while it changes size', async ({ page }) => {
    // Tall enough that reaching the playground's controls doesn't scroll the preview away (off screen, it stops refracting)
    await page.setViewportSize({ width: 1300, height: 2400 });
    await page.addInitScript(() => localStorage.setItem('lg:blur-mode', 'on'));
    await open(page, 'components/tab-bar', '.playground');
    await page.waitForTimeout(1000);
    const preview = page.frames().find((f) => f.url().includes('tabbar-preview'));
    await expect.poll(() => preview.evaluate(() => document.querySelector('.lg-tabbar__bar')?.classList.contains('lg-refracting'))).toBe(true);

    const log = bendLog(preview, '.lg-tabbar__bar', 2000);
    await option(page, 'Tabs', '2').click();
    // (The log starts before the click, and the change reaches the preview through the playground, so it is flat some hundreds of ms in, not a frame.)
    heldThrough(await log, 150, 900);
  });

  test('stays off, with the blur, while blur is off', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lg:blur-mode', 'off'));
    await open(page, 'foundation/glass', '.glass-demo');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.dataset.refraction)).toBe('off');
    expect(await page.locator('.lg-refracting').count()).toBe(0);
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

test.describe('hover highlight', () => {
  // The highlight's box in the page, and how much of it shows.
  const state = (page) => page.evaluate(() => {
    const el = document.querySelector('.hl-toolbar .lg-hover-highlight');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, w: r.width, h: r.height, op: +getComputedStyle(el).opacity };
  });
  const middle = async (page, name) => {
    const b = await page.locator('.hl-toolbar').getByRole('button', { name, exact: true }).boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2, b];
  };

  test('shows over the item under a mouse, inset in it, and its content grows', async ({ page }) => {
    await open(page, 'foundation/hover', '.hl-toolbar');
    await page.locator('.hl-toolbar').scrollIntoViewIfNeeded();
    const [x, y, box] = await middle(page, 'Documents');
    await page.mouse.move(x, y);
    await page.waitForTimeout(500);
    const s = await state(page);
    expect(s.op).toBeGreaterThan(0.95);
    expect(Math.abs(s.x - x)).toBeLessThan(2);
    expect(s.h).toBeCloseTo(box.height - 8, 0);
    expect(s.w).toBeCloseTo(box.width - 8, 0);
    const scale = await page.locator('.hl-title > span').evaluate((n) => parseFloat(getComputedStyle(n).scale));
    expect(scale).toBeGreaterThan(1.02);
  });

  test('the breadcrumbs share one, and their glass back button gives up its hover lift for it', async ({ page }) => {
    await open(page, 'foundation/tokens', '.crumbs');
    const shown = () => page.locator('.crumbs .lg-hover-highlight').evaluate((n) => +getComputedStyle(n).opacity);
    const back = page.locator('.crumb-back');
    const b = await back.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(400);
    expect(await shown()).toBeGreaterThan(0.95);
    // Not lifted (a glass button's own hover scales it to 1.045).
    expect(await back.evaluate((n) => parseFloat(getComputedStyle(n).scale) || 1)).toBeLessThan(1.01);
    const link = await page.locator('.crumb-list a').first().boundingBox();
    await page.mouse.move(link.x + link.width / 2, link.y + link.height / 2, { steps: 4 });
    await page.waitForTimeout(400);
    const hl = await page.locator('.crumbs .lg-hover-highlight').boundingBox();
    expect(Math.abs(hl.x + hl.width / 2 - (link.x + link.width / 2))).toBeLessThan(2);
    expect(await shown()).toBeGreaterThan(0.95);
  });

  test('travels to the next item, fades out over a gap, and puts the content back', async ({ page }) => {
    await open(page, 'foundation/hover', '.hl-toolbar');
    await page.locator('.hl-toolbar').scrollIntoViewIfNeeded();
    const [x1, y] = await middle(page, 'Back');
    const [x2] = await middle(page, 'Forward');
    await page.mouse.move(x1, y);
    await page.waitForTimeout(400);
    await page.mouse.move(x2, y, { steps: 4 });
    await page.waitForTimeout(60);
    // Mid-trip: between the two, not faded in fresh at the second.
    const mid = await state(page);
    expect(mid.x).toBeGreaterThan(x1 + 2);
    expect(mid.op).toBeGreaterThan(0.3);
    await page.waitForTimeout(400);
    expect(Math.abs((await state(page)).x - x2)).toBeLessThan(2);
    // Over no item (well below the toolbar), it fades where it is.
    await page.mouse.move(x2, y + 200);
    await page.waitForTimeout(500);
    const gone = await state(page);
    expect(gone.op).toBeLessThan(0.02);
    expect(Math.abs(gone.x - x2)).toBeLessThan(2);
    const left = await page.locator('.hl-toolbar').getByRole('button', { name: 'Forward', exact: true }).locator('svg').evaluate((n) => n.style.scale + n.style.translate);
    expect(left).toBe('');
  });
});
