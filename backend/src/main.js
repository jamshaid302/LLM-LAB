import { createApp } from "./app.js";
import { config } from "./core/config.js";
import { assertOllamaReady } from "./core/ollama.js";
import { createModules } from "./modules/index.js";

const modules = createModules();
const app = createApp(modules);

app.listen(config.ports.api, async () => {
  console.log(`AI Lab API running on http://localhost:${config.ports.api}`);
  console.log(`Modules: ${modules.map((m) => m.id).join(", ")}`);

  try {
    await assertOllamaReady({ requireModels: [config.ollama.chatModel, config.ollama.embedModel] });
  } catch (err) {
    console.error(`Ollama check failed: ${err.message}`);
    return;
  }

  // One module failing to initialize must not take the others down.
  for (const module of modules) {
    if (!module.init) continue;
    try {
      console.log(`[${module.id}] ${await module.init()}`);
    } catch (err) {
      console.error(`[${module.id}] init failed: ${err.message}`);
    }
  }
});
