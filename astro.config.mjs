// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  outDir: './dist',
  // Keep public/ as Astro's static passthrough dir so CSS/JS/data/images
  // are copied verbatim to dist/ at the same paths the Worker expects.
  publicDir: './public',
  vite: {
    plugins: [tailwindcss()],
  },
});
