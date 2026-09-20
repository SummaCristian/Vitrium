import { resolve } from 'node:path';

// The docs, plus the small pages the tab bar and sheet previews run in (see components/tabbar.js, components/sheet.js).
export default {
  base: './',   // relative, so it works under github.io/Vitrium/ as well as at a domain root
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        tabbarPreview: resolve(import.meta.dirname, 'tabbar-preview.html'),
        sheetPreview: resolve(import.meta.dirname, 'sheet-preview.html'),
      },
    },
  },
};
