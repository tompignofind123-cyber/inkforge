import { OpenAIProvider, type OpenAIProviderConfig } from "./openai-provider";

/**
 * OpenAI-compatible provider (DeepSeek, Moonshot, Groq, Ollama, etc).
 * Behaves identically to OpenAIProvider but marks chunks with vendor="openai-compat"
 * and requires an explicit baseUrl.
 */
export class OpenAICompatProvider extends OpenAIProvider {
  constructor(config: Omit<OpenAIProviderConfig, "vendor"> & { baseUrl: string }) {
    if (!config.baseUrl || !config.baseUrl.trim()) {
      throw new Error("openai-compat provider requires a non-empty baseUrl");
    }
    super({ ...config, vendor: "openai-compat" });
  }
}
