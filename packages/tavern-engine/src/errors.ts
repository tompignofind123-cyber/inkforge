export class TavernRuntimeError extends Error {
  readonly code: string;
  readonly causeValue?: unknown;

  constructor(code: string, message: string, causeValue?: unknown) {
    super(message);
    this.name = "TavernRuntimeError";
    this.code = code;
    this.causeValue = causeValue;
  }
}
