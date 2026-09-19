import test from "node:test";
import assert from "node:assert/strict";
import { demoProject } from "../src/demo.js";
import {
  parseWorkspace,
  serializeWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "../src/storage.js";

const workspace = () => ({ version: 1, base: demoProject(), scenario: null });
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}
test("round trip retains both independent plans and Unicode names", () => {
  const input = workspace();
  input.scenario = demoProject();
  input.scenario.tasks[0].hours = 1;
  const output = parseWorkspace(serializeWorkspace(input));
  assert.deepEqual(output, input);
  output.scenario.people[0].name = "Изменено";
  assert.equal(output.base.people[0].name, "Мира");
});
test("empty storage loads as null and valid changes persist", () => {
  const storage = memory();
  assert.equal(loadWorkspace(storage), null);
  saveWorkspace(storage, workspace());
  assert.deepEqual(loadWorkspace(storage), workspace());
});
test("invalid imported format, unsupported version and oversized files are rejected", () => {
  for (const source of [
    "{",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...workspace(), version: 2 }),
    " ".repeat(200001),
  ])
    assert.throws(() => parseWorkspace(source));
  const bad = workspace();
  bad.scenario = demoProject();
  bad.scenario.tasks[0].dependencies = ["missing"];
  assert.throws(() => parseWorkspace(JSON.stringify(bad)), /зависим/i);
});
test("corrupt local data stays intact after a failed read", () => {
  const storage = memory();
  storage.setItem("sprint-map.workspace.v1", "broken-data");
  assert.throws(() => loadWorkspace(storage), /JSON/i);
  assert.equal(storage.getItem("sprint-map.workspace.v1"), "broken-data");
});
test("validation happens before write and never replaces the last valid save", () => {
  const storage = memory();
  saveWorkspace(storage, workspace());
  const bad = workspace();
  bad.base.people[0].capacity = 0;
  assert.throws(() => saveWorkspace(storage, bad));
  assert.deepEqual(loadWorkspace(storage), workspace());
});
test("storage access denial and quota failures are actionable", () => {
  const denied = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.throws(() => loadWorkspace(denied), /хранилищ/i);
  assert.throws(() => saveWorkspace(denied, workspace()), /экспорт/i);
});
test("untrusted extra fields are stripped from validated data", () => {
  const input = workspace();
  input.base.people[0].unexpected = "not needed";
  const output = parseWorkspace(JSON.stringify(input));
  assert.equal(Object.hasOwn(output.base.people[0], "unexpected"), false);
});
