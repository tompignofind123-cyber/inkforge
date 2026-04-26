import { ipcMain, type BrowserWindow } from "electron";
import type {
  LLMAnalyzeInput,
  LLMAnalyzeResponse,
  LLMChatInput,
  LLMChatResponse,
  LLMQuickActionInput,
  LLMQuickActionResponse,
  ipcChannels,
} from "@inkforge/shared";
import { startAnalysis } from "../services/analysis-service";
import { runQuickAction } from "../services/quick-action-service";
import { runChat } from "../services/chat-service";

const LLM_ANALYZE: typeof ipcChannels.llmAnalyze = "llm:analyze";
const LLM_QUICK: typeof ipcChannels.llmQuick = "llm:quick";
const LLM_CHAT: typeof ipcChannels.llmChat = "llm:chat";

export function registerLLMHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(LLM_ANALYZE, async (_event, input: LLMAnalyzeInput): Promise<LLMAnalyzeResponse> => {
    return startAnalysis({ input, window: getWindow() });
  });
  ipcMain.handle(LLM_QUICK, async (_event, input: LLMQuickActionInput): Promise<LLMQuickActionResponse> => {
    return runQuickAction(input);
  });
  ipcMain.handle(LLM_CHAT, async (_event, input: LLMChatInput): Promise<LLMChatResponse> => {
    return runChat(input);
  });
}
