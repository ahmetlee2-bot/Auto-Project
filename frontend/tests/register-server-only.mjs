import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(specifier, ...args) {
  if (specifier === "server-only") return fileURLToPath(new URL("./server-only-stub.cjs", import.meta.url));
  return originalResolve.call(this, specifier, ...args);
};
