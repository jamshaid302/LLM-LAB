import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { userIdFromHeader } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromHeader(req.get("X-User-Id"));
  if (!userId) throw new HttpError(400, "Choose local or guest");
  return userId;
}

export function createSemanticSearchRouter(service) {
  const router = Router();

  router.post(
    "/query",
    asyncHandler(async (req, res) => {
      res.json(await service.query(req.body?.query, userFrom(req)));
    }),
  );

  return router;
}
