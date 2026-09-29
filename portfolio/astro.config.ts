import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/config/site';

/**
 * Drop HTML comments from Markdown content, so editing notes such as
 * "<!-- George: add … -->" never reach the published page source.
 */
const stripHtmlComments = {
  name: 'strip-html-comments',
  html(node: { value: string }, ctx: { removeNode(node: unknown): void }) {
    if (/^\s*<!--[\s\S]*-->\s*$/.test(node.value)) ctx.removeNode(node);
  },
};

/**
 * The site's public address, used for canonical links, the sitemap, RSS and
 * share images. site.ts wins when it is set; otherwise builds on Vercel use the
 * project's production domain (your custom domain once connected, else the
 * *.vercel.app one), and local builds use the preview server's address.
 */
function siteUrl(): string {
  if (SITE.url) return SITE.url.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:4321';
}

export default defineConfig({
  site: siteUrl(),
  trailingSlash: 'never',
  markdown: {
    processor: satteri({ mdastPlugins: [stripHtmlComments] }),
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
  ],
  build: {
    // Small per-page CSS is inlined, so first paint needs no extra request.
    inlineStylesheets: 'auto',
  },
  devToolbar: { enabled: false },
});
