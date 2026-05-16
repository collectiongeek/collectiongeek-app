// vite-plugin-sri4 ships without TypeScript types. Declare an ambient
// module so tsc accepts the import in vite.config.ts. The plugin runs at
// build time only; app code never sees it, so a richer shape isn't worth
// hand-maintaining.
declare module "vite-plugin-sri4";
