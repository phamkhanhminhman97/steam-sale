import { defineConfig } from 'astro/config';
// Fonts and styles stay separate files: the CSP in public/_headers allows 'self' only, so inlined data: URIs would be blocked.
export default defineConfig({ output: 'static', build: { inlineStylesheets: 'never' }, vite: { build: { target: 'es2022', assetsInlineLimit: 0 } } });
