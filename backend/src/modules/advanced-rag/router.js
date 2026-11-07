import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { userIdFromHeader } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromHeader(req.get("X-User-Id"));
  if (!userId) throw new HttpError(400, "Choose local or guest");
  return userId;
}

export function createAdvancedRagRouter(service) {
  const router = Router();

  router.post(
    "/compare",
    asyncHandler(async (req, res) => {
      res.json(await service.compare(userFrom(req)));
    }),
  );

  return router;
}
