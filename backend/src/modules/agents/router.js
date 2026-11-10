import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { userIdFromRequest } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromRequest(req);
  if (!userId) throw new HttpError(400, "Choose local or guest");
  return userId;
}

export function createAgentsRouter(service) {
  const router = Router();

  router.post(
    "/run",
    asyncHandler(async (req, res) => {
      res.json(await service.run(req.body?.task, userFrom(req)));
    }),
  );

  return router;
}
