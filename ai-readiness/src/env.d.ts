/// <reference types="vite/client" />

/** Set by Vercel at build time for Web Analytics (undefined everywhere else). */
interface ImportMetaEnv {
  readonly VITE_VERCEL_OBSERVABILITY_BASEPATH?: string;
  readonly VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG?: string;
}
