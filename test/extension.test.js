import test from "node:test";
import assert from "node:assert/strict";
import dask from "../dist/src/extension.js";
import { visibleWidth } from "@earendil-works/pi-tui";

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

const navigationRequest = {
  questions: [
    ...request.questions,
    {
      id: "delivery",
      title: "Delivery",
      description: "Choose timing",
      type: "single",
      labels: [
        { id: 1, label: "Now", value: "now", description: "Deliver now" },
        { id: 2, label: "Later", value: "later", description: "Deliver later" },
      ],
    },
    {
      id: "risk",
      title: "Risk",
      description: "Choose tolerance",
      type: "single",
      labels: [
        { id: 1, label: "Low", value: "low", description: "Prefer safety" },
        { id: 2, label: "High", value: "high", description: "Accept risk" },
      ],
    },
  ],
};

function createTool() {
  let tool;
  dask({ registerTool(definition) { tool = definition; } });
  return tool;
}

const theme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

const navigationTheme = {
  ...theme,
  bg: (color, text) => color === "selectedBg" ? `{${text}}` : text,
};

function contextFor(keys) {
  return {
    mode: "tui",
    ui: {
      custom: async (factory) => new Promise((resolve) => {
        const component = factory({ requestRender() {} }, theme, {}, resolve);
        for (const key of keys) component.handleInput(key);
      }),
    },
  };
}

async function captureRenders(targetRequest, keys, width = 120) {
  const tool = createTool();
  const renders = [];
  await assert.rejects(
    () => tool.execute("call", targetRequest, undefined, undefined, {
      mode: "tui",
      ui: {
        custom: async (factory) => new Promise((resolve) => {
          const component = factory({ requestRender() {} }, navigationTheme, {}, resolve);
          renders.push(component.render(width).join("\n"));
          for (const key of keys) {
            component.handleInput(key);
            renders.push(component.render(width).join("\n"));
          }
          component.handleInput("\x1b");
        }),
      },
    }),
    /cancelled dask/,
  );
  return renders;
}

test("dask adapter maps TUI events to a confirmed result", async () => {
  const tool = createTool();
  const result = await tool.execute("call", request, undefined, undefined, contextFor(["\x1b[B", "\r", " ", "\r", "\r"]));
  assert.deepEqual(result.details, {
    answers: [
      { id: "priority", value: [{ source: "label", value: "complete" }] },
      { id: "scope", value: [{ source: "label", value: "docs" }] },
    ],
  });
});

test("dask description routes enumerable user decisions through the tool", () => {
  const tool = createTool();
  assert.match(tool.description, /不要在回复正文中直接列出编号选项/);
  assert.match(tool.description, /即使当前只有一道题/);
  assert.match(tool.description, /当前已知且互不依赖的问题合并到一次 questions 请求/);
  assert.match(tool.description, /在获得该答案后另行调用/);
  assert.match(tool.description, /不要用本工具承接开放式探索/);
  assert.match(tool.description, /调用方本应自行收口的工程细节/);
});

test("dask adapter renders IDs as the user-visible option numbers", async () => {
  const tool = createTool();
  assert.match(tool.description, /从 1 开始的连续 ID/);
  let rendered = "";
  await assert.rejects(
    () => tool.execute("call", request, undefined, undefined, {
      mode: "tui",
      ui: {
        custom: async (factory) => new Promise((resolve) => {
          const component = factory({ requestRender() {} }, theme, {}, resolve);
          rendered = component.render(120).join("\n");
          component.handleInput("\x1b");
        }),
      },
    }),
    /cancelled dask/,
  );
  assert.match(rendered, /> 1\. Fast/);
  assert.match(rendered, /  2\. Complete/);
});

test("multi-question rendering shows position and current, answered, and unanswered tabs", async () => {
  const [initial, afterAnswer] = await captureRenders(navigationRequest, ["\r"]);
  assert.match(initial, /问题 1 \/ 4/);
  assert.match(initial, /\{\[○ 1\]\} \[○ 2\] \[○ 3\] \[○ 4\]/);
  assert.match(afterAnswer, /问题 2 \/ 4/);
  assert.match(afterAnswer, /\[✓ 1\] \{\[○ 2\]\} \[○ 3\] \[○ 4\]/);
});

test("multi-question rendering respects changed and extremely narrow widths", async () => {
  const tool = createTool();
  let narrowLines = [];
  let tinyLines = [];
  await assert.rejects(
    () => tool.execute("call", navigationRequest, undefined, undefined, {
      mode: "tui",
      ui: {
        custom: async (factory) => new Promise((resolve) => {
          const component = factory({ requestRender() {} }, navigationTheme, {}, resolve);
          component.render(120);
          narrowLines = component.render(8);
          tinyLines = component.render(4);
          component.handleInput("\x1b");
        }),
      },
    }),
    /cancelled dask/,
  );
  assert.equal(narrowLines.every((line) => visibleWidth(line) <= 8), true);
  assert.equal(tinyLines.every((line) => visibleWidth(line) <= 4), true);
});

