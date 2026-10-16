import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // relative base so the build works on GitHub Pages and inside Tauri
  base: './',
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', sourcemap: false },
  server: { port: 5173 },
});
