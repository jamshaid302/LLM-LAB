import { createDeploymentRouter } from "./router.js";

export function createDeploymentModule() {
  return {
    id: "deployment",
    name: "Deployment",
    router: createDeploymentRouter(),
    health() {
      return { image: "dockerfile", workflow: "tests" };
    },
  };
}
