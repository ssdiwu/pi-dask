import type { DaskRequest, Label, Question, Scalar } from "./index.js";

export class DaskValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "DaskValidationError";
    this.path = path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is Scalar {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DaskValidationError(path, "must be a non-empty string");
  }
  return value;
}

function parseLabel(value: unknown, path: string): Label {
  if (!isRecord(value)) throw new DaskValidationError(path, "must be an object");
  const id = value.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    throw new DaskValidationError(`${path}.id`, "must be a positive safe integer");
  }
  if (!isScalar(value.value)) {
    throw new DaskValidationError(`${path}.value`, "must be a string, finite number, or boolean");
  }
  return {
    id,
    label: requireString(value.label, `${path}.label`),
    value: value.value,
    description: requireString(value.description, `${path}.description`),
  };
}

function parseQuestion(value: unknown, index: number): Question {
  const path = `questions[${index}]`;
  if (!isRecord(value)) throw new DaskValidationError(path, "must be an object");

  const id = requireString(value.id, `${path}.id`);
  const title = requireString(value.title, `${path}.title`);
  const description = requireString(value.description, `${path}.description`);
  const type = value.type;
  if (type !== "single" && type !== "multiple") {
    throw new DaskValidationError(`${path}.type`, 'must be "single" or "multiple"');
  }
  if (!Array.isArray(value.labels)) {
    throw new DaskValidationError(`${path}.labels`, "must be an array");
  }

  const min = 2;
  const max = type === "single" ? 5 : 12;
  if (value.labels.length < min || value.labels.length > max) {
    throw new DaskValidationError(
      `${path}.labels`,
      `${type} questions require ${min}-${max} labels`,
    );
  }

  const labels = value.labels.map((label, labelIndex) => parseLabel(label, `${path}.labels[${labelIndex}]`));
  const values: Scalar[] = [];
  for (let labelIndex = 0; labelIndex < labels.length; labelIndex++) {
    const label = labels[labelIndex]!;
    const expectedId = labelIndex + 1;
    if (label.id !== expectedId) {
      throw new DaskValidationError(`${path}.labels[${labelIndex}].id`, `must be ${expectedId} to match its display order`);
    }
    if (values.some((existing) => existing === label.value)) {
      throw new DaskValidationError(
        `${path}.labels[${labelIndex}].value`,
        "must be unique within the question",
      );
    }
    values.push(label.value);
  }

  return { id, title, description, type, labels };
}

export function validateRequest(input: unknown): DaskRequest {
  if (!isRecord(input) || !Array.isArray(input.questions)) {
    throw new DaskValidationError("questions", "must be an array");
  }
  if (input.questions.length === 0) {
    throw new DaskValidationError("questions", "must contain at least one question");
  }

  const questions = input.questions.map(parseQuestion);
  const ids = new Set<string>();
  for (let index = 0; index < questions.length; index++) {
    const question = questions[index]!;
    if (ids.has(question.id)) {
      throw new DaskValidationError(`questions[${index}].id`, "must be unique within the request");
    }
    ids.add(question.id);
  }
  return { questions };
}
