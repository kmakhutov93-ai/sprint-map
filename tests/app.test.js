import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mountApp } from "../src/app.js";

function setup(options = {}) {
  const { document } = parseHTML(
    '<html><body><div id="app"></div></body></html>',
  );
  const values = new Map();
  const storage = options.storage ?? {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  mountApp(document, {
    storage,
    confirm: options.confirm ?? (() => true),
    download: () => {},
  });
  return document;
}

function click(document, selector) {
  const node = document.querySelector(selector);
  assert.ok(node, `Missing ${selector}`);
  node.click();
}

test("demo renders schedule and safely displays project text", () => {
  const document = setup();
  assert.match(document.body.textContent, /День завершения/);
  assert.ok(document.querySelector('[data-testid="timeline"]'));
  const name = document.querySelector('[name="project-name"]');
  name.value = "<img src=x onerror=alert(1)>";
  click(document, '[data-action="save-project"]');
  assert.equal(document.querySelector("img"), null);
  assert.match(document.body.textContent, /<img src=x onerror=alert\(1\)>/);
});

test("scenario locks baseline and can be reset with confirmation", () => {
  let allow = false;
  const document = setup({ confirm: () => allow });
  click(document, '[data-action="create-scenario"]');
  click(document, '[data-action="show-base"]');
  assert.equal(document.querySelector('[name="project-name"]').disabled, true);
  click(document, '[data-action="show-scenario"]');
  click(document, '[data-action="reset-scenario"]');
  assert.ok(document.querySelector('[data-action="show-base"]'));
  allow = true;
  click(document, '[data-action="reset-scenario"]');
  assert.equal(document.querySelector('[data-action="show-base"]'), null);
});

test("saving errors remain visible without losing edits", () => {
  const document = setup({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error("Квота заполнена");
      },
    },
  });
  const name = document.querySelector('[name="project-name"]');
  name.value = "Обновлённый план";
  click(document, '[data-action="save-project"]');
  assert.match(document.body.textContent, /Не удалось сохранить план/);
  assert.equal(
    document.querySelector('[name="project-name"]').value,
    "Обновлённый план",
  );
});

test("invalid saved workspace is shown and never overwritten", () => {
  let writes = 0;
  const document = setup({
    storage: {
      getItem: () => "{broken",
      setItem: () => {
        writes++;
      },
    },
  });
  assert.match(document.body.textContent, /сохранен|сохранён|загруз/i);
  assert.equal(writes, 0);
});

test("participant edit keeps invalid input and returns to add mode after save", () => {
  const document = setup();
  click(document, '[data-action="edit-person"]');
  const capacity = document.querySelector('[name="person-capacity"]');
  capacity.value = "0";
  click(document, '[data-action="save-person"]');
  assert.equal(document.querySelector('[name="person-capacity"]').value, "0");
  assert.match(document.body.textContent, /Часов в день/);
  capacity.value = "5";
  click(document, '[data-action="save-person"]');
  assert.equal(document.querySelector(".team-list").children.length, 3);
  assert.equal(document.querySelector('[name="person-name"]').value, "");
  assert.match(document.body.textContent, /Мира5 ч\/день/);
});

test("scenario can remove optional work after showing its impact", () => {
  const prompts = [];
  const document = setup({
    confirm: (message) => {
      prompts.push(message);
      return true;
    },
  });
  click(document, '[data-action="create-scenario"]');
  click(document, '[data-action="preview-removal"]');
  assert.match(prompts.at(-1), /Дополнительная аналитика/);
  assert.equal(
    document.querySelectorAll('[data-action="preview-removal"]').length,
    1,
  );
  assert.match(document.body.textContent, /Сравнение с исходным планом/);
});

test("new project starts empty and allows a participant to be added", () => {
  const document = setup();
  click(document, '[data-action="new-project"]');
  assert.match(document.body.textContent, /Пока нет задач/);
  document.querySelector('[name="person-name"]').value = "Ира";
  click(document, '[data-action="save-person"]');
  assert.match(document.body.textContent, /Ира6 ч\/день/);
});

test("task edit saves once and selection explains its schedule", () => {
  const document = setup();
  click(document, '[data-action="edit-task"]');
  document.querySelector('[name="task-hours"]').value = "7";
  click(document, '[data-action="save-task"]');
  assert.equal(document.querySelectorAll(".task-row").length, 8);
  assert.equal(document.querySelector('[name="task-title"]').value, "");
  click(document, '[data-action="select-task"]');
  assert.match(document.querySelector(".explanation").textContent, /7 ч/);
  assert.match(
    document.querySelector(".explanation").textContent,
    /Возможный старт/,
  );
});

test("denied storage still allows scenario and export in memory", () => {
  let exported = "";
  const { document } = parseHTML(
    '<html><body><div id="app"></div></body></html>',
  );
  mountApp(document, {
    storage: {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    },
    confirm: () => true,
    download: (text) => {
      exported = text;
    },
  });
  click(document, '[data-action="create-scenario"]');
  assert.ok(document.querySelector('[data-action="show-base"]'));
  click(document, '[data-action="export"]');
  assert.match(exported, /"scenario"/);
  assert.match(
    document.body.textContent,
    /Не удалось загрузить сохранённый план/,
  );
});

test("explicit new plan can replace a corrupt save", () => {
  let stored = "{broken";
  const document = setup({
    storage: {
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value;
      },
    },
  });
  click(document, '[data-action="new-project"]');
  assert.match(stored, /"Новый план"/);
  assert.equal(
    document.querySelector('[name="project-name"]').value,
    "Новый план",
  );
  assert.doesNotMatch(document.body.textContent, /Сохранение отключено/);
});

test("deleting the participant being edited still allows adding a new one", () => {
  const document = setup();
  click(document, '[data-action="new-project"]');
  document.querySelector('[name="person-name"]').value = "Ира";
  click(document, '[data-action="save-person"]');
  click(document, '[data-action="edit-person"]');
  click(document, '[data-action="delete-person"]');
  document.querySelector('[name="person-name"]').value = "Алия";
  click(document, '[data-action="save-person"]');
  assert.equal(document.querySelectorAll(".person-row").length, 1);
  assert.match(document.querySelector(".team-list").textContent, /Алия/);
});

test("deleting the task being edited still allows adding a new one", () => {
  const document = setup();
  const lastRow = document.querySelectorAll(".task-row")[7];
  click(lastRow, '[data-action="edit-task"]');
  const editedRow = document.querySelectorAll(".task-row")[7];
  click(editedRow, '[data-action="delete-task"]');
  document.querySelector('[name="task-title"]').value = "Новая задача";
  click(document, '[data-action="save-task"]');
  assert.equal(document.querySelectorAll(".task-row").length, 8);
  assert.match(
    document.querySelector(".task-list").textContent,
    /Новая задача/,
  );
});
