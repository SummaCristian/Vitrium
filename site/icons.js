// Hugeicons data -> SVG strings, as accepted by the tab bar's `icon`.
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Compass01Icon from '@hugeicons/core-free-icons/Compass01Icon';
import BookOpen01Icon from '@hugeicons/core-free-icons/BookOpen01Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import StarIcon from '@hugeicons/core-free-icons/StarIcon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import Calendar01Icon from '@hugeicons/core-free-icons/Calendar01Icon';
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon';
import GridViewIcon from '@hugeicons/core-free-icons/GridViewIcon';
import MapIcon from '@hugeicons/core-free-icons/MapIcon';
import PencilEdit01Icon from '@hugeicons/core-free-icons/PencilEdit01Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Share01Icon from '@hugeicons/core-free-icons/Share01Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon';

export const toSvg = (data) => {
  const body = data.map(([tag, { key, ...attrs }]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${v}"`).join(' ')}/>`).join('');
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
};

const stroke = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${d}</svg>`;

export const navIcons = {
  menu: stroke('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  sidebar: stroke('<rect x="3" y="4.5" width="18" height="15" rx="3.5"/><path d="M9.5 4.5v15"/>'),
  home: toSvg(Home01Icon),
  start: toSvg(BookOpen01Icon),
  foundation: toSvg(Settings02Icon),
  components: toSvg(Compass01Icon),
};

// The icons the component demos use, by short name, with the Hugeicons name each one came from (for the printed code).
export const demoIcons = {
  star: { svg: toSvg(StarIcon), name: 'StarIcon' },
  settings: { svg: toSvg(Settings01Icon), name: 'Settings01Icon' },
  plus: { svg: toSvg(Add01Icon), name: 'Add01Icon' },
  search: { svg: toSvg(Search01Icon), name: 'Search01Icon' },
  calendar: { svg: toSvg(Calendar01Icon), name: 'Calendar01Icon' },
  list: { svg: toSvg(LeftToRightListBulletIcon), name: 'LeftToRightListBulletIcon' },
  grid: { svg: toSvg(GridViewIcon), name: 'GridViewIcon' },
  map: { svg: toSvg(MapIcon), name: 'MapIcon' },
  edit: { svg: toSvg(PencilEdit01Icon), name: 'PencilEdit01Icon' },
  copy: { svg: toSvg(Copy01Icon), name: 'Copy01Icon' },
  share: { svg: toSvg(Share01Icon), name: 'Share01Icon' },
  trash: { svg: toSvg(Delete02Icon), name: 'Delete02Icon' },
  more: { svg: toSvg(MoreHorizontalIcon), name: 'MoreHorizontalIcon' },
};
