// Type-level tests (npm run test:types): the shaped glass core helper's options and what it returns, through the
// published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createShapedGlass, shapeOutline, holdCorners, blurInPieces, parseShadows, parseGradient } from '../../types/index.js';
import type { ShapedGlass, GlassPointer, PointerSide, ShapeOutline } from '../../types/index.js';

const root = document.createElement('div');
const glass = document.createElement('div');
const pointer: GlassPointer = { side: 'bottom', at: 40, length: 7, width: 14 };
const shape: ShapedGlass = createShapedGlass(root, glass, { pointer });
createShapedGlass(root, glass);
shape.setPointer({ side: 'left' });
shape.setPointer(null);
shape.setRadius({ x: 12, y: 24 });
shape.setRadius(null);
shape.update();
shape.refresh();
const tip: [number, number] | null = shape.tip;
const d: string = shape.d;
const side: PointerSide | undefined = shape.pointer?.side;
shape.destroy();

const outline: ShapeOutline = shapeOutline({ width: 120, height: 50, rx: 12, pointer: { side: 'top' }, smooth: false });
const bodyWidth: number = outline.body.width;
const pieces: boolean = blurInPieces();
const inset: boolean = parseShadows('none')[0].inset;
const stops = parseGradient('none');
const at: number | undefined = stops?.[0].at;
holdCorners(shape, root.animate([], 100), { duration: 100, radius: 12, width: 120, height: 50, scaleAt: (t) => ({ sx: t, sy: t }) });

// @ts-expect-error: a pointer comes out of a side
createShapedGlass(root, glass, { pointer: { side: 'middle' } });
// @ts-expect-error: the outline needs the box's size
shapeOutline({ rx: 12 });
// @ts-expect-error: at is a number of px
shape.setPointer({ side: 'top', at: '40px' });
// @ts-expect-error: holdCorners needs the scale at each moment
holdCorners(shape, root.animate([], 100), { duration: 100, radius: 12, width: 120, height: 50 });
