import { h } from '../dom.js';

export const html = document.documentElement;
export const button = (label, onClick) => h('button', { class: 'lg-btn pill lg-glass liquid-glass', type: 'button', onClick }, label);
