import { resolve } from 'node:path';

// Two pages: the docs, and the small page the tab bar previews run in (see components/tabbar.js).
export default {
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        tabbarPreview: resolve(import.meta.dirname, 'tabbar-preview.html'),
      },
    },
  },
};
