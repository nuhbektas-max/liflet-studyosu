import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tek dosyalık sürüm: her tarayıcıda, internetsiz açılır (fontlar dahil).
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { outDir: 'dist-tek', assetsInlineLimit: 100000000 },
});
