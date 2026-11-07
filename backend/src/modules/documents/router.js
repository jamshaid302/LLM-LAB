import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { userIdFromHeader } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromHeader(req.get("X-User-Id"));
  if (!userId) throw new HttpError(400, "Choose local or guest");
  return userId;
}

export function createDocumentPipelineRouter(service) {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json({ documents: await service.list(userFrom(req)) });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const accepted = await service.accept({
        filename: req.body?.filename,
        text: req.body?.text,
        data: req.body?.data,
        userId: userFrom(req),
      });
      res.status(202).json(accepted);
    }),
  );

  router.get(
    "/:filename",
    asyncHandler(async (req, res) => {
      res.json(await service.status(req.params.filename, userFrom(req)));
    }),
  );

  router.delete(
    "/:filename",
    asyncHandler(async (req, res) => {
      res.json(await service.remove(req.params.filename, userFrom(req)));
    }),
  );

  router.post(
    "/:filename/retry",
    asyncHandler(async (req, res) => {
      res.status(202).json(await service.retry(req.params.filename, userFrom(req)));
    }),
  );

  return router;
}
