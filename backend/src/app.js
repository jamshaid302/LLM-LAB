import cors from "cors";
import express from "express";

import { config } from "./core/config.js";
import { errorHandler } from "./core/http.js";

export function createApp(modules) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      chatModel: config.ollama.chatModel,
      embedModel: config.ollama.embedModel,
      modules: Object.fromEntries(modules.map((m) => [m.id, m.health?.() ?? {}])),
    });
  });

  app.get("/api/modules", (req, res) => {
    res.json(modules.map(({ id, name }) => ({ id, name })));
  });

  for (const module of modules) {
    app.use(`/api/${module.id}`, module.router);
  }

  app.use("/api", (req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
  });
  app.use(errorHandler);

  return app;
}
