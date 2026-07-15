import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Editor, Key, matchesKey, Text, wrapTextWithAnsi, type EditorTheme } from "@earendil-works/pi-tui";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import type { DaskRequest, DaskResult, Question } from "./index.js";
import { validateRequest } from "./validation.js";
import { createWizard, currentDraft, reduceWizard, type WizardState } from "./wizard.js";

const ScalarSchema = Type.Union([Type.String(), Type.Number(), Type.Boolean()]);
const LabelSchema = Type.Object({
  id: Type.Integer({
    minimum: 1,
    description: "用户可见的选项序号；同一道题中必须按显示顺序从 1 开始连续递增：1、2、……、N。",
  }),
  label: Type.String(),
  value: ScalarSchema,
  description: Type.String(),
});
const QuestionSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.String(),
  type: StringEnum(["single", "multiple"] as const),
  labels: Type.Array(LabelSchema),
});
const DaskParamsSchema = Type.Object({ questions: Type.Array(QuestionSchema) });
type DaskParams = Static<typeof DaskParamsSchema>;

function answerText(result: DaskResult): string {
  return result.answers
    .map((answer) => `${answer.id}: ${answer.value.map((value) => `${value.source}=${String(value.value)}`).join(", ")}`)
    .join("\n");
}

function displayAnswer(question: Question, state: WizardState): string {
  const draft = state.drafts[question === undefined ? 0 : state.questionIndex]!;
  const selected = new Set(draft.selectedIds);
  const labels = question.labels.filter((label) => selected.has(label.id)).map((label) => label.label);
  if (draft.customValue) labels.push(`其他：${draft.customValue}`);
  return labels.join("、") || "未选择";
}

function createWizardComponent(
  ctx: ExtensionContext,
  request: DaskRequest,
  done: (result: DaskResult | undefined) => void,
) {
  return (tui: { requestRender(): void }, theme: any) => {
    let state = createWizard(request);
    let inputMode = false;
    let cachedLines: string[] | undefined;

    const editorTheme: EditorTheme = {
      borderColor: (text) => theme.fg("accent", text),
      selectList: {
        selectedPrefix: (text: string) => theme.fg("accent", text),
        selectedText: (text: string) => theme.fg("accent", text),
        description: (text: string) => theme.fg("muted", text),
        scrollInfo: (text: string) => theme.fg("dim", text),
        noMatch: (text: string) => theme.fg("warning", text),
      },
    };
    const editor = new Editor(tui as never, editorTheme);

    const refresh = () => {
      cachedLines = undefined;
      tui.requestRender();
    };

    const dispatch = (event: Parameters<typeof reduceWizard>[2]) => {
      state = reduceWizard(request, state, event);
      if (state.phase === "completed") done(state.result);
      else if (state.phase === "cancelled") done(undefined);
      refresh();
    };

    editor.onSubmit = (value) => {
      if (!inputMode) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      inputMode = false;
      editor.setText("");
      dispatch({ type: "custom", value: trimmed });
    };

    const startCustomInput = () => {
      inputMode = true;
      editor.setText(currentDraft(state).customValue ?? "");
      refresh();
    };

    const handleInput = (data: string) => {
      if (inputMode) {
        if (matchesKey(data, Key.escape)) {
          inputMode = false;
          editor.setText("");
          refresh();
          return;
        }
        editor.handleInput(data);
        refresh();
        return;
      }

      if (matchesKey(data, Key.escape)) {
        dispatch({ type: "cancel" });
        return;
      }
      if (state.phase === "summary") {
        if (matchesKey(data, Key.enter)) dispatch({ type: "confirm" });
        else if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace)) dispatch({ type: "back" });
        return;
      }
      if (matchesKey(data, Key.up)) dispatch({ type: "move", delta: -1 });
      else if (matchesKey(data, Key.down)) dispatch({ type: "move", delta: 1 });
      else if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace)) dispatch({ type: "back" });
      else if (state.questionIndex >= 0) {
        const question = request.questions[state.questionIndex]!;
        const isOther = state.cursor === question.labels.length;
        if (isOther && matchesKey(data, Key.enter)) startCustomInput();
        else if (question.type === "multiple" && matchesKey(data, Key.space)) dispatch({ type: "toggle" });
        else if (matchesKey(data, Key.enter)) {
          if (question.type === "single") dispatch({ type: "select" });
          else dispatch({ type: "next" });
        }
      }
    };

    const render = (width: number): string[] => {
      if (cachedLines) return cachedLines;
      const lines: string[] = [];
      const question = state.phase === "question" ? request.questions[state.questionIndex]! : undefined;
      const add = (text: string) => lines.push(...wrapTextWithAnsi(text, Math.max(1, width)));
      add(theme.fg("accent", "─".repeat(Math.max(1, width))));
      if (state.phase === "summary") {
        add(theme.fg("accent", theme.bold("答案摘要")));
        lines.push("");
        request.questions.forEach((item, index) => {
          const itemState = { ...state, questionIndex: index };
          add(`${item.title}: ${displayAnswer(item, itemState)}`);
        });
        lines.push("");
        add(theme.fg("dim", "Enter 确认提交 · ← 返回修改 · Esc 取消"));
      } else if (question) {
        add(theme.fg("text", question.title));
        add(theme.fg("muted", question.description));
        lines.push("");
        question.labels.forEach((label, index) => {
          const selected = question.type === "multiple" && state.drafts[state.questionIndex]!.selectedIds.includes(label.id);
          const prefix = state.cursor === index ? theme.fg("accent", "> ") : "  ";
          const mark = question.type === "multiple" ? (selected ? "[x] " : "[ ] ") : "";
          add(`${prefix}${mark}${label.id}. ${label.label}`);
          add(`     ${theme.fg("muted", label.description)}`);
        });
        const otherIndex = question.labels.length;
        const customSelected = Boolean(state.drafts[state.questionIndex]!.customValue);
        const prefix = state.cursor === otherIndex ? theme.fg("accent", "> ") : "  ";
        add(`${prefix}${customSelected ? "[x] " : "    "}其他（自行填写）`);
        if (customSelected) add(`     ${theme.fg("muted", state.drafts[state.questionIndex]!.customValue!)}`);
        if (inputMode) {
          lines.push("");
          add(theme.fg("muted", "请输入补充内容："));
          for (const line of editor.render(Math.max(1, width - 2))) add(` ${line}`);
          add(theme.fg("dim", "Enter 提交 · Esc 返回选项"));
        } else {
          lines.push("");
          add(theme.fg("dim", question.type === "multiple" ? "↑↓ 移动 · Space 选择 · Enter 下一题 · ← 返回 · Esc 取消" : "↑↓ 移动 · Enter 选择 · ← 返回 · Esc 取消"));
        }
      }
      add(theme.fg("accent", "─".repeat(Math.max(1, width))));
      cachedLines = lines;
      return lines;
    };

    return {
      render,
      invalidate: () => {
        cachedLines = undefined;
      },
      handleInput,
    };
  };
}

