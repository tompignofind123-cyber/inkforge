import type { SkillValidationIssue } from "./validate";

export class SkillValidationError extends Error {
  readonly issues: SkillValidationIssue[];

  constructor(message: string, issues: SkillValidationIssue[]) {
    super(message);
    this.name = "SkillValidationError";
    this.issues = issues;
  }
}

export class SkillRuntimeError extends Error {
  readonly code: string;
  readonly causeValue?: unknown;

  constructor(code: string, message: string, causeValue?: unknown) {
    super(message);
    this.name = "SkillRuntimeError";
    this.code = code;
    this.causeValue = causeValue;
  }
}
