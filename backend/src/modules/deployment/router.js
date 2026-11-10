import { Router } from "express";

import { config } from "../../core/config.js";

export function deploymentInfo() {
  return {
    image: "backend/Dockerfile",
    workflow: ".github/workflows/test.yml",
    ollama: config.ollama.baseUrl,
    store: config.rag.store,
    chroma: config.rag.chromaUrl,
    mongo: config.mongo.url,
    note: "Ollama stays on the host. A chat call times out after two minutes and is tried once more. The test workflow runs the backend tests and builds this image. It does not score retrieval. Those tests check that the committed baseline stays at recall 1 and MRR 1. The frontend image is frontend/Dockerfile.",
    timeoutMs: config.ollama.timeoutMs,
    retries: 1,
    frontend: "frontend/Dockerfile",
  };
}

export function createDeploymentRouter() {
  const router = Router();
  router.get("/", (req, res) => {
    res.json(deploymentInfo());
  });
  return router;
}
