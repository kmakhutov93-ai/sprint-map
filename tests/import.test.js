import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { parseHTML } from "linkedom";
import { mountApp } from "../src/app.js";
import { demoProject } from "../src/demo.js";
import { serializeWorkspace } from "../src/storage.js";

function fixture(confirm = () => true) {
  const { document } = parseHTML(
    '<html><body><div id="app"></div></body></html>',
  );
  const app = mountApp(document, {
    storage: { getItem: () => null, setItem: () => {} },
    confirm,
  });
  const base = demoProject();
  base.name = "Импортированный план";
  const content = serializeWorkspace({ version: 1, base, scenario: null });
  return { document, app, content };
}

function importFile(document, file) {
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new document.defaultView.Event("change"));
}

test("file import replaces the plan only after confirmation", async () => {
  let allowed = false;
  const { document, app, content } = fixture(() => allowed);
  const file = { size: content.length, text: async () => content };
  importFile(document, file);
  await setImmediate();
  assert.equal(app.getWorkspace().base.name, "Прототип к демодню");
  allowed = true;
  importFile(document, file);
  await setImmediate();
  assert.equal(app.getWorkspace().base.name, "Импортированный план");
});

test("invalid and oversized files preserve the current plan", async () => {
  const { document, app } = fixture();
  const original = app.getWorkspace();
  importFile(document, { size: 5, text: async () => "{bad" });
  await setImmediate();
  assert.deepEqual(app.getWorkspace(), original);
  assert.match(document.body.textContent, /Импорт не выполнен/);
  let read = false;
  importFile(document, {
    size: 800_001,
    text: async () => {
      read = true;
      return "";
    },
  });
  await setImmediate();
  assert.equal(read, false);
  assert.deepEqual(app.getWorkspace(), original);
  assert.match(document.body.textContent, /слишком большой/);
});

test("slow import never overwrites edits made while reading the file", async () => {
  const { document, app, content } = fixture();
  let finishReading;
  importFile(document, {
    size: content.length,
    text: () => new Promise((resolve) => (finishReading = resolve)),
  });
  document.querySelector('[name="project-name"]').value = "Новые изменения";
  document.querySelector('[data-action="save-project"]').click();
  finishReading(content);
  await setImmediate();
  assert.equal(app.getWorkspace().base.name, "Новые изменения");
  assert.match(document.body.textContent, /изменился во время чтения/);
});
