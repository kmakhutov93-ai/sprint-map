import {
  comparePlans,
  removalImpact,
  removeOptional,
  schedule,
  validateProject,
} from "./planner.js";
import { demoProject } from "./demo.js";
import {
  loadWorkspace,
  parseWorkspace,
  saveWorkspace,
  serializeWorkspace,
} from "./storage.js";

const colors = [
  "#5358d8",
  "#147f7d",
  "#a6507b",
  "#9a622c",
  "#4773a9",
  "#678142",
  "#795bb2",
  "#b35c42",
  "#387b83",
  "#77728a",
];

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function append(parent, ...children) {
  for (const child of children) if (child) parent.append(child);
  return parent;
}

function button(doc, label, action, handler, disabled = false, className = "") {
  const node = el(doc, "button", className, label);
  node.type = "button";
  node.dataset.action = action;
  node.disabled = disabled;
  node.addEventListener("click", handler);
  return node;
}

function field(doc, label, name, value, options = {}) {
  const wrap = el(doc, "label", "field");
  const caption = el(doc, "span", "field-label", label);
  const node = el(doc, "input");
  node.name = name;
  node.type = options.type ?? "text";
  node.value = String(value ?? "");
  node.disabled = Boolean(options.disabled);
  if (options.min !== undefined) node.min = String(options.min);
  if (options.max !== undefined) node.max = String(options.max);
  if (node.type === "text") node.maxLength = 100;
  if (options.placeholder) node.placeholder = options.placeholder;
  append(wrap, caption, node);
  return wrap;
}

function select(doc, label, name, choices, value, disabled) {
  const wrap = el(doc, "label", "field");
  const control = el(doc, "select");
  control.name = name;
  control.disabled = disabled;
  for (const [id, title] of choices) {
    const option = el(doc, "option", "", title);
    option.value = id;
    option.selected = id === value;
    control.append(option);
  }
  append(wrap, el(doc, "span", "field-label", label), control);
  return wrap;
}

function numberList(value) {
  if (!value.trim()) return [];
  return value.split(",").map((part) => {
    const number = Number(part.trim());
    if (!Number.isInteger(number))
      throw new Error("Недоступные дни укажите целыми числами через запятую.");
    return number;
  });
}

