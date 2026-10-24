import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

// Next's bundler unwraps CJS defaults for Link/Image. Standalone Node ESM
// needs the same interop to render those real components (without stubs).
const require = createRequire(import.meta.url);
const entrypoints = new Map(["next/link", "next/image"].map((name) => {
  const path = require.resolve(name);
  return [pathToFileURL(path).href, path];
}));
registerHooks({
  load(url, context, nextLoad) {
    const path = entrypoints.get(url);
    if (!path) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: `import { createRequire } from "node:module";
        const component = createRequire(import.meta.url)(${JSON.stringify(path)});
        export default component.default ?? component;`,
    };
  },
});
