import { Router } from "express";

import { HttpError } from "../../core/http.js";
import { beginSse, formatSse, isAbortError, signalFromRequest } from "../../core/sse.js";

export function createStreamingRouter(service) {
  const router = Router();

  router.post("/chat", async (req, res, next) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      next(new HttpError(400, "Missing 'message'"));
      return;
    }
    if (message.trim().length > 4000) {
      next(new HttpError(400, "Message must be at most 4000 characters"));
      return;
    }

    beginSse(res);
    const link = signalFromRequest(res);
    const write = (chunk) => res.write(chunk);

    try {
      await service.chat({ message, signal: link.signal, write });
    } catch (err) {
      if (!isAbortError(err) && !link.signal.aborted) {
        write(formatSse("error", { error: err.message }));
      }
    } finally {
      link.detach();
      res.end();
    }
  });

  return router;
}
