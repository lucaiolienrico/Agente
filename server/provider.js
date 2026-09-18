import { createGroqProvider } from "./groq-provider.js";
import { createOpenAIProvider } from "./openai-provider.js";
export {
  validateResearch,
  providerSources,
  parseOutput,
} from "./provider-common.js";
export function createProvider(config, options = {}) {
  const provider = config.provider || "groq";
  if (provider === "groq") return createGroqProvider(config, options);
  if (provider === "openai") return createOpenAIProvider(config, options);
  throw new Error("AI_PROVIDER deve essere groq oppure openai.");
}
