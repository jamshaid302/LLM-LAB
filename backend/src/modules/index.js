import { createFundamentalsModule } from "./fundamentals/index.js";
import { createRagModule } from "./rag/index.js";
import { createStreamingModule } from "./streaming/index.js";

/**
 * Every module exposes { id, name, router, init?, health? } and is mounted at /api/<id>.
 * Modules receive shared services from core/ and must not import each other.
 */
export function createModules() {
  return [createFundamentalsModule(), createRagModule(), createStreamingModule()];
}
