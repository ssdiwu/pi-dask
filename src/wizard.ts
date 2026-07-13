import type {
  Answer,
  AnswerValue,
  DaskRequest,
  DaskResult,
  Question,
} from "./index.js";

export type WizardPhase = "question" | "summary" | "completed" | "cancelled";

export interface DraftAnswer {
  selectedIds: number[];
  customValue?: string;
}

export interface WizardState {
  phase: WizardPhase;
  questionIndex: number;
  cursor: number;
  drafts: DraftAnswer[];
  result?: DaskResult;
}

export type WizardEvent =
  | { type: "move"; delta: number }
  | { type: "select" }
  | { type: "toggle" }
  | { type: "custom"; value: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "confirm" }
  | { type: "cancel" };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function currentQuestion(request: DaskRequest, state: WizardState): Question {
  return request.questions[state.questionIndex]!;
}

function draftFor(state: WizardState): DraftAnswer {
  return state.drafts[state.questionIndex]!;
}

function withDraft(state: WizardState, draft: DraftAnswer): WizardState {
  const drafts = state.drafts.slice();
  drafts[state.questionIndex] = draft;
  return { ...state, drafts };
}

function hasAnswer(draft: DraftAnswer): boolean {
  return draft.selectedIds.length > 0 || Boolean(draft.customValue?.trim());
}

function moveToNext(request: DaskRequest, state: WizardState): WizardState {
  if (state.questionIndex >= request.questions.length - 1) {
    return { ...state, phase: "summary", cursor: 0 };
  }
  return { ...state, questionIndex: state.questionIndex + 1, cursor: 0 };
}

function buildResult(request: DaskRequest, drafts: DraftAnswer[]): DaskResult {
  const answers: Answer[] = request.questions.map((question, questionIndex) => {
    const draft = drafts[questionIndex]!;
    const selected = new Set(draft.selectedIds);
    const value: AnswerValue[] = question.labels
      .filter((label) => selected.has(label.id))
      .map((label) => ({ source: "label" as const, value: label.value }));
    if (draft.customValue?.trim()) {
      value.push({ source: "custom", value: draft.customValue.trim() });
    }
    return { id: question.id, value };
  });
  return { answers };
}

export function createWizard(request: DaskRequest): WizardState {
  return {
    phase: "question",
    questionIndex: 0,
    cursor: 0,
    drafts: request.questions.map(() => ({ selectedIds: [] })),
  };
}

export function reduceWizard(
  request: DaskRequest,
  state: WizardState,
  event: WizardEvent,
): WizardState {
  if (state.phase === "completed" || state.phase === "cancelled") return state;
  if (event.type === "cancel") {
    const { result: _result, ...withoutResult } = state;
    return { ...withoutResult, phase: "cancelled" };
  }

  if (state.phase === "summary") {
    if (event.type === "back") {
      return {
        ...state,
        phase: "question",
        questionIndex: request.questions.length - 1,
        cursor: 0,
      };
    }
    if (event.type === "confirm") {
      return { ...state, phase: "completed", result: buildResult(request, state.drafts) };
    }
    return state;
  }

  const question = currentQuestion(request, state);
  const draft = draftFor(state);
  const maxCursor = question.labels.length;

  if (event.type === "move") {
    return { ...state, cursor: clamp(state.cursor + event.delta, 0, maxCursor) };
  }

  if (event.type === "back") {
    if (state.questionIndex === 0) return state;
    return { ...state, questionIndex: state.questionIndex - 1, cursor: 0 };
  }

  if (event.type === "custom") {
    const value = event.value.trim();
    if (!value) return state;
    const next = withDraft(state, {
      selectedIds: question.type === "single" ? [] : draft.selectedIds,
      customValue: value,
    });
    return question.type === "single" ? moveToNext(request, next) : { ...next, cursor: 0 };
  }

  if (event.type === "select") {
    if (question.type !== "single") return state;
    const label = question.labels[state.cursor];
    if (!label) return state;
    return moveToNext(request, withDraft(state, { selectedIds: [label.id] }));
  }

  if (event.type === "toggle") {
    if (question.type !== "multiple") return state;
    const label = question.labels[state.cursor];
    if (!label) return state;
    const selected = new Set(draft.selectedIds);
    if (selected.has(label.id)) selected.delete(label.id);
    else selected.add(label.id);
    return withDraft(state, { ...draft, selectedIds: [...selected] });
  }

  if (event.type === "next") {
    if (!hasAnswer(draft)) return state;
    return moveToNext(request, state);
  }

  return state;
}

export function currentDraft(state: WizardState): DraftAnswer {
  const draft = state.drafts[state.questionIndex]!;
  return { ...draft, selectedIds: draft.selectedIds.slice() };
}

export function isQuestionAnswered(state: WizardState): boolean {
  return hasAnswer(state.drafts[state.questionIndex]!);
}
