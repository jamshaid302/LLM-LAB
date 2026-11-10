import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { userIdFromHeader } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromHeader(req.get("X-User-Id"));
  if (!userId) throw new HttpError(400, "Choose local or guest");
  return userId;
}

export function createHallucinationRouter(service) {
  const router = Router();

  router.post(
    "/check",
    asyncHandler(async (req, res) => {
      res.json(await service.check(req.body?.question, userFrom(req)));
    }),
  );

  return router;
}
