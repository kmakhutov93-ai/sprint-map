import { validateProject } from "./planner.js";

const KEY = "sprint-map.workspace.v1";
const MAX_LENGTH = 200_000;

function validateWorkspace(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    input.version !== 1
  )
    throw new Error("Ожидается файл Sprint Map версии 1.");
  if (
    input.scenario !== null &&
    (!input.scenario || typeof input.scenario !== "object")
  )
    throw new Error("В файле отсутствует корректное поле сценария.");
  return {
    version: 1,
    base: validateProject(input.base),
    scenario: input.scenario === null ? null : validateProject(input.scenario),
  };
}

export function parseWorkspace(source) {
  if (typeof source !== "string" || source.length > MAX_LENGTH)
    throw new Error("Файл слишком большой: максимум 200 000 символов JSON.");
  let input;
  try {
    input = JSON.parse(source);
  } catch {
    throw new Error(
      "Не удалось прочитать JSON. Выберите файл, экспортированный из Sprint Map.",
    );
  }
  return validateWorkspace(input);
}

export function serializeWorkspace(workspace) {
  const output = JSON.stringify(validateWorkspace(workspace), null, 2);
  if (output.length > MAX_LENGTH)
    throw new Error(
      "План слишком большой для сохранения: максимум 200 000 символов JSON.",
    );
  return output;
}

export function loadWorkspace(storage) {
  let source;
  try {
    source = storage.getItem(KEY);
  } catch {
    throw new Error(
      "Браузер не дал доступ к хранилищу. Используйте импорт и экспорт файла.",
    );
  }
  return source === null ? null : parseWorkspace(source);
}

export function saveWorkspace(storage, workspace) {
  const source = serializeWorkspace(workspace);
  try {
    storage.setItem(KEY, source);
  } catch {
    throw new Error(
      "Не удалось сохранить план в браузере. Скачайте экспорт, чтобы не потерять изменения.",
    );
  }
}
