import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE, PLACEHOLDER_PHONE } from './src/config/site';

/**
 * The site's public address, used for canonical links, the sitemap and share
 * images. site.ts wins when it is set; otherwise builds on Vercel use the
 * project's production domain (the custom domain once connected, else the
 * *.vercel.app one), and local builds use the preview server's address.
 */
function siteUrl(): string {
  if (SITE.url) return SITE.url.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:4321';
}

if (SITE.phone.e164 === PLACEHOLDER_PHONE) {
  console.warn('\n[cherokee-small-jobs] The phone number in src/config/site.ts is still the placeholder. Replace it before launch.\n');
}

export default defineConfig({
  site: siteUrl(),
  trailingSlash: 'never',
  // Pages build to /services.html and /services/drywall-repair.html; vercel.json's
  // cleanUrls serves them at /services and /services/drywall-repair.
  build: { format: 'file', inlineStylesheets: 'always' },
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
  devToolbar: { enabled: false },
});
