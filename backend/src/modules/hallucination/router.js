import { Router } from "express";

import { HttpError, asyncHandler } from "../../core/http.js";
import { userIdFromRequest } from "../../core/users.js";

function userFrom(req) {
  const userId = userIdFromRequest(req);
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

  router.post(
    "/judge",
    asyncHandler(async (req, res) => {
      res.json(await service.judge(req.body?.question, userFrom(req)));
    }),
  );

  return router;
}
