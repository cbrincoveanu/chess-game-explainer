import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { EngineTransport } from "./transport.ts";

/**
 * Node transport for tests and local tooling: loads the same Emscripten glue
 * used in the browser. The project is an ES module package, so the glue (a
 * CommonJS script) is evaluated inside a CommonJS-flavored sandbox instead of
 * require(). The glue sets module.exports to a factory returning the engine
 * module, whose `listener` receives engine output and whose `processCommand`
 * queues UCI commands.
 */
export function createNodeTransport(enginePath: string): EngineTransport {
  const gluePath = resolve(enginePath);
  const glueSource = readFileSync(gluePath, "utf8");
  const nodeRequire = createRequire(gluePath);
  const moduleObj = { exports: {} as Record<string, unknown> };
  const sandbox = new Function(
    "module",
    "exports",
    "require",
    "__filename",
    "__dirname",
    glueSource,
  );
  sandbox(moduleObj, moduleObj.exports, nodeRequire, gluePath, dirname(gluePath));
  const load = moduleObj.exports as unknown as () => Record<string, unknown>;
  const mod = load();
  let handler: (line: string) => void = () => {};
  mod.listener = (line: unknown) => {
    if (typeof line === "string") handler(line);
  };
  return {
    send: (cmd) => (mod.processCommand as (cmd: string) => void)(cmd),
    onLine: (h) => {
      handler = h;
    },
    onError: () => {
      // Node engine errors surface as exceptions; nothing to hook here.
    },
    terminate: () => {
      try {
        (mod.processCommand as (cmd: string) => void)("quit");
      } catch {
        // ignore
      }
    },
  };
}
