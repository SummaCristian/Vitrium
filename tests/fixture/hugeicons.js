// Renders Hugeicons icon data (arrays of [tag, attrs]) to SVG strings, which the
// tab bar accepts as `icon`. Per-icon subpath imports keep the bundle small.
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Compass01Icon from '@hugeicons/core-free-icons/Compass01Icon';
import BookOpen01Icon from '@hugeicons/core-free-icons/BookOpen01Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';

const toSvg = (data) => {
  const body = data.map(([tag, { key, ...attrs }]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${v}"`).join(' ')}/>`).join('');
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
};

export const hugeicons = {
  home: toSvg(Home01Icon),
  explore: toSvg(Compass01Icon),
  library: toSvg(BookOpen01Icon),
  settings: toSvg(Settings02Icon),
  search: toSvg(Search01Icon),
};
