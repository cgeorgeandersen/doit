/// <reference types="vite/client" />

/** ISO timestamp of the build, injected by vite.config.ts. */
declare const __BUILD_DATE__: string;

/** Set by Vercel at build time for Web Analytics (undefined everywhere else). */
interface ImportMetaEnv {
  readonly VITE_VERCEL_OBSERVABILITY_BASEPATH?: string;
  readonly VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG?: string;
}
