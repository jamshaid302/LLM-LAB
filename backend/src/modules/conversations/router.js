import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { beginSse, formatSse, isAbortError, signalFromRequest } from "../../core/sse.js";
import { userIdFromRequest } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromRequest(req);
  if (!userId) throw new HttpError(400, "Choose local or guest");
  return userId;
}

export function createConversationsRouter(service) {
  const router = Router();

  router.get(
    "/threads",
    asyncHandler(async (req, res) => {
      res.json({ threads: await service.listThreads(userFrom(req)) });
    }),
  );

  router.post(
    "/threads",
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createThread(userFrom(req)));
    }),
  );

  router.get(
    "/threads/:id/messages",
    asyncHandler(async (req, res) => {
      res.json(await service.listMessages(req.params.id, userFrom(req)));
    }),
  );

  router.post("/threads/:id/stream", async (req, res, next) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      next(new HttpError(400, "Missing 'message'"));
      return;
    }
    if (message.trim().length > 4000) {
      next(new HttpError(400, "Message must be at most 4000 characters"));
      return;
    }

    let userId;
    try {
      userId = userFrom(req);
    } catch (err) {
      next(err);
      return;
    }

    try {
      await (service.getThread ? service.getThread(req.params.id, userId) : service.listMessages(req.params.id, userId));
    } catch (err) {
      next(err);
      return;
    }

    beginSse(res);
    const link = signalFromRequest(res);
    const write = (chunk) => res.write(chunk);

    try {
      await service.streamReply({
        threadId: req.params.id,
        message,
        userId,
        signal: link.signal,
        write,
      });
    } catch (err) {
      if (!isAbortError(err) && !link.signal.aborted) {
        write(formatSse("error", { error: err.message }));
      }
    } finally {
      link.detach();
      if (!res.writableEnded) res.end();
    }
  });

  return router;
}
