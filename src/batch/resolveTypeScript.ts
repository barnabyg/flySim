import { registerHooks } from "node:module";

/**
 * Lets Node run the engine's TypeScript as it is. Node strips the types itself, but the engine
 * imports its modules without extensions, and folders by their index, as the bundler allows, so
 * this adds them.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?(\/|$)/.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return nextResolve(candidate, context);
        } catch {
          // Not this one, so the next is tried.
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
