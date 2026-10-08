import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    reportCompressedSize: true,
    // Fonts always ship as files: the Content-Security-Policy allows fonts from this site only, not data: URIs.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
