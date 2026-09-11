// Teaches `node --test` the "@/..." path alias that tsconfig gives the app.
//
// Tests run straight off the TypeScript sources with --experimental-strip-types,
// so there is no bundler in the way to resolve the alias, and no extension on
// the import either. Without this a test could only import a module whose own
// imports are all relative and extensioned, which would push the alias out of
// the very files worth testing.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../src/", import.meta.url);

/** TypeScript imports carry no extension; try the ones the repo uses. */
function resolveFile(url) {
  const path = fileURLToPath(url);
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return url.href;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(resolveFile(new URL(specifier.slice(2), SRC)), context);
    }
    return nextResolve(specifier, context);
  },
});
