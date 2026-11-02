import { Router } from "express";

import { asyncHandler } from "../../core/http.js";

import { parseSampling } from "./sampling.js";

export function createFundamentalsRouter(runner) {
  const router = Router();

  router.post(
    "/complete",
    asyncHandler(async (req, res) => {
      // Validate before the model is called, so a bad setting never spends a generation.
      const settings = parseSampling(req.body ?? {});
      res.json(await runner.complete(settings));
    }),
  );

  router.post(
    "/patterns",
    asyncHandler(async (req, res) => {
      res.json(await runner.comparePatterns(req.body ?? {}));
    }),
  );

  return router;
}
