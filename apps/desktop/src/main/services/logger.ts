import log from "electron-log/main";
import * as path from "path";
import { app } from "electron";

let initialized = false;

const SENSITIVE_KEYS = ["apiKey", "api_key", "password", "token", "secret"];

function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (/sk-[A-Za-z0-9\-_]{8,}/.test(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

export function initLogger(): void {
  if (initialized) return;
  initialized = true;

  const userDataDir = app.getPath("userData");
  const logDir = path.join(userDataDir, "logs");
  log.transports.file.resolvePathFn = () => path.join(logDir, "main.log");
  log.transports.file.level = "warn";
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.console.level = process.env.NODE_ENV === "development" ? "info" : "warn";

  log.hooks.push((message) => {
    message.data = (message.data as unknown[]).map((d) => sanitize(d));
    return message;
  });
}

export const logger = log;
