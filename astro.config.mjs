import { defineConfig } from 'astro/config';

// https://astro.build
export default defineConfig({
  // Render the landing page statically.
  output: 'static',
  // Ship Three.js as a client-side only module.
  vite: {
    ssr: {
      noExternal: ['three'],
    },
  },
});