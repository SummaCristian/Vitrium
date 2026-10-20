import { setGlass, setGlassTint } from '../../types/index.js';
import type { GlassMode } from '../../types/index.js';

const el = document.createElement('div');

const mode: GlassMode | null = setGlass(el, 'clear');
setGlass(el, 'regular');
// @ts-expect-error: not a glass mode
setGlass(el, 'frosted');

const same: HTMLDivElement = setGlassTint(el, '#0a84ff');
setGlassTint(el, null);
// @ts-expect-error: a color is a string
setGlassTint(el, 0x0a84ff);

void mode;
void same;
