import { Router } from "express";

import { asyncHandler } from "../../core/http.js";

export function createProvidersRouter(service) {
  const router = Router();

  router.get(
    "/models",
    asyncHandler(async (req, res) => {
      res.json(service.listModels());
    }),
  );

  router.get(
    "/usage",
    asyncHandler(async (req, res) => {
      res.json({ calls: service.listUsage() });
    }),
  );

  router.post(
    "/complete",
    asyncHandler(async (req, res) => {
      res.json(await service.complete({ model: req.body?.model, prompt: req.body?.prompt }));
    }),
  );

  return router;
}
