import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { beginSse, formatSse, isAbortError, signalFromRequest } from "../../core/sse.js";
import { userIdFromHeader } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromHeader(req.get("X-User-Id"));
  if (!userId) throw new HttpError(400, "Choose local or guest");
  return userId;
}

export function createRagRouter(rag) {
  const router = Router();

  router.post(
    "/ask",
    asyncHandler(async (req, res) => {
      const { question } = req.body ?? {};
      if (!question) throw new HttpError(400, "Missing 'question' in request body");

      res.json(await rag.ask(question, userFrom(req)));
    }),
  );

  router.post("/stream", async (req, res, next) => {
    const question = req.body?.question;
    if (typeof question !== "string" || !question.trim()) {
      next(new HttpError(400, "Missing 'question' in request body"));
      return;
    }

    let userId;
    try {
      userId = userFrom(req);
    } catch (err) {
      next(err);
      return;
    }

    beginSse(res);
    const link = signalFromRequest(res);
    const write = (chunk) => res.write(chunk);

    try {
      await rag.streamAnswer(question, { signal: link.signal, write, userId });
    } catch (err) {
      if (!isAbortError(err) && !link.signal.aborted) {
        write(formatSse("error", { error: err.message }));
      }
    } finally {
      link.detach();
      res.end();
    }
  });

  router.get(
    "/documents",
    asyncHandler(async (req, res) => {
      res.json({ documents: await rag.listDocuments(userFrom(req)) });
    }),
  );

  router.get(
    "/documents/:filename",
    asyncHandler(async (req, res) => {
      res.json(await rag.documentStatus(req.params.filename, userFrom(req)));
    }),
  );

  router.delete(
    "/documents/:filename",
    asyncHandler(async (req, res) => {
      res.json(await rag.removeDocument(req.params.filename, userFrom(req)));
    }),
  );

  router.post(
    "/documents/:filename/retry",
    asyncHandler(async (req, res) => {
      res.status(202).json(await rag.retryDocument(req.params.filename, userFrom(req)));
    }),
  );

  router.post(
    "/documents",
    asyncHandler(async (req, res) => {
      const accepted = await rag.acceptDocument({
        filename: req.body?.filename,
        text: req.body?.text,
        data: req.body?.data,
        userId: userFrom(req),
      });
      res.status(202).json(accepted);
    }),
  );

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
