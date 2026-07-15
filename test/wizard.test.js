import test from "node:test";
import assert from "node:assert/strict";
import { createWizard, currentDraft, reduceWizard } from "../dist/src/wizard.js";

const request = {
  questions: [
    {
      id: "priority",
      title: "Priority",
      description: "Choose one",
      type: "single",
      labels: [
        { id: 1, label: "Fast", value: "fast", description: "Ship sooner" },
        { id: 2, label: "Complete", value: "complete", description: "Cover more" },
      ],
    },
    {
      id: "scope",
      title: "Scope",
      description: "Choose many",
      type: "multiple",
      labels: [
        { id: 1, label: "Docs", value: "docs", description: "Document it" },
        { id: 2, label: "Tests", value: "tests", description: "Test it" },
      ],
    },
  ],
};

const reduce = (state, ...events) => events.reduce((current, event) => reduceWizard(request, current, event), state);

test("single selection and multiple selection return ordered answer values", () => {
  let state = createWizard(request);
  state = reduce(state, { type: "move", delta: 1 }, { type: "select" });
  state = reduce(state, { type: "toggle" }, { type: "move", delta: 1 }, { type: "toggle" }, { type: "next" });
  state = reduce(state, { type: "confirm" });
  assert.deepEqual(state.result, {
    answers: [
      { id: "priority", value: [{ source: "label", value: "complete" }] },
      { id: "scope", value: [{ source: "label", value: "docs" }, { source: "label", value: "tests" }] },
    ],
  });
});

test("custom value can coexist with multiple labels", () => {
  let state = createWizard(request);
  state = reduce(state, { type: "select" }, { type: "toggle" }, { type: "custom", value: "also prototype" });
  assert.equal(state.cursor, 0);
  state = reduce(state, { type: "next" }, { type: "confirm" });
  assert.deepEqual(state.result.answers[1].value, [
    { source: "label", value: "docs" },
    { source: "custom", value: "also prototype" },
  ]);
});

test("single custom input replaces a previous enum selection", () => {
  let state = createWizard(request);
  state = reduce(state, { type: "select" }, { type: "back" }, { type: "custom", value: "prototype first" }, { type: "toggle" }, { type: "next" }, { type: "confirm" });
  assert.deepEqual(state.result.answers[0].value, [{ source: "custom", value: "prototype first" }]);
});

test("back preserves edits and summary returns to the last question", () => {
  let state = createWizard(request);
  state = reduce(state, { type: "select" }, { type: "toggle" }, { type: "next" }, { type: "back" });
  assert.equal(state.phase, "question");
  assert.equal(state.questionIndex, 1);
  assert.deepEqual(currentDraft(state), { selectedIds: [1] });

  state = reduce(state, { type: "back" }, { type: "move", delta: 1 }, { type: "select" });
  assert.equal(state.questionIndex, 1);
  assert.deepEqual(state.drafts[0], { selectedIds: [2] });
  assert.deepEqual(currentDraft(state), { selectedIds: [1] });
});

test("next does not advance an unanswered multiple question", () => {
  let state = createWizard(request);
  state = reduce(state, { type: "select" }, { type: "next" });
  assert.equal(state.questionIndex, 1);
  state = reduce(state, { type: "next" });
  assert.equal(state.phase, "question");
  assert.equal(state.questionIndex, 1);
});

test("jump enters unanswered questions and preserves drafts across navigation", () => {
  let state = createWizard(request);
  state = reduce(state, { type: "jump", questionIndex: 1 });
  assert.equal(state.questionIndex, 1);
  assert.deepEqual(currentDraft(state), { selectedIds: [] });

  state = reduce(state, { type: "toggle" }, { type: "jump", questionIndex: 0 });
  assert.equal(state.questionIndex, 0);
  assert.deepEqual(currentDraft(state), { selectedIds: [] });

  state = reduce(state, { type: "move", delta: 1 }, { type: "select" });
  assert.equal(state.questionIndex, 1);
  assert.deepEqual(currentDraft(state), { selectedIds: [1] });

  const beforeInvalidJump = state;
  state = reduce(state, { type: "jump", questionIndex: request.questions.length });
  assert.strictEqual(state, beforeInvalidJump);
});

test("confirming an incomplete summary returns to the first unanswered question", () => {
  let state = createWizard(request);
  state = reduce(
    state,
    { type: "jump", questionIndex: 1 },
    { type: "toggle" },
    { type: "next" },
  );
  assert.equal(state.phase, "summary");

  state = reduce(state, { type: "confirm" });
  assert.equal(state.phase, "question");
  assert.equal(state.questionIndex, 0);
  assert.equal(state.result, undefined);
  assert.deepEqual(state.drafts[1], { selectedIds: [1] });
});

test("cancel is terminal and never exposes a result", () => {
  let state = createWizard(request);
  state = reduce(state, { type: "select" }, { type: "toggle" });
  state = reduce(state, { type: "cancel" });
  assert.equal(state.phase, "cancelled");
  assert.equal(state.result, undefined);
});
