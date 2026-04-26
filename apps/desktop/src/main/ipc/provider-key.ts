import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import {
  deleteProviderKey,
  getProviderKeyPersistenceRecord,
  insertProviderKey,
  listProviderKeys,
  updateProviderKey,
  updateProviderKeyStrategy,
} from "@inkforge/storage";
import type {
  ProviderHealthSnapshot,
  ProviderKeyDeleteInput,
  ProviderKeyHealthInput,
  ProviderKeyListInput,
  ProviderKeyRecord,
  ProviderKeySetDisabledInput,
  ProviderKeyUpsertInput,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import { getProviderHealth } from "../services/llm-runtime";

const PROVIDER_KEY_LIST: typeof ipcChannels.providerKeyList = "provider-key:list";
const PROVIDER_KEY_UPSERT: typeof ipcChannels.providerKeyUpsert = "provider-key:upsert";
const PROVIDER_KEY_DELETE: typeof ipcChannels.providerKeyDelete = "provider-key:delete";
const PROVIDER_KEY_SET_DISABLED: typeof ipcChannels.providerKeySetDisabled =
  "provider-key:set-disabled";
const PROVIDER_KEY_HEALTH: typeof ipcChannels.providerKeyHealth = "provider-key:health";

export function registerProviderKeyHandlers(): void {
  ipcMain.handle(
    PROVIDER_KEY_LIST,
    async (_event, input: ProviderKeyListInput): Promise<ProviderKeyRecord[]> => {
      const ctx = getAppContext();
      return listProviderKeys(ctx.db, input.providerId);
    },
  );

  ipcMain.handle(
    PROVIDER_KEY_UPSERT,
    async (_event, input: ProviderKeyUpsertInput): Promise<ProviderKeyRecord> => {
      const ctx = getAppContext();
      if (input.strategy || typeof input.cooldownMs === "number") {
        updateProviderKeyStrategy(ctx.db, {
          id: input.providerId,
          keyStrategy: input.strategy,
          cooldownMs: input.cooldownMs,
        });
      }

      const id = input.id ?? randomUUID();
      const existing = input.id
        ? getProviderKeyPersistenceRecord(ctx.db, input.id)
        : null;

      if (input.apiKey && input.apiKey.trim().length > 0) {
        const keyResult = await ctx.keystore.setKey(id, input.apiKey);
        if (existing) {
          return updateProviderKey(ctx.db, {
            id: existing.id,
            label: input.label,
            encrypted: keyResult.encrypted ?? null,
            storedInKeychain: keyResult.storedInKeychain,
            weight: input.weight,
            disabled: input.disabled,
          });
        }
        return insertProviderKey(ctx.db, {
          id,
          providerId: input.providerId,
          label: input.label,
          encrypted: keyResult.encrypted ?? null,
          storedInKeychain: keyResult.storedInKeychain,
          weight: input.weight,
          disabled: input.disabled,
        });
      }

      if (existing) {
        return updateProviderKey(ctx.db, {
          id: existing.id,
          label: input.label,
          weight: input.weight,
          disabled: input.disabled,
        });
      }
      throw new Error("provider-key:upsert requires apiKey when creating a new key");
    },
  );

  ipcMain.handle(
    PROVIDER_KEY_DELETE,
    async (_event, input: ProviderKeyDeleteInput): Promise<{ id: string }> => {
      const ctx = getAppContext();
      try {
        await ctx.keystore.deleteKey(input.id);
      } catch {
        /* ignore */
      }
      deleteProviderKey(ctx.db, input.id);
      return { id: input.id };
    },
  );

  ipcMain.handle(
    PROVIDER_KEY_SET_DISABLED,
    async (_event, input: ProviderKeySetDisabledInput): Promise<ProviderKeyRecord> => {
      const ctx = getAppContext();
      return updateProviderKey(ctx.db, { id: input.id, disabled: input.disabled });
    },
  );

  ipcMain.handle(
    PROVIDER_KEY_HEALTH,
    async (_event, input: ProviderKeyHealthInput): Promise<ProviderHealthSnapshot> => {
      return getProviderHealth(input.providerId);
    },
  );
}
