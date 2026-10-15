import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// base relativa: o app funciona tanto na raiz quanto em /CritBox/ (GitHub Pages).
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
