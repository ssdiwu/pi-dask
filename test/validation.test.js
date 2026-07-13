import test from "node:test";
import assert from "node:assert/strict";
import { DaskValidationError, validateRequest } from "../dist/src/validation.js";

const label = (id, value) => ({ id, label: `Option ${id}`, value, description: `Why option ${id}` });
const question = (type = "single", labels = [label(1, "a"), label(2, "b")]) => ({
  id: "q1",
  title: "Pick one",
  description: "Choose a path",
  type,
  labels,
});

test("accepts valid single and multiple requests", () => {
  assert.equal(validateRequest({ questions: [question()] }).questions[0].type, "single");
  assert.equal(validateRequest({ questions: [question("multiple")] }).questions[0].labels.length, 2);
});

test("rejects invalid question type and label counts", () => {
  assert.throws(() => validateRequest({ questions: [question("other")] }), DaskValidationError);
  assert.throws(() => validateRequest({ questions: [question("single", [label(1, "a")])] }), DaskValidationError);
  assert.throws(
    () => validateRequest({ questions: [question("multiple", Array.from({ length: 13 }, (_, i) => label(i, i)))] }),
    DaskValidationError,
  );
});

test("rejects duplicate values and non-scalar values", () => {
  assert.throws(() => validateRequest({ questions: [question("single", [label(1, "same"), label(2, "same")])] }), DaskValidationError);
  assert.throws(() => validateRequest({ questions: [question("single", [label(1, 0), label(2, -0)])] }), DaskValidationError);
  assert.throws(() => validateRequest({ questions: [question("single", [label(1, {}), label(2, "b")])] }), DaskValidationError);
});

test("rejects duplicate question and option ids", () => {
  assert.throws(() => validateRequest({ questions: [question(), { ...question(), id: "q1" }] }), DaskValidationError);
  assert.throws(() => validateRequest({ questions: [question("single", [label(1, "a"), label(1, "b")])] }), DaskValidationError);
});
