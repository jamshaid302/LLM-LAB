import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { userIdFromHeader } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromHeader(req.get("X-User-Id"));
  if (!userId) throw new HttpError(400, "Choose local or guest");
  return userId;
}

export function createEvaluationRouter(service) {
  const router = Router();

  router.post(
    "/run",
    asyncHandler(async (req, res) => {
      res.json(await service.score(userFrom(req)));
    }),
  );

  return router;
}