function idFor(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function mountApp(
  doc,
  {
    storage,
    confirm = (message) => globalThis.confirm(message),
    download = browserDownload,
  } = {},
) {
  const root = doc.getElementById("app") ?? doc.body;
  let workspace;
  let startupError = "";
  try {
    workspace = loadWorkspace(storage) ?? {
      version: 1,
      base: demoProject(),
      scenario: null,
    };
  } catch (error) {
    workspace = { version: 1, base: demoProject(), scenario: null };
    startupError = `Не удалось загрузить сохранённый план: ${error.message}. Сохранение отключено, чтобы не заменить повреждённые данные.`;
  }
  let view = workspace.scenario ? "scenario" : "base";
  let selectedId = null;
  let editingPerson = null;
  let editingTask = null;
  let message = "";
  let persistenceError = startupError;
  let revision = 0;
  let importSequence = 0;
  root.addEventListener("input", () => {
    revision++;
  });
  root.addEventListener("keydown", (event) => {
    if (
      event.key !== "Enter" ||
      !event.target.matches('input[type="text"], input[type="number"]')
    )
      return;
    const section = event.target.closest(".edit-panel, .task-form");
    const save = section?.querySelector('[data-action^="save-"]');
    if (save && !save.disabled) {
      event.preventDefault();
      save.click();
    }
  });

  const active = () =>
    view === "scenario" ? workspace.scenario : workspace.base;
  const editable = () => !workspace.scenario || view === "scenario";
  const error = (text) => {
    message = text;
    const old = root.querySelector('[data-kind="message"]');
    const alert = el(doc, "div", "notice error", text);
    alert.dataset.kind = "message";
    alert.setAttribute("role", "alert");
    if (old) old.replaceWith(alert);
    else {
      const anchor =
        root.querySelector('[data-kind="persistence"]') ??
        root.querySelector(".masthead");
      anchor?.after(alert);
    }
  };

  function commit(next, onSuccess = () => {}) {
    try {
      const checked = validateProject(next);
      const updated = { ...workspace, [view]: checked };
      workspace = updated;
      if (!checked.people.some((person) => person.id === editingPerson))
        editingPerson = null;
      if (!checked.tasks.some((task) => task.id === editingTask))
        editingTask = null;
      revision++;
      onSuccess();
      if (!startupError) {
        try {
          saveWorkspace(storage, updated);
          persistenceError = "";
          message = "Изменения сохранены локально.";
        } catch (cause) {
          persistenceError = `Не удалось сохранить: ${cause.message}. Изменения остаются на экране.`;
          message = "";
        }
      } else message = "";
      render();
      return true;
    } catch (cause) {
      error(cause.message);
      return false;
    }
  }

  function replace(next, overwriteCorrupt = false) {
    try {
      let replacementMessage = startupError || "План загружен.";
      if (!startupError || overwriteCorrupt) {
        try {
          saveWorkspace(storage, next);
          if (overwriteCorrupt) startupError = "";
          persistenceError = "";
          replacementMessage = "План загружен.";
        } catch (cause) {
          persistenceError = `Не удалось сохранить: ${cause.message}. План доступен до закрытия страницы; скачайте экспорт.`;
          replacementMessage = "";
        }
      }
      workspace = next;
      view = next.scenario ? "scenario" : "base";
      editingPerson = null;
      editingTask = null;
      selectedId = null;
      revision++;
      message = replacementMessage;
      render();
    } catch (cause) {
      error(cause.message);
    }
  }

  function saveProject() {
    const name = root.querySelector('[name="project-name"]').value.trim();
    const deadline = Number(
      root.querySelector('[name="project-deadline"]').value,
    );
    commit({ ...active(), name, deadline });
  }

  function savePerson() {
    try {
      const name = root.querySelector('[name="person-name"]').value.trim();
      const capacity = Number(
        root.querySelector('[name="person-capacity"]').value,
      );
      const away = numberList(root.querySelector('[name="person-away"]').value);
      const person = {
        id: editingPerson ?? idFor("person"),
        name,
        capacity,
        away,
      };
      const people = editingPerson
        ? active().people.map((item) =>
            item.id === editingPerson ? person : item,
          )
        : [...active().people, person];
      commit({ ...active(), people }, () => {
        editingPerson = null;
      });
    } catch (cause) {
      error(cause.message);
    }
  }

  function saveTask() {
    const task = {
      id: editingTask ?? idFor("task"),
      title: root.querySelector('[name="task-title"]').value.trim(),
      personId: root.querySelector('[name="task-person"]').value,
      hours: Number(root.querySelector('[name="task-hours"]').value),
      releaseDay: Number(root.querySelector('[name="task-release"]').value),
      required: root.querySelector('[name="task-required"]').checked,
      dependencies: [
        ...root.querySelectorAll('[name="task-dependency"]:checked'),
      ].map((node) => node.value),
    };
    const tasks = editingTask
      ? active().tasks.map((item) => (item.id === editingTask ? task : item))
      : [...active().tasks, task];
    commit({ ...active(), tasks }, () => {
      editingTask = null;
    });
  }

  function render() {
    root.replaceChildren();
    const project = active();
    let plan;
    let comparison;
    try {
      plan = schedule(project);
      if (workspace.scenario)
        comparison = comparePlans(workspace.base, workspace.scenario);
    } catch (cause) {
      message = `Ошибка расчёта: ${cause.message}`;
    }

    const shell = el(doc, "main", "shell");
    const masthead = el(doc, "header", "masthead");
    const identity = el(doc, "div", "identity");
    append(
      identity,
      el(doc, "div", "brand", "Sprint Map"),
      el(doc, "h1", "", project.name),
      el(
        doc,
        "p",
        "lede",
        "План команды по рабочим дням: кто занят, что блокирует работу и как меняется срок.",
      ),
    );
    const controls = el(doc, "div", "mast-actions");
    if (workspace.scenario) {
      append(
        controls,
        button(
          doc,
          "Исходный план",
          "show-base",
          () => {
            view = "base";
            render();
          },
          false,
          view === "base" ? "active" : "",
        ),
        button(
          doc,
          "Сценарий",
          "show-scenario",
          () => {
            view = "scenario";
            render();
          },
          false,
          view === "scenario" ? "active" : "",
        ),
        button(
          doc,
          "Сбросить сценарий",
          "reset-scenario",
          () => {
            if (confirm("Удалить сценарий и вернуться к исходному плану?"))
              replace({ version: 1, base: workspace.base, scenario: null });
          },
          false,
          "quiet danger",
        ),
      );
    } else {
      controls.append(
        button(
          doc,
          "Создать сценарий",
          "create-scenario",
          () => {
            replace({
              version: 1,
              base: workspace.base,
              scenario: structuredClone(workspace.base),
            });
          },
          false,
          "primary",
        ),
      );
    }
    append(
      controls,
      button(doc, "Экспорт JSON", "export", () => {
        try {
          download(serializeWorkspace(workspace), "sprint-map.json");
          message = "Файл подготовлен для скачивания.";
          render();
        } catch (cause) {
          error(cause.message);
        }
      }),
      button(
        doc,
        "Загрузить демо",
        "load-demo",
        () => {
          if (confirm("Заменить текущую работу демонстрационным планом?"))
            replace({ version: 1, base: demoProject(), scenario: null }, true);
        },
        false,
        "quiet",
      ),
    );
    controls.append(
      button(
        doc,
        "Новый план",
        "new-project",
        () => {
          if (confirm("Заменить текущую работу пустым планом?"))
            replace(
              {
                version: 1,
                base: {
                  version: 1,
                  name: "Новый план",
                  deadline: 10,
                  people: [],
                  tasks: [],
                },
                scenario: null,
              },
              true,
            );
        },
        false,
        "quiet",
      ),
    );
    const importLabel = el(doc, "label", "import-control", "Импорт JSON");
    const importInput = el(doc, "input");
    importInput.type = "file";
    importInput.accept = ".json,application/json";
    importInput.setAttribute("aria-label", "Импорт JSON");
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const startedAt = revision;
      const sequence = ++importSequence;
      try {
        if (file.size > 800_000)
          throw new Error("Файл слишком большой для импорта.");
        const text = await file.text();
        if (sequence !== importSequence) return;
        const parsed = parseWorkspace(text);
        if (startedAt !== revision) {
          error("План изменился во время чтения файла. Выберите файл ещё раз.");
          return;
        }
        if (confirm("Заменить текущую работу содержимым файла?"))
          replace(parsed, true);
      } catch (cause) {
        if (sequence === importSequence)
          error(`Импорт не выполнен: ${cause.message}`);
      }
      importInput.value = "";
    });
    importLabel.append(importInput);
    controls.append(importLabel);
    append(masthead, identity, controls);
    shell.append(masthead);

    if (persistenceError) {
      const alert = el(doc, "div", "notice error", persistenceError);
      alert.dataset.kind = "persistence";
      alert.setAttribute("role", "alert");
      shell.append(alert);
    }
    if (message) {
      const alert = el(
        doc,
        "div",
        message.includes("Ошибка") ||
          message.includes("Не удалось") ||
          message.includes("не выполнен") ||
          message.includes("отключено")
          ? "notice error"
          : "notice",
        message,
      );
      alert.dataset.kind = "message";
      alert.setAttribute("role", "status");
      shell.append(alert);
    }

    const metrics = el(doc, "section", "metrics");
    metrics.setAttribute("aria-label", "Сводка плана");
    const metric = (label, value, style = "") =>
      append(
        el(doc, "div", `metric ${style}`),
        el(doc, "span", "metric-label", label),
        el(doc, "strong", "", value),
      );
    append(
      metrics,
      metric("День завершения", plan ? plan.finishDay : "—", "key-metric"),
      metric("До дедлайна", `День ${project.deadline}`),
      metric(
        "Отклонение",
        plan ? (plan.lateDays ? `+${plan.lateDays} дн.` : "В срок") : "—",
        plan?.lateDays ? "risk" : "",
      ),
      metric("Объём", plan ? `${plan.totalHours} ч` : "—"),
      metric(
        "Сценарий",
        comparison
          ? `${comparison.finishDelta > 0 ? "+" : ""}${comparison.finishDelta} дн.`
          : "Нет сценария",
      ),
    );
    shell.append(metrics);

    const workspaceGrid = el(doc, "div", "workspace-grid");
    const sidebar = el(doc, "aside", "sidebar");
    const team = el(doc, "section", "panel team-panel");
    append(
      team,
      el(doc, "div", "section-heading", "Команда"),
      el(doc, "p", "hint", "Часы в день и недоступные рабочие дни."),
    );
    const list = el(doc, "div", "team-list");
    for (const [index, person] of project.people.entries()) {
      const row = el(doc, "div", "person-row");
      const dot = el(doc, "span", "person-dot");
      dot.style.backgroundColor = colors[index % colors.length];
      const info = append(
        el(doc, "div", "person-info"),
        el(doc, "strong", "", person.name),
        el(
          doc,
          "span",
          "muted",
          `${person.capacity} ч/день${person.away.length ? ` · нет: ${person.away.join(", ")}` : ""}`,
        ),
      );
      append(row, dot, info);
      if (editable())
        append(
          row,
          button(
            doc,
            "Изменить",
            "edit-person",
            () => {
              editingPerson = person.id;
              render();
            },
            false,
            "small",
          ),
          button(
            doc,
            "Удалить",
            "delete-person",
            () => {
              if (project.tasks.some((task) => task.personId === person.id)) {
                error("Участник назначен на задачи. Сначала переназначьте их.");
                return;
              }
              if (confirm(`Удалить участника «${person.name}»?`))
                commit({
                  ...project,
                  people: project.people.filter(
                    (item) => item.id !== person.id,
                  ),
                });
            },
            false,
            "small quiet",
          ),
        );
      list.append(row);
    }
    team.append(list);
    if (!project.people.length)
      team.append(
        el(doc, "p", "hint", "Добавьте участника, чтобы назначать задачи."),
      );
    if (plan) {
      const loadSection = el(doc, "div", "load-section");
      loadSection.append(el(doc, "h3", "", "Нагрузка до дедлайна"));
      for (const load of plan.loads) {
        const person = project.people.find((item) => item.id === load.personId);
        const item = el(doc, "div", "load-item");
        append(
          item,
          el(doc, "span", "", person?.name ?? load.personId),
          el(
            doc,
            "strong",
            load.overByHours ? "risk-text" : "",
            `${load.hours} / ${load.availableBeforeDeadline} ч`,
          ),
        );
        loadSection.append(item);
      }
      team.append(loadSection);
    }
    sidebar.append(team);
    const mainArea = el(doc, "div", "main-area");
    const chart = el(doc, "section", "panel chart-panel");
    append(
      chart,
      el(doc, "div", "section-heading", "Временная шкала"),
      el(
        doc,
        "p",
        "hint",
        "Один столбец — рабочий день. Число в ячейке — часы исполнителя.",
      ),
    );
    if (!project.tasks.length)
      chart.append(
        el(
          doc,
          "p",
          "hint",
          "Пока нет задач. Добавьте задачу ниже, и здесь появится распределение часов.",
        ),
      );
    if (plan) {
      const limit = Math.max(project.deadline, plan.finishDay, 8);
      const scroller = el(doc, "div", "timeline-scroll");
      scroller.dataset.testid = "timeline";
      const grid = el(doc, "div", "timeline");
      grid.style.setProperty("--days", limit);
      const head = el(doc, "div", "timeline-row timeline-head");
      append(head, el(doc, "div", "timeline-label", "Задачи / день"));
      for (let day = 1; day <= limit; day++)
        head.append(
          el(
            doc,
            "div",
            `day-header${day === project.deadline ? " deadline" : ""}`,
            String(day),
          ),
        );
      grid.append(head);
      for (const task of project.tasks) {
        const result = plan.tasks.find((item) => item.id === task.id);
        const personIndex = project.people.findIndex(
          (item) => item.id === task.personId,
        );
        const row = el(doc, "div", "timeline-row");
        const label = button(
          doc,
          task.title,
          "select-task",
          () => {
            selectedId = task.id;
            render();
          },
          false,
          `timeline-label task-label${selectedId === task.id ? " selected" : ""}`,
        );
        label.title = `${task.title}, ${project.people[personIndex]?.name ?? ""}, ${task.hours} ч`;
        row.append(label);
        for (let day = 1; day <= limit; day++) {
          const hours = result.allocations.find(
            (entry) => entry.day === day,
          )?.hours;
          const cell = el(
            doc,
            "div",
            `day-cell${day === project.deadline ? " deadline" : ""}${hours ? " allocated" : ""}`,
            hours ?? "",
          );
          if (hours) {
            cell.style.setProperty(
              "--person-color",
              colors[personIndex % colors.length],
            );
            cell.title = `${task.title}: день ${day}, ${hours} ч`;
          }
          row.append(cell);
        }
        grid.append(row);
      }
      const deadlineNote = el(
        doc,
        "p",
        "deadline-note",
        `Дедлайн отмечен границей дня ${project.deadline}.`,
      );
      append(scroller, grid);
      append(chart, scroller, deadlineNote);
    }
    mainArea.append(chart);
    if (plan && selectedId) {
      const task = project.tasks.find((item) => item.id === selectedId);
      const result = plan.tasks.find((item) => item.id === selectedId);
      if (task && result) {
        const explain = el(doc, "section", "panel explanation");
        append(
          explain,
          el(doc, "div", "section-heading", task.title),
          el(
            doc,
            "p",
            "",
            `Дни ${result.startDay}–${result.endDay}, ${task.hours} ч. Исполнитель: ${project.people.find((item) => item.id === task.personId)?.name}.`,
          ),
        );
        const blockers = result.blockingDependencies.map(
          (id) => project.tasks.find((entry) => entry.id === id)?.title ?? id,
        );
        append(
          explain,
          el(
            doc,
            "p",
            "",
            blockers.length
              ? `Ждёт завершения: ${blockers.join(", ")}. Возможный старт — день ${result.dependencyReadyDay}.`
              : `Зависимостей нет. Возможный старт — день ${result.dependencyReadyDay}.`,
          ),
          el(
            doc,
            "p",
            "",
            result.resourceDelayDays
              ? `Ожидание исполнителя: ${result.resourceDelayDays} раб. дн.${result.waitingFor.length ? ` Ёмкость заняли: ${result.waitingFor.map((id) => project.tasks.find((entry) => entry.id === id)?.title ?? id).join(", ")}.` : ""}`
              : "Ожидания исполнителя нет.",
          ),
        );
        mainArea.append(explain);
      }
    }
    append(workspaceGrid, sidebar, mainArea);
    shell.append(workspaceGrid);

    const editor = el(doc, "section", "editor-grid");
    const projectForm = el(doc, "div", "panel edit-panel");
    append(
      projectForm,
      el(doc, "h2", "", "Параметры проекта"),
      field(doc, "Название", "project-name", project.name, {
        disabled: !editable(),
      }),
      field(
        doc,
        "Дедлайн, рабочий день",
        "project-deadline",
        project.deadline,
        { type: "number", min: 1, max: 90, disabled: !editable() },
      ),
    );
    if (editable())
      projectForm.append(
        button(
          doc,
          "Сохранить проект",
          "save-project",
          saveProject,
          false,
          "primary",
        ),
      );
    else
      projectForm.append(
        el(
          doc,
          "p",
          "readonly-note",
          "Исходный план зафиксирован. Вернитесь к сценарию, чтобы изменить расчёт.",
        ),
      );
    editor.append(projectForm);

    if (editable()) {
      const person = project.people.find((item) => item.id === editingPerson);
      const peopleForm = el(doc, "div", "panel edit-panel");
      append(
        peopleForm,
        el(doc, "h2", "", person ? "Изменить участника" : "Добавить участника"),
        field(doc, "Имя", "person-name", person?.name ?? ""),
        field(doc, "Часов в день", "person-capacity", person?.capacity ?? 6, {
          type: "number",
          min: 1,
          max: 12,
        }),
        field(
          doc,
          "Недоступные дни",
          "person-away",
          person?.away.join(", ") ?? "",
          { placeholder: "Например: 3, 4, 9" },
        ),
        button(
          doc,
          person ? "Сохранить участника" : "Добавить участника",
          "save-person",
          savePerson,
          false,
          "primary",
        ),
      );
      if (person)
        peopleForm.append(
          button(doc, "Отмена", "cancel-person", () => {
            editingPerson = null;
            render();
          }),
        );
      editor.append(peopleForm);
    }
    shell.append(editor);

    const taskSection = el(doc, "section", "panel tasks-panel");
    append(
      taskSection,
      el(doc, "div", "section-heading", "Задачи"),
      el(
        doc,
        "p",
        "hint",
        "Выберите строку на шкале, чтобы увидеть причины ожидания.",
      ),
    );
    const taskList = el(doc, "div", "task-list");
    for (const task of project.tasks) {
      const row = el(doc, "div", "task-row");
      const main = append(
        el(doc, "div", "task-row-main"),
        el(doc, "strong", "", task.title),
        el(
          doc,
          "span",
          "muted",
          `${project.people.find((person) => person.id === task.personId)?.name ?? "?"} · ${task.hours} ч · с дня ${task.releaseDay}${task.required ? " · обязательная" : " · дополнительная"}`,
        ),
      );
      row.append(main);
      if (editable())
        append(
          row,
          button(
            doc,
            "Изменить",
            "edit-task",
            () => {
              editingTask = task.id;
              render();
            },
            false,
            "small",
          ),
          button(
            doc,
            "Удалить",
            "delete-task",
            () => {
              if (
                project.tasks.some((item) =>
                  item.dependencies.includes(task.id),
                )
              ) {
                error(
                  "На задачу ссылаются другие задачи. Сначала измените их зависимости.",
                );
                return;
              }
              if (confirm(`Удалить задачу «${task.title}»?`))
                commit({
                  ...project,
                  tasks: project.tasks.filter((item) => item.id !== task.id),
                });
            },
            false,
            "small quiet",
          ),
        );
      if (view === "scenario" && !task.required)
        row.append(
          button(
            doc,
            "Убрать объём",
            "preview-removal",
            () => {
              try {
                const impact = removalImpact(project, task.id);
                const names = impact.removedIds.map(
                  (id) =>
                    project.tasks.find((item) => item.id === id)?.title ?? id,
                );
                if (impact.blockedByRequired.length) {
                  error(
                    `Сокращение невозможно: затрагиваются обязательные задачи — ${impact.blockedByRequired.map((id) => project.tasks.find((item) => item.id === id)?.title ?? id).join(", ")}. Полный список: ${names.join(", ")}.`,
                  );
                  return;
                }
                if (
                  confirm(
                    `Будут удалены задачи: ${names.join(", ")}. Продолжить?`,
                  )
                )
                  commit(removeOptional(project, task.id));
              } catch (cause) {
                error(cause.message);
              }
            },
            false,
            "small scope",
          ),
        );
      taskList.append(row);
    }
    taskSection.append(taskList);
    if (editable()) {
      const task = project.tasks.find((item) => item.id === editingTask);
      const form = el(doc, "div", "task-form");
      form.append(
        el(doc, "h3", "", task ? "Изменить задачу" : "Добавить задачу"),
      );
      append(
        form,
        field(doc, "Задача", "task-title", task?.title ?? ""),
        select(
          doc,
          "Исполнитель",
          "task-person",
          project.people.map((person) => [person.id, person.name]),
          task?.personId ?? project.people[0]?.id,
          false,
        ),
        field(doc, "Оценка, часов", "task-hours", task?.hours ?? 8, {
          type: "number",
          min: 1,
          max: 80,
        }),
        field(doc, "Доступна с дня", "task-release", task?.releaseDay ?? 1, {
          type: "number",
          min: 1,
          max: 90,
        }),
      );
      const required = el(doc, "label", "check-row");
      const checkbox = el(doc, "input");
      checkbox.type = "checkbox";
      checkbox.name = "task-required";
      checkbox.checked = task?.required ?? true;
      append(required, checkbox, el(doc, "span", "", "Обязательная задача"));
      form.append(required);
      const dependencyGroup = el(doc, "fieldset", "dependency-list");
      dependencyGroup.append(el(doc, "legend", "", "После задач"));
      for (const option of project.tasks.filter(
        (item) => item.id !== editingTask,
      )) {
        const choice = el(doc, "label", "check-row");
        const box = el(doc, "input");
        box.type = "checkbox";
        box.name = "task-dependency";
        box.value = option.id;
        box.checked = task?.dependencies.includes(option.id) ?? false;
        append(choice, box, el(doc, "span", "", option.title));
        dependencyGroup.append(choice);
      }
      form.append(dependencyGroup);
      form.append(
        button(
          doc,
          task ? "Сохранить задачу" : "Добавить задачу",
          "save-task",
          saveTask,
          !project.people.length,
          "primary",
        ),
      );
      if (task)
        form.append(
          button(doc, "Отмена", "cancel-task", () => {
            editingTask = null;
            render();
          }),
        );
      taskSection.append(form);
    }
    shell.append(taskSection);
    if (comparison) {
      const compare = el(doc, "section", "panel compare-panel");
      append(
        compare,
        el(doc, "div", "section-heading", "Сравнение с исходным планом"),
        el(
          doc,
          "p",
          "",
          `Завершение: день ${comparison.base.finishDay} → день ${comparison.scenario.finishDay}.`,
        ),
      );
      for (const change of comparison.changes.filter(
        (item) => item.beforeEnd !== item.afterEnd,
      )) {
        const title =
          workspace.base.tasks.find((item) => item.id === change.id)?.title ??
          workspace.scenario.tasks.find((item) => item.id === change.id)
            ?.title ??
          change.id;
        compare.append(
          el(
            doc,
            "p",
            "change-line",
            `${title}: ${change.beforeEnd ?? "новая"} → ${change.afterEnd ?? "убрана"}${change.delta === null ? "" : ` (${change.delta > 0 ? "+" : ""}${change.delta})`}`,
          ),
        );
      }
      shell.append(compare);
    }
    shell.append(
      el(
        doc,
        "footer",
        "footer",
        "Локальный планировщик · зависимости стартуют со следующего рабочего дня · расчёт по порядку списка, без гарантии оптимальности",
      ),
    );
    root.append(shell);
  }
  render();
  return { getWorkspace: () => structuredClone(workspace) };
}

function browserDownload(text, filename) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
