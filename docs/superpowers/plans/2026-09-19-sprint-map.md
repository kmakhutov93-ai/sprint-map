# Sprint Map Implementation Plan

> Execute the approved scope in this session. Use test-driven-development and verification-before-completion. Delegate the bounded UI task with subagent-driven-development while preparing the independent engine locally.

**Goal:** Рабочий локальный планировщик команды с объяснимым расписанием и сценариями.
**Architecture:** Чистый модуль планирования, модуль хранения, браузерное представление.
**Tech Stack:** JavaScript ES modules, HTML, CSS, Node.js 24+, node:test, ESLint, Prettier, LinkeDOM.
**Spec:** docs/design.md.

## Global Constraints

- Только локально, без remote, внешней публикации и production-зависимостей.
- Рабочие дни от 1; зависимости завершаются до дня начала зависимой задачи.
- До 10 участников, 40 задач, 366 дней расчёта; остальные лимиты в спецификации.
- Весь пользовательский текст выводить через textContent.
- Не скрывать ошибки импорта, сохранения и расчёта; не уничтожать старое сохранение.

## Task 1: Расчёт и модель

Files: src/planner.js, src/demo.js, tests/planner.test.js.
Interfaces: validateProject, schedule, comparePlans, removalImpact, removeOptional из design.md.

- [x] Написать тест: две задачи одного человека по 6ч, доступность 4ч → завершение на день 3; зависимая задача стартует на день 3 после предшественника на день 2.
- [x] Запустить `node --test tests/planner.test.js`, увидеть отсутствие реализации.
- [x] Реализовать проверку модели, стабильную топологическую сортировку и распределение часов по дням.
- [x] Проверить циклы, неверные ссылки, отсутствие, пределы, чистоту функций и сокращение объёма.
- [x] Запустить целевые тесты, проверить diff.

## Task 2: Интерфейс и сценарии

Files: index.html, styles.css, favicon.svg, src/app.js, src/main.js, tests/app.test.js.
Consumes: все функции планировщика, demoProject() из src/demo.js, функции хранения.
Produces: mountApp(document,{storage,confirm,download}) для тестируемых событий UI.

- [x] Написать DOM-тесты редактирования, сценария, ошибок и безопасного вывода.
- Запуск UI-тестов до реализации: отдельный результат не сохранён в отчёте исполнителя; не подтверждён.
- [x] Сделать основной экран по design.md: формы участников/задач, график, нагрузка, объяснения.
- [x] Подключить импорт/экспорт, сохранение, readonly исходный план, сброс сценария.
- [x] Проверить клики и состояние; форматировать только собственные файлы.

## Task 3: Сохранение и локальный запуск

Files: src/storage.js, tests/storage.test.js, scripts/serve.js, tests/server.test.js.
Consumes: validateProject(project). Produces: parseWorkspace, serializeWorkspace, loadWorkspace, saveWorkspace; createAppServer().

- [x] Тесты: экспорт/импорт сохраняет обе модели; повреждённый JSON и недоступное хранилище дают ошибку, старая запись остаётся.
- [x] Тест сервера: GET / → 200, приватные пути → 404, POST → 405.
- [x] Запустить тесты до реализации, затем написать минимальную реализацию.
- [x] Проверить лимиты и белый список отдаваемых файлов.

## Task 4: Приёмка и документация

Files: README.md, LICENSE, docs/STATUS.md.

- [x] Описать запуск, честные ограничения, пример и участие Codex.
- [x] `npm run check`: линтер, форматирование, все тесты.
- [x] Проверить интерфейс в браузере, если доступен; иначе явно зафиксировать ограничение.
- [x] Проверить staged/diff/историю на секреты и лишние файлы, сохранить локальный коммит.
- [x] Запустить локальный сервер, сообщить адрес и точные результаты проверок.
