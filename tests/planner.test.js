import test from "node:test";
import assert from "node:assert/strict";
import {
  validateProject,
  schedule,
  comparePlans,
  removalImpact,
  removeOptional,
} from "../src/planner.js";

function project(
  tasks = [],
  people = [{ id: "a", name: "А", capacity: 4, away: [] }],
) {
  return { version: 1, name: "План", deadline: 3, people, tasks };
}
function task(id, extra = {}) {
  return {
    id,
    title: id,
    personId: "a",
    hours: 6,
    dependencies: [],
    required: true,
    releaseDay: 1,
    ...extra,
  };
}

test("independent work shares daily capacity without exceeding it", () => {
  const result = schedule(project([task("one"), task("two")]));
  assert.equal(result.finishDay, 3);
  assert.equal(result.totalHours, 12);
  assert.deepEqual(result.tasks[0].allocations, [
    { day: 1, hours: 4 },
    { day: 2, hours: 2 },
  ]);
  assert.deepEqual(result.tasks[1].allocations, [
    { day: 2, hours: 2 },
    { day: 3, hours: 4 },
  ]);
  assert.equal(result.tasks[1].resourceDelayDays, 1);
  assert.deepEqual(result.tasks[1].waitingFor, ["one"]);
});
test("a dependency finishes before the dependent task's working day", () => {
  const result = schedule(
    project([task("two", { dependencies: ["one"] }), task("one")]),
  );
  const dependent = result.tasks.find((row) => row.id === "two");
  assert.equal(dependent.startDay, 3);
  assert.equal(dependent.endDay, 4);
  assert.equal(dependent.dependencyReadyDay, 3);
  assert.deepEqual(dependent.blockingDependencies, ["one"]);
  assert.equal(result.lateDays, 1);
});
test("different people work concurrently and joins wait for the last predecessor", () => {
  const result = schedule(
    project(
      [
        task("one"),
        task("two", { personId: "b", hours: 8 }),
        task("join", { dependencies: ["one", "two"], hours: 1 }),
      ],
      [
        { id: "a", name: "А", capacity: 4, away: [] },
        { id: "b", name: "Б", capacity: 2, away: [] },
      ],
    ),
  );
  assert.equal(result.finishDay, 5);
  assert.equal(result.tasks[2].startDay, 5);
  assert.deepEqual(result.tasks[2].blockingDependencies, ["two"]);
});
test("release days and unavailable days both constrain allocations", () => {
  const result = schedule(
    project(
      [task("one", { hours: 5, releaseDay: 2 })],
      [{ id: "a", name: "А", capacity: 4, away: [2, 4] }],
    ),
  );
  assert.deepEqual(result.tasks[0].allocations, [
    { day: 3, hours: 4 },
    { day: 5, hours: 1 },
  ]);
  assert.equal(result.tasks[0].resourceDelayDays, 1);
  assert.equal(result.loads[0].availableBeforeDeadline, 8);
});
test("capacity pressure uses total assigned hours and available days before deadline", () => {
  const result = schedule(
    project(
      [task("one", { hours: 12 })],
      [{ id: "a", name: "А", capacity: 4, away: [2] }],
    ),
  );
  assert.equal(result.loads[0].overByHours, 4);
  assert.equal(result.finishDay, 4);
});
test("empty projects are valid and don't invent duration", () => {
  assert.equal(schedule(project([], [])).finishDay, 0);
  assert.equal(schedule(project([], [])).lateDays, 0);
});
test("planning and comparison never mutate input", () => {
  const base = project([task("one")]);
  const serialized = JSON.stringify(base);
  const scenario = structuredClone(base);
  scenario.tasks[0].hours = 1;
  const result = comparePlans(base, scenario);
  assert.equal(result.finishDelta, -1);
  assert.deepEqual(result.changes, [
    { id: "one", beforeEnd: 2, afterEnd: 1, delta: -1 },
  ]);
  assert.equal(JSON.stringify(base), serialized);
  assert.notEqual(validateProject(base), base);
});
test("comparison identifies removed and added tasks", () => {
  const result = comparePlans(
    project([task("old")]),
    project([task("new", { hours: 1 })]),
  );
  assert.deepEqual(result.changes, [
    { id: "old", beforeEnd: 2, afterEnd: null, delta: null },
    { id: "new", beforeEnd: null, afterEnd: 1, delta: null },
  ]);
});
test("removing optional work includes all dependent tasks, without touching original", () => {
  const original = project([
    task("one", { required: false }),
    task("two", { dependencies: ["one"], required: false }),
    task("keep"),
  ]);
  assert.deepEqual(removalImpact(original, "one"), {
    removedIds: ["one", "two"],
    blockedByRequired: [],
  });
  assert.deepEqual(
    removeOptional(original, "one").tasks.map((item) => item.id),
    ["keep"],
  );
  assert.equal(original.tasks.length, 3);
});
test("optional prerequisite of required work cannot be removed", () => {
  const input = project([
    task("one", { required: false }),
    task("two", { dependencies: ["one"] }),
  ]);
  assert.deepEqual(removalImpact(input, "one").blockedByRequired, ["two"]);
  assert.throws(() => removeOptional(input, "one"), /обязательн/i);
  assert.throws(() => removalImpact(input, "missing"), /найден/i);
});
test("cycles and self-dependencies fail with an actionable error", () => {
  assert.throws(
    () =>
      schedule(
        project([
          task("one", { dependencies: ["two"] }),
          task("two", { dependencies: ["one"] }),
        ]),
      ),
    /цикл/i,
  );
  assert.throws(
    () => schedule(project([task("one", { dependencies: ["one"] })])),
    /цикл/i,
  );
});
test("unknown person and predecessor references are rejected", () => {
  assert.throws(
    () => validateProject(project([task("one", { personId: "missing" })])),
    /исполнитель/i,
  );
  assert.throws(
    () =>
      validateProject(project([task("one", { dependencies: ["missing"] })])),
    /зависим/i,
  );
});
test("duplicate IDs and duplicate dependencies are rejected", () => {
  assert.throws(
    () => validateProject(project([task("one"), task("one")])),
    /повтор/i,
  );
  assert.throws(
    () =>
      validateProject(
        project([task("one"), task("two", { dependencies: ["one", "one"] })]),
      ),
    /повтор/i,
  );
});
for (const hours of [0, -1, 81, 1.5, NaN, Infinity, "6"]) {
  test(`reject invalid task estimate ${String(hours)}`, () => {
    assert.throws(
      () => validateProject(project([task("one", { hours })])),
      /часы/i,
    );
  });
}
test("strict format, names, IDs, availability and collection limits", () => {
  assert.throws(() => validateProject(null));
  assert.throws(() => validateProject({ ...project(), version: 2 }));
  assert.throws(() => validateProject({ ...project(), name: " " }));
  assert.throws(() => validateProject(project([task("bad id")])));
  assert.throws(() =>
    validateProject(project([task("x", { required: "false" })])),
  );
  assert.throws(() =>
    validateProject(
      project([], [{ id: "a", name: "A", capacity: 0, away: [] }]),
    ),
  );
  assert.throws(() =>
    validateProject(
      project([], [{ id: "a", name: "A", capacity: 4, away: [0] }]),
    ),
  );
  assert.throws(() =>
    validateProject(
      project(Array.from({ length: 41 }, (_, i) => task(`t${i}`))),
    ),
  );
});
test("bounded horizon fails explicitly instead of silently dropping work", () => {
  const tasks = Array.from({ length: 5 }, (_, i) =>
    task(`t${i}`, { hours: 80 }),
  );
  assert.throws(
    () =>
      schedule(project(tasks, [{ id: "a", name: "А", capacity: 1, away: [] }])),
    /366/,
  );
});
test("every generated allocation satisfies effort, capacity and dependency invariants", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const tasks = Array.from({ length: 15 }, (_, i) =>
      task(`t${i}`, {
        hours: 1 + ((seed * (i + 3)) % 13),
        personId: i % 2 ? "a" : "b",
        dependencies: i > 1 && i % 3 === 0 ? [`t${i - 2}`] : [],
      }),
    );
    const input = project(tasks, [
      { id: "a", name: "А", capacity: 4, away: [2] },
      { id: "b", name: "Б", capacity: 6, away: [3] },
    ]);
    const result = schedule(input);
    for (const row of result.tasks) {
      const source = tasks.find((item) => item.id === row.id);
      assert.equal(
        row.allocations.reduce((sum, slot) => sum + slot.hours, 0),
        source.hours,
      );
      for (const id of source.dependencies)
        assert.ok(
          row.startDay > result.tasks.find((item) => item.id === id).endDay,
        );
    }
    for (const load of result.loads) {
      const person = input.people.find((item) => item.id === load.personId);
      assert.ok(
        load.days.every(
          (slot) =>
            slot.hours <= person.capacity && !person.away.includes(slot.day),
        ),
      );
    }
  }
});
