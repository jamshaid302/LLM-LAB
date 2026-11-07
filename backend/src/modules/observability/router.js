import { Router } from "express";

import { asyncHandler } from "../../core/http.js";

export function createObservabilityRouter(log) {
  const router = Router();

  router.get(
    "/traces",
    asyncHandler(async (_req, res) => {
      res.json({ traces: log.list() });
    }),
  );

  return router;
}
