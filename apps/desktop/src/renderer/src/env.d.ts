/// <reference types="vite/client" />
import type { InkforgeApi } from "@inkforge/shared";

declare global {
  interface Window {
    inkforge: InkforgeApi;
  }
}

export {};
