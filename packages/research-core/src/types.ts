export type {
  ResearchNoteRecord,
  ResearchProvider,
  ResearchSearchHit,
} from "@inkforge/shared";

export class ResearchError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ResearchError";
    this.code = code;
  }
}
