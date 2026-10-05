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
 * An empty header cell (the corner of a table whose rows are labelled in the
 * first column) becomes a plain cell. Screen readers announce every header,
 * and an empty one reads as a column with no name.
 */
const emptyHeaderCells = {
  name: 'empty-header-cells',
  element: {
    filter: ['th'],
    visit(node: { properties?: Record<string, unknown> }, ctx: { textContent(node: unknown): string; replaceNode(node: unknown, next: unknown): void }) {
      if (ctx.textContent(node).trim() !== '') return;
      ctx.replaceNode(node, { type: 'element', tagName: 'td', properties: { ...node.properties }, children: [] });
    },
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
    processor: satteri({ mdastPlugins: [stripHtmlComments], hastPlugins: [emptyHeaderCells] }),
  },
  integrations: [
    sitemap({
      // The assessment's /results page only shows a result from its link's #, so it isn't a page to index.
      filter: (page) => !page.includes('/404') && !/\/results\/?$/.test(page),
    }),
  ],
  build: {
    // The whole stylesheet (~5 KB compressed) goes inline, so first paint needs no
    // extra round trip. Most visitors arrive from a shared link and read a page or
    // three, so that beats caching CSS separately (measured: home LCP 2.0 s → 1.8 s
    // on Lighthouse's slow-4G profile).
    inlineStylesheets: 'always',
  },
  devToolbar: { enabled: false },
});
