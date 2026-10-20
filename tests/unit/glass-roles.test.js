import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BUILTIN_ROLES, builtinGlassRolesCSS, checkGlassRole, defineGlassRole, getGlassRoles, glassRoleCSS, glassRoleTokens,
  setCuratedRoles, setGlassRole,
} from '../../src/components/glass-roles.js';

// A role of one's own, complete: what the tests below break one piece at a time.
const badge = () => ({
  slots: { blur: 'blur', fill: 'color' },
  styles: {
    frost: { blur: 6, fill: 'rgba(255, 255, 255, 0.4)' },
    transparent: { blur: '1px', fill: 'transparent' },
    curated: 'transparent',
  },
});

describe('the built-in roles', () => {
  it('are what styles/glass-roles.css was generated from (npm run build:glass-roles after changing them)', () => {
    const css = readFileSync(new URL('../../src/styles/glass-roles.css', import.meta.url), 'utf8');
    expect(css).toBe(builtinGlassRolesCSS());
  });

  it('are a surface, a rail and a lens, each with every style', () => {
    expect(Object.keys(BUILTIN_ROLES)).toEqual(['surface', 'rail', 'lens']);
    for (const [name, spec] of Object.entries(BUILTIN_ROLES)) expect(() => checkGlassRole(name, spec)).not.toThrow();
  });

  it('mix frost surfaces and rails with transparent lenses under curated', () => {
    const roles = getGlassRoles();
    expect(roles.surface.styles.curated).toBe('frost');
    expect(roles.rail.styles.curated).toBe('frost');
    expect(roles.lens.styles.curated).toBe('transparent');
  });
});

describe('a role definition', () => {
  it('passes when every style gives every slot, numbers taken as px', () => {
    const spec = checkGlassRole('badge', badge());
    expect(spec.styles.frost.blur).toBe('6px');
    expect(spec.styles.curated).toBe('transparent');
  });

  it('fails without a style', () => {
    const spec = badge(); delete spec.styles.transparent;
    expect(() => checkGlassRole('badge', spec)).toThrow(/'transparent' style/);
    const noCurated = badge(); delete noCurated.styles.curated;
    expect(() => checkGlassRole('badge', noCurated)).toThrow(/'curated'/);
  });

  it('fails when a style misses a slot, or names one the role doesn\'t have', () => {
    const missing = badge(); delete missing.styles.frost.fill;
    expect(() => checkGlassRole('badge', missing)).toThrow(/style 'frost': no value for slot 'fill'/);
    const extra = badge(); extra.styles.frost.tint = 'red';
    expect(() => checkGlassRole('badge', extra)).toThrow(/'tint' isn't one of its slots/);
  });

  it('fails on a style, a slot type or a name that isn\'t one', () => {
    expect(() => checkGlassRole('badge', { ...badge(), styles: { ...badge().styles, glossy: {} } })).toThrow(/'glossy' isn't a glass style/);
    expect(() => checkGlassRole('badge', { ...badge(), slots: { blur: 'blurry', fill: 'color' } })).toThrow(/slot 'blur' is a blur, length, color/);
    expect(() => checkGlassRole('Badge!', badge())).toThrow(/lowercase/);
    expect(() => checkGlassRole('badge', { ...badge(), styles: { ...badge().styles, curated: 'glossy' } })).toThrow(/takes 'frost' or 'transparent'/);
  });

  it('can give curated values of its own', () => {
    const spec = badge(); spec.styles.curated = { blur: 3, fill: 'transparent' };
    expect(checkGlassRole('badge', spec).styles.curated).toEqual({ blur: '3px', fill: 'transparent' });
  });
});

describe('the CSS of a role', () => {
  const css = glassRoleCSS('badge', checkGlassRole('badge', badge()));

  it('registers its tokens, so a change of style eases them', () => {
    expect(css).toContain("@property --lg-role-badge-blur { syntax: '<length>'");
    expect(css).toContain("@property --lg-role-badge-fill { syntax: '<color>'");
  });

  it('gives each style its values, curated the style it takes', () => {
    expect(css).toMatch(/:root,\n\[data-glass-style="frost"\] \{\n {2}--lg-role-badge-blur: 6px;/);
    expect(css).toMatch(/\[data-glass-style="curated"\] \{\n {2}--lg-role-badge-blur: 1px;\n {2}--lg-role-badge-fill: transparent;/);
  });

  it('zeroes its blurs where blur is off, nested styles included, and leaves its colors', () => {
    expect(css).toMatch(/:root\[data-blur="off"\] \[data-glass-style\] \{\n {2}--lg-role-badge-blur: 0px;\n\}/);
  });

  it('hands the parts that play it their values as --lg-material-*', () => {
    expect(css).toMatch(/\[data-glass-role="badge"\] \{\n {2}--lg-material-blur: var\(--lg-role-badge-blur\);/);
  });
});

describe('roles of your own', () => {
  it('join the built-in ones, and their tokens ease with the style', () => {
    defineGlassRole('chip-badge', badge());
    expect(getGlassRoles()['chip-badge'].builtin).toBe(false);
    expect(glassRoleTokens()).toContain('--lg-role-chip-badge-fill');
  });

  it('can\'t take a name already in use', () => {
    expect(() => defineGlassRole('lens', badge())).toThrow(/already a glass role 'lens'/);
  });

  it('change their mix under curated, page-wide', () => {
    setCuratedRoles({ rail: 'transparent' });
    expect(getGlassRoles().rail.styles.curated).toBe('transparent');
    setCuratedRoles({ rail: null });
    expect(getGlassRoles().rail.styles.curated).toBe('frost');
    expect(() => setCuratedRoles({ nothing: 'frost' })).toThrow(/no glass role 'nothing'/);
    expect(() => setCuratedRoles({ rail: 'glossy' })).toThrow(/takes 'frost' or 'transparent'/);
  });

  it('are played by an element through its data-glass-role', () => {
    const el = { dataset: {} };
    expect(setGlassRole(el, 'lens')).toBe('lens');
    expect(el.dataset.glassRole).toBe('lens');
    setGlassRole(el, null);
    expect(el.dataset.glassRole).toBeUndefined();
  });
});
