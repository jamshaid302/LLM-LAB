import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { beginSse, formatSse, isAbortError, signalFromRequest } from "../../core/sse.js";

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

  router.post("/stream", async (req, res, next) => {
    const question = req.body?.question;
    if (typeof question !== "string" || !question.trim()) {
      next(new HttpError(400, "Missing 'question' in request body"));
      return;
    }

    beginSse(res);
    const link = signalFromRequest(res);
    const write = (chunk) => res.write(chunk);

    try {
      await rag.streamAnswer(question, { signal: link.signal, write });
    } catch (err) {
      if (!isAbortError(err) && !link.signal.aborted) {
        write(formatSse("error", { error: err.message }));
      }
    } finally {
      link.detach();
      res.end();
    }
  });

  router.post(
    "/reingest",
    asyncHandler(async (req, res) => {
      res.json({ status: "ok", chunks: await rag.ingest(), store: rag.storeKind });
    }),
  );

  router.post(
    "/eval",
    asyncHandler(async (req, res) => {
      res.json(await rag.evaluate());
    }),
  );

  return router;
}
