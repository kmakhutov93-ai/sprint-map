const HORIZON = 366;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}: ожидается объект.`);
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100)
    throw new Error(`${label}: от 1 до 100 символов.`);
  return value.trim();
}
function integer(value, low, high, label) {
  if (!Number.isInteger(value) || value < low || value > high)
    throw new Error(`${label}: целое число от ${low} до ${high}.`);
  return value;
}
function identifier(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(value))
    throw new Error("Некорректный идентификатор.");
  return value;
}
function unique(values, label) {
  if (new Set(values).size !== values.length)
    throw new Error(`${label}: повторяющиеся значения.`);
}

function orderedTasks(tasks) {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const visited = new Set();
  const visiting = new Set();
  const result = [];
  function visit(task) {
    if (visiting.has(task.id))
      throw new Error(
        `Цикл зависимостей у задачи «${task.title}». Уберите одну из связей.`,
      );
    if (visited.has(task.id)) return;
    visiting.add(task.id);
    for (const id of task.dependencies) visit(byId.get(id));
    visiting.delete(task.id);
    visited.add(task.id);
    result.push(task);
  }
  tasks.forEach(visit);
  return result;
}

export function validateProject(input) {
  object(input, "Проект");
  if (input.version !== 1)
    throw new Error("Поддерживается только версия проекта 1.");
  if (!Array.isArray(input.people) || input.people.length > 10)
    throw new Error("В проекте может быть до 10 участников.");
  if (!Array.isArray(input.tasks) || input.tasks.length > 40)
    throw new Error("В проекте может быть до 40 задач.");
  const people = input.people.map((person) => {
    object(person, "Участник");
    if (!Array.isArray(person.away) || person.away.length > 90)
      throw new Error("Недоступные дни: нужен список до 90 дней.");
    const away = person.away.map((day) =>
      integer(day, 1, 90, "Недоступный день"),
    );
    unique(away, "Недоступные дни");
    return {
      id: identifier(person.id),
      name: text(person.name, "Имя"),
      capacity: integer(person.capacity, 1, 12, "Часов в день"),
      away: away.sort((a, b) => a - b),
    };
  });
  unique(
    people.map((person) => person.id),
    "Участники",
  );
  const tasks = input.tasks.map((task) => {
    object(task, "Задача");
    if (!Array.isArray(task.dependencies) || task.dependencies.length > 40)
      throw new Error("Зависимости: нужен список до 40 задач.");
    const dependencies = task.dependencies.map(identifier);
    unique(dependencies, "Зависимости");
    if (typeof task.required !== "boolean")
      throw new Error("Обязательность задачи должна быть true или false.");
    if (!people.some((person) => person.id === task.personId))
      throw new Error(
        `Задача «${text(task.title, "Название")}»: исполнитель не найден.`,
      );
    return {
      id: identifier(task.id),
      title: text(task.title, "Название"),
      personId: task.personId,
      hours: integer(task.hours, 1, 80, "Часы задачи"),
      dependencies,
      required: task.required,
      releaseDay: integer(task.releaseDay, 1, 90, "День доступности"),
    };
  });
  unique(
    tasks.map((task) => task.id),
    "Задачи",
  );
  const ids = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    if (task.dependencies.some((id) => !ids.has(id)))
      throw new Error(`Задача «${task.title}»: зависимость не найдена.`);
  }
  orderedTasks(tasks);
  return {
    version: 1,
    name: text(input.name, "Название проекта"),
    deadline: integer(input.deadline, 1, 90, "Дедлайн"),
    people,
    tasks,
  };
}

export function schedule(input) {
  const project = validateProject(input);
  const people = new Map(project.people.map((person) => [person.id, person]));
  const used = new Map(project.people.map((person) => [person.id, new Map()]));
  const scheduled = new Map();
  for (const task of orderedTasks(project.tasks)) {
    const person = people.get(task.personId);
    const days = used.get(person.id);
    const dependencyEnd = Math.max(
      0,
      ...task.dependencies.map((id) => scheduled.get(id).endDay),
    );
    const dependencyReadyDay = Math.max(task.releaseDay, dependencyEnd + 1);
    const allocations = [];
    let remaining = task.hours;
    for (let day = dependencyReadyDay; day <= HORIZON && remaining > 0; day++) {
      if (person.away.includes(day)) continue;
      const available = person.capacity - (days.get(day) ?? 0);
      const hours = Math.min(remaining, available);
      if (hours <= 0) continue;
      days.set(day, (days.get(day) ?? 0) + hours);
      allocations.push({ day, hours });
      remaining -= hours;
    }
    if (remaining)
      throw new Error(
        `План превышает ${HORIZON} рабочих дней. Уменьшите объём или увеличьте доступность команды.`,
      );
    const startDay = allocations[0].day;
    const waitingFor = [...scheduled.values()]
      .filter((row) => {
        const other = project.tasks.find((item) => item.id === row.id);
        return (
          other.personId === person.id &&
          row.allocations.some(
            (slot) => slot.day >= dependencyReadyDay && slot.day < startDay,
          )
        );
      })
      .map((row) => row.id);
    scheduled.set(task.id, {
      id: task.id,
      startDay,
      endDay: allocations.at(-1).day,
      allocations,
      dependencyReadyDay,
      resourceDelayDays: startDay - dependencyReadyDay,
      blockingDependencies: task.dependencies.filter(
        (id) => scheduled.get(id).endDay === dependencyEnd,
      ),
      waitingFor,
    });
  }
  const tasks = project.tasks.map((task) => scheduled.get(task.id));
  const finishDay = Math.max(0, ...tasks.map((row) => row.endDay));
  const loads = project.people.map((person) => {
    const hours = project.tasks
      .filter((task) => task.personId === person.id)
      .reduce((sum, task) => sum + task.hours, 0);
    const availableBeforeDeadline =
      (project.deadline -
        person.away.filter((day) => day <= project.deadline).length) *
      person.capacity;
    return {
      personId: person.id,
      hours,
      availableBeforeDeadline,
      overByHours: Math.max(0, hours - availableBeforeDeadline),
      days: [...used.get(person.id)]
        .sort(([a], [b]) => a - b)
        .map(([day, amount]) => ({ day, hours: amount })),
    };
  });
  return {
    finishDay,
    totalHours: project.tasks.reduce((sum, task) => sum + task.hours, 0),
    lateDays: Math.max(0, finishDay - project.deadline),
    tasks,
    loads,
  };
}

export function comparePlans(baseProject, scenarioProject) {
  const base = schedule(baseProject);
  const scenario = schedule(scenarioProject);
  const ids = new Set(
    [...base.tasks, ...scenario.tasks].map((task) => task.id),
  );
  const changes = [...ids].map((id) => {
    const beforeEnd = base.tasks.find((task) => task.id === id)?.endDay ?? null;
    const afterEnd =
      scenario.tasks.find((task) => task.id === id)?.endDay ?? null;
    return {
      id,
      beforeEnd,
      afterEnd,
      delta:
        beforeEnd === null || afterEnd === null ? null : afterEnd - beforeEnd,
    };
  });
  return {
    base,
    scenario,
    finishDelta: scenario.finishDay - base.finishDay,
    changes,
  };
}

export function removalImpact(input, id) {
  const project = validateProject(input);
  if (!project.tasks.some((task) => task.id === id))
    throw new Error("Задача не найдена.");
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of project.tasks) {
      if (
        !removed.has(task.id) &&
        task.dependencies.some((dependency) => removed.has(dependency))
      ) {
        removed.add(task.id);
        changed = true;
      }
    }
  }
  return {
    removedIds: project.tasks
      .filter((task) => removed.has(task.id))
      .map((task) => task.id),
    blockedByRequired: project.tasks
      .filter((task) => removed.has(task.id) && task.required)
      .map((task) => task.id),
  };
}

export function removeOptional(input, id) {
  const project = validateProject(input);
  const impact = removalImpact(project, id);
  if (impact.blockedByRequired.length)
    throw new Error(
      "Нельзя убрать этот объём: от него зависят обязательные задачи или сама задача обязательная.",
    );
  project.tasks = project.tasks.filter(
    (task) => !impact.removedIds.includes(task.id),
  );
  return project;
}