test("single-question rendering omits multi-question navigation", async () => {
  const [rendered] = await captureRenders({ questions: [request.questions[0]] }, []);
  assert.doesNotMatch(rendered, /问题 1 \/ 1/);
  assert.doesNotMatch(rendered, /\[○ 1\]/);
  assert.doesNotMatch(rendered, /切换问题/);
});

test("number and arrow keys navigate unanswered questions while arrows keep boundary positions", async () => {
  const renders = await captureRenders(navigationRequest, ["4", "\x1b[D", "\x1b[B", "\x1b[C", "\x1b[C", "9", "1", "\x1b[D"]);
  assert.match(renders[1], /问题 4 \/ 4[\s\S]*Risk/);
  assert.match(renders[2], /问题 3 \/ 4[\s\S]*Delivery/);
  assert.match(renders[3], /问题 3 \/ 4[\s\S]*> 2\. Later/);
  assert.match(renders[4], /问题 4 \/ 4[\s\S]*Risk/);
  assert.match(renders[5], /问题 4 \/ 4[\s\S]*Risk/);
  assert.match(renders[6], /问题 4 \/ 4[\s\S]*Risk/);
  assert.match(renders[7], /问题 1 \/ 4[\s\S]*Priority/);
  assert.match(renders[8], /问题 1 \/ 4[\s\S]*Priority/);
});

test("arrow navigation reaches questions after the ninth numeric shortcut", async () => {
  const tenQuestions = {
    questions: Array.from({ length: 10 }, (_, index) => ({
      id: `q-${index + 1}`,
      title: `Question ${index + 1}`,
      description: "Choose one",
      type: "single",
      labels: [
        { id: 1, label: "Yes", value: true, description: "Agree" },
        { id: 2, label: "No", value: false, description: "Disagree" },
      ],
    })),
  };
  const renders = await captureRenders(tenQuestions, Array.from({ length: 9 }, () => "\x1b[C"), 160);
  assert.match(renders.at(-1), /问题 10 \/ 10[\s\S]*Question 10/);
});

test("non-linear answers still return in request order", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "call",
    request,
    undefined,
    undefined,
    contextFor(["2", " ", "\x1b[D", "\x1b[B", "\r", "\r", "\r"]),
  );
  assert.deepEqual(result.details, {
    answers: [
      { id: "priority", value: [{ source: "label", value: "complete" }] },
      { id: "scope", value: [{ source: "label", value: "docs" }] },
    ],
  });
});

test("numeric shortcuts remain text while editing a custom answer", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "call",
    request,
    undefined,
    undefined,
    contextFor(["\x1b[B", "\x1b[B", "\r", "4", "\r", " ", "\r", "\r"]),
  );
  assert.deepEqual(result.details, {
    answers: [
      { id: "priority", value: [{ source: "custom", value: "4" }] },
      { id: "scope", value: [{ source: "label", value: "docs" }] },
    ],
  });
});

test("incomplete summary confirmation returns to the first unanswered question", async () => {
  const tool = createTool();
  let renderedSummary = "";
  let renderedAfterConfirm = "";
  await assert.rejects(
    () => tool.execute("call", request, undefined, undefined, {
      mode: "tui",
      ui: {
        custom: async (factory) => new Promise((resolve) => {
          const component = factory({ requestRender() {} }, navigationTheme, {}, resolve);
          for (const key of ["2", " ", "\r"]) component.handleInput(key);
          renderedSummary = component.render(120).join("\n");
          component.handleInput("\r");
          renderedAfterConfirm = component.render(120).join("\n");
          component.handleInput("\x1b");
        }),
      },
    }),
    /cancelled dask/,
  );
  assert.match(renderedSummary, /还有 1 题未回答；Enter 返回第 1 题补答/);
  assert.match(renderedAfterConfirm, /问题 1 \/ 2[\s\S]*Priority/);
});

test("dask adapter rejects non-TUI execution", async () => {
  const tool = createTool();
  await assert.rejects(
    () => tool.execute("call", request, undefined, undefined, { mode: "json" }),
    /requires interactive TUI mode/,
  );
});

test("dask adapter turns Escape into a tool error", async () => {
  const tool = createTool();
  await assert.rejects(
    () => tool.execute("call", request, undefined, undefined, contextFor(["\x1b[B", "\r", "\x1b"])),
    /cancelled dask/,
  );
});
