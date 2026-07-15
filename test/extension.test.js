import test from "node:test";
import assert from "node:assert/strict";
import dask from "../dist/src/extension.js";

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

test("dask adapter renders IDs as the user-visible option numbers", async () => {
  const tool = createTool();
  assert.match(tool.description, /include them together in one questions request/);
  assert.match(tool.description, /depend on another answer in separate calls/);
  assert.match(tool.description, /consecutive IDs in display order \(1, 2, \.\.\., N\)/);
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
