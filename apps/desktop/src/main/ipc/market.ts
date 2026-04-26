import { ipcMain } from "electron";
import type {
  MarketFetchRegistryInput,
  MarketRegistryDTO,
  MarketInstallSkillInput,
  MarketInstallSkillResponse,
  MarketBuildPublishBundleInput,
  MarketBuildPublishBundleResponse,
} from "@inkforge/shared";
import { ipcChannels } from "@inkforge/shared";
import {
  buildMarketPublishBundle,
  fetchMarketRegistry,
  installSkillFromMarket,
} from "../services/market-service";

export function registerMarketHandlers(): void {
  ipcMain.handle(
    ipcChannels.marketFetchRegistry,
    async (_event, input: MarketFetchRegistryInput): Promise<MarketRegistryDTO> =>
      fetchMarketRegistry(input ?? {}),
  );
  ipcMain.handle(
    ipcChannels.marketInstallSkill,
    async (
      _event,
      input: MarketInstallSkillInput,
    ): Promise<MarketInstallSkillResponse> => installSkillFromMarket(input),
  );
  ipcMain.handle(
    ipcChannels.marketBuildPublishBundle,
    async (
      _event,
      input: MarketBuildPublishBundleInput,
    ): Promise<MarketBuildPublishBundleResponse> =>
      buildMarketPublishBundle(input),
  );
}
