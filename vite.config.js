import { defineConfig } from 'vite';

// Relative base so the built `dist/` folder works from any path (GitHub Pages, a subfolder, an iframe on a games site...).
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
