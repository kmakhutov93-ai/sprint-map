import test from "node:test";
import assert from "node:assert/strict";
import { demoProject } from "../src/demo.js";
import { comparePlans, schedule } from "../src/planner.js";

test("demo explains a real resource delay and a reassignment saving one day", () => {
  const base = demoProject();
  const initial = schedule(base);
  assert.equal(initial.finishDay, 8);
  assert.equal(initial.totalHours, 74);
  assert.equal(initial.lateDays, 1);
  const ui = initial.tasks.find((task) => task.id === "ui");
  assert.equal(ui.dependencyReadyDay, 4);
  assert.equal(ui.startDay, 5);
  assert.deepEqual(ui.waitingFor, ["engine"]);
  const scenario = demoProject();
  scenario.tasks.find((task) => task.id === "ui").personId = "mira";
  const compared = comparePlans(base, scenario);
  assert.equal(compared.scenario.finishDay, 7);
  assert.equal(compared.scenario.lateDays, 0);
  assert.equal(compared.finishDelta, -1);
  assert.equal(compared.scenario.totalHours, 74);
});
