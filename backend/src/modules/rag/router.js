import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";

export function createRagRouter(rag) {
  const router = Router();

  router.post(
    "/ask",
    asyncHandler(async (req, res) => {
      const { question } = req.body ?? {};
      if (!question) throw new HttpError(400, "Missing 'question' in request body");

      res.json(await rag.ask(question));
    }),
  );

  router.post(
    "/reingest",
    asyncHandler(async (req, res) => {
      res.json({ status: "ok", chunks: await rag.ingest() });
    }),
  );

  return router;
}