export default function dask(pi: ExtensionAPI) {
  pi.registerTool({
    name: "dask",
    label: "Dask",
    description: "向用户收集平铺的枚举式单选或复选答案。仅在确认确实需要用户决策，且问题已收敛为单选 2–5 项或复选 2–12 项后调用；此时应使用本工具，不要在回复正文中直接列出编号选项，即使当前只有一道题。将当前已知且互不依赖的问题合并到一次 questions 请求；若某题是否出现、题意或选项依赖另一答案，则在获得该答案后另行调用。不要用本工具承接开放式探索，也不要把调用方本应自行收口的工程细节转交给用户。每题 labels 必须按显示顺序使用从 1 开始的连续 ID；TUI 会在选项前显示这些 ID，用户可在“其他（自行填写）”中按编号指代选项。",
    parameters: DaskParamsSchema,
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (ctx.mode !== "tui") throw new Error("dask requires interactive TUI mode");
      const request = validateRequest(params as DaskParams);
      const result = await ctx.ui.custom<DaskResult | undefined>((tui, theme, _keybindings, done) => {
        return createWizardComponent(ctx, request, done)(tui, theme);
      });
      if (!result) throw new Error("User cancelled dask");
      return {
        content: [{ type: "text", text: answerText(result) }],
        details: result,
      };
    },
    renderCall(args, theme) {
      const rawArgs = args as { questions?: unknown };
      const questions = Array.isArray(rawArgs.questions) ? rawArgs.questions.length : 0;
      return new Text(theme.fg("toolTitle", theme.bold("dask ")) + theme.fg("muted", `${questions} question(s)`), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as DaskResult | undefined;
      return new Text(details ? theme.fg("success", `✓ ${details.answers.length} answer(s)`) : "", 0, 0);
    },
  });
}
