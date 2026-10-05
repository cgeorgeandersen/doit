/// <reference types="vite/client" />

/** Set by Vercel at build time for Web Analytics (undefined everywhere else). */
interface ImportMetaEnv {
  readonly VITE_VERCEL_OBSERVABILITY_BASEPATH?: string;
  readonly VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG?: string;
}

/** True in builds made on Vercel (see vite.config.ts). */
declare const __ON_VERCEL__: boolean;
