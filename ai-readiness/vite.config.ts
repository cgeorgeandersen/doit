import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';
import { CONTENT } from './src/content.ts';

/**
 * This site's public address, for the canonical link and the share image.
 * content.ts `site.url` wins when it's set; otherwise builds on Vercel use the
 * project's production domain (the custom domain once one is connected), and
 * local builds use the preview server's address.
 */
function siteUrl(): string {
  if (CONTENT.site.url) return CONTENT.site.url.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:4173';
}

type Render = typeof import('./src/render.ts');

/**
 * Writes the head metadata, header, first screen and footer into index.html
 * from content.ts (through src/render.ts), at the <!--app:…--> markers. In
 * development the renderer is reloaded on every request, so edits to
 * content.ts show up on save.
 */
function pageFromContent(): Plugin {
  let server: ViteDevServer | undefined;
  return {
    name: 'page-from-content',
    configureServer(devServer) {
      server = devServer;
    },
    async transformIndexHtml(html) {
      const render = (server ? await server.ssrLoadModule('/src/render.ts') : await import('./src/render.ts')) as Render;
      const page = { siteUrl: siteUrl(), year: new Date().getUTCFullYear() };
      const parts: Record<string, string> = {
        head: render.headHtml(page),
        header: render.headerHtml(),
        intro: render.introHtml(),
        footer: render.footerHtml(page),
      };
      return html.replace(/<!--app:(\w+)-->/g, (marker, name: string) => {
        const part = parts[name];
        if (part === undefined) throw new Error(`index.html has an unknown marker ${marker}`);
        return part;
      });
    },
    handleHotUpdate({ file, server: devServer }) {
      if (/\/src\/(content|render)\.ts$/.test(file) || file.includes('/src/lib/')) devServer.ws.send({ type: 'full-reload' });
    },
  };
}

/** The share image's words, from content.ts (reloaded on each request in development). */
async function shareImage(server?: ViteDevServer): Promise<Buffer> {
  const [{ renderShareImage }, { tx }] = await Promise.all([import('./scripts/share-image.ts'), import('./src/lib/text.ts')]);
  const content = server ? ((await server.ssrLoadModule('/src/content.ts')) as { CONTENT: typeof CONTENT }).CONTENT : CONTENT;
  const host = new URL(siteUrl()).hostname.replace(/^www\./, '');
  return renderShareImage({
    kicker: [content.site.author, 'Self-assessment'],
    title: tx(content.intro.title),
    emphasis: content.intro.emphasis,
    dek: tx(content.meta.imageDek),
    note: tx(content.meta.imageNote),
    byline: host === 'localhost' ? new URL(content.site.portfolio).hostname.replace(/^www\./, '') : host,
  });
}

/** Renders /og.png: into the build, and on request in development. */
function shareImagePlugin(): Plugin {
  return {
    name: 'share-image',
    configureServer(devServer) {
      devServer.middlewares.use('/og.png', (_req, res, next) => {
        shareImage(devServer)
          .then((png) => {
            res.setHeader('Content-Type', 'image/png');
            res.end(png);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'og.png', source: await shareImage() });
    },
  };
}

/** `vite preview` sends the same headers as Vercel, so the Content-Security-Policy is tested before it ships. */
function vercelHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(resolve(import.meta.dirname, 'vercel.json'), 'utf8')) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const all = config.headers?.find((h) => h.source === '/(.*)');
  return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
}

export default defineConfig({
  base: '/',
  plugins: [pageFromContent(), shareImagePlugin()],
  define: {
    // Web Analytics only in builds on Vercel, where its script is served from this site's own domain
    // (as on the portfolio), so local previews and Lighthouse runs don't request a script that 404s.
    __ON_VERCEL__: JSON.stringify(process.env.VERCEL === '1'),
  },
  preview: { headers: vercelHeaders() },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    reportCompressedSize: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
