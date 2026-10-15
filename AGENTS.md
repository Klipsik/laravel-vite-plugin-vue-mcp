# AGENTS.md — правила для агентов

Пакет: `laravel-vite-plugin-vue-mcp` — **форк** [vite-plugin-vue-mcp](https://github.com/webfansplz/vite-plugin-vue-mcp)
от [Arlo (@webfansplz)](https://github.com/webfansplz), адаптированный под **Laravel**.

- npm: https://www.npmjs.com/package/laravel-vite-plugin-vue-mcp (имя свободно не будет — занято нами)
- GitHub: https://github.com/Klipsik/laravel-vite-plugin-vue-mcp (origin)
- upstream: webfansplz/vite-plugin-vue-mcp (remote `upstream`), `fork-original` → Klipsik/vite-plugin-vue-mcp
- Публикуется под аккаунтом npm `klips` (email klipsik@mail.ru, GitHub Klipsik), 2FA `auth-and-writes`
- Атрибуция оригинала обязательна: `author` в package.json, LICENSE, credits в README

## Архитектура (как это работает)

1. Vite-плагин (`src/index.ts`) поднимает MCP-сервер (`@modelcontextprotocol/sdk`) поверх SSE
   в dev-сервере: `GET /__mcp/sse` + `POST /__mcp/messages` (`src/connect.ts`).
2. В браузер инжектится overlay (`src/overlay.js`): либо `<script>` в HTML
   (`transformIndexHtml`), либо `import` в JS-entry (`appendTo`) — так работает Laravel.
3. Overlay общается с сервером через RPC поверх Vite WebSocket
   (`vite-dev-rpc` + `vite-hot-client` + birpc). Канал называется
   `laravel-vite-plugin-vue-mcp` — **имя должно совпадать в `src/index.ts` и `src/overlay.js`**,
   иначе тулы молча повиснут.
4. Инструменты (`src/server.ts`): `get-component-tree`, `get-component-state`,
   `edit-component-state`, `highlight-component`, `get-router-info`, `get-pinia-tree`,
   `get-pinia-state`. Они ждут ответа браузера через `ctx.hooks` — **без подключённой
   страницы в браузере любой вызов тула висит бесконечно**. При отладке всегда проверяй,
   что страница реально открыта и overlay загрузился.

## Laravel-специфика (главное, не ломать)

- У Laravel нет `index.html`: HTML отдаёт PHP, а Vite — отдельный dev-сервер на другом порту.
  Поэтому плагин детектит Laravel по файлу `artisan` и подключает overlay к JS-entry.
- Entry определяется из `build.rollupOptions.input` (его пробрасывает `laravel-vite-plugin@2`
  из своего `input`) или по соглашениям: `resources/ts/main.ts` (Vuexy), `resources/js/app.js|ts`,
  `resources/scripts/app.*`, `resources/js/ssr.*`. Переопределение — опцией `appendTo`
  (механизм намеренно переиспользуется, отдельного `laravel.entry` НЕ делать).
- **Origin Vite в браузере** берётся из Blade-тега `<script src=".../@vite/client">`
  (сам тег генерируется из `public/hot`). Нельзя хардкодить порты и нельзя брать
  `location.origin` — иначе RPC умирает («RPC calls are ignored», тулы висят).
- Порты произвольные (проверялось 8000/5199 и 8010/5170). Печатаемый URL и `.cursor/mcp.json`
  берут resolved `server.port` (учитывает CLI `--port`, конфиг и env `VITE_PORT`).
- Peer-диапазон `vite` обязан включать `^7` и `^8` (Laravel 12 идёт с Vite 7; bun приносит 8).
- `get-router-info` должен возвращать `null`, если vue-router нет (Laravel + Inertia).

## Опции публичного API

- `updateMcpJson`: `boolean | string | string[] | { ide?, serverName? }`. IDE: `cursor`
  (`.cursor/mcp.json`, `mcpServers`, `{url}`), `opencode` (`opencode.json`, `mcp`,
  `{type:'remote',url}` + `$schema`), `kilo` (`kilo.json`, `mcp`,
  `{type:'remote',url,enabled:true}` + `$schema`). Реализация — `src/ide-configs.ts`.
  Явный список IDE → создаёт папки/файлы; `true` → только существующие файлы;
  `false` → выключено. Существующие entry'ы и `$schema` сохраняются, шелл-формат
  перезаписывается (2-space JSON).
- `updateCursorMcpJson` — deprecated, но работает как раньше (только `.cursor/mcp.json`,
  и только если папка `.cursor` уже есть).
- `laravel?: boolean` — форс/отключение авто-детекта Laravel.
- `appendTo?: string | RegExp` — ручная точка монтирования overlay.
- `printUrl`, `mcpPath` (`/__mcp`), `host`, `mcpServer`, `mcpServerSetup` — из оригинала.

## Публикация (npm + GitHub)

- **Никогда не публикуй без явной команды пользователя** («публикуй»).
- В `package.json` зависимостей НЕ должно быть `catalog:` / `workspace:` — npm и bun не
  понимают протокол pnpm-workspace. Конкретные версии + `pnpm: false` в eslint.config.js.
- `dist/` закоммичен в git: bun блокирует postinstall/`prepare`, поэтому без диста
  установка с GitHub даёт битый пакет. Правишь `src/` → обязательно `pnpm build` и коммит диста.
- npm: `npm login` (веб-флоу), затем `npm publish --access public` — откроется ссылка вида
  `https://www.npmjs.com/auth/cli/<uuid>`, пользователь подтверждает ключом в браузере.
  Проверка до публикации: `npm publish --dry-run --access public`.
- Версии: `pnpm release` (bumpp) → `git push --follow-tags` → `npm publish`.
- После публикации: `npm view laravel-vite-plugin-vue-mcp version` должен показать
  актуальную версию; иногда реестр отдаёт временный `0.0.0-stage` ("Temporary package
  placeholder for staged publishing") — это нормально, `latest` выправится сам.
- Установка пользователям: `pnpm add -D laravel-vite-plugin-vue-mcp` (npm/bun — аналогично),
  альтернатива `github:Klipsik/laravel-vite-plugin-vue-mcp`.

## Тестирование на реальном проекте пользователя

Проект: `/home/klips/vuexy-v10.11.1/vue-laravel-version/typescript-version/full-version`
(Vuexy v10.11.1, Laravel + TS-версия, entry `resources/ts/main.ts`, laravel-vite-plugin 2.0.0,
Vite 7.1.12, pnpm, установлены node_modules и vendor).

Правила пользования этим проектом:
1. **Бэкап `vite.config.ts` перед любой правкой, восстановление после теста** (копия в /tmp/kilo).
2. Тестовый Vite поднимать ТОЛЬКО на свободном порту (`--port 5199/5170/5200`).
   У пользователя уже крутятся: Vite `:5173` и `php artisan serve` `:8000` — их не трогать.
3. Свой Vite перезаписывает `public/hot` — на старте проверить, что Laravel тянет ассеты с него,
   после теста вернуть файл в исходное состояние (`echo -n 'http://127.0.0.1:5173' > public/hot`,
   т.к. при остановке Vite laravel-плагин удаляет `public/hot`).
4. Ничего не оставлять в проекте: ни `VueMcp()` в конфиге, ни лишних `.cursor/`, `opencode.json`,
   `kilo.json` (кроме случаев, когда пользователь просит их создать), ни тестовых зависимостей
   (`pnpm remove`). `.env`, `vendor/`, `node_modules/` — можно оставлять (нужны для запуска).
5. Полный e2e тест = Laravel (`:8000`) + свой Vite + открытая страница в браузере
   (chrome-devtools MCP) + MCP-клиент по SSE. Пример клиента — через SDK из
   `node_modules/@modelcontextprotocol/sdk` самого плагина:
   `SSEClientTransport` + `Client` → `connect` → `listTools` → `callTool`.
   Тулы `get-*` требуют живой страницы с overlay; `highlight-component`/`edit-component-state`
   можно проверять по ответу `ok` + наличию `__vue-devtools-component-inspector__` в DOM.
6. Референсы форматов IDE-конфигов живут в `/var/www/katyusha-ai` (`kilo.json`,
   `opencode.json`, `.cursor/mcp.json`) — их НЕ изменять.

## Команды и проверки

- `pnpm build` (unbuild, собирает `dist/`), `pnpm lint` (eslint) — оба должны быть зелёными.
- Локальная ссылка для тестов: `pnpm add -D file:/home/klips/projects/vite-plugin-vue-mcp`
  в тестовом проекте (эквивалент установки из реестра).
- После любых правок в `src/overlay.js` или имени RPC-канала — обязательно пересобрать дист
  и прогонять полный тест, а не только сборку.

## Чего делать НЕЛЬЗЯ

- Не менять имя RPC-канала только на одной стороне (сервер/оверлей).
- Не возвращать `catalog:` в зависимости и не «починить» линтер отключением правила про дист.
- Не хардкодить порты Vite/Laravel где-либо в коде.
- Не публиковать в npm/GitHub без явного «публикуй».
- Не оставлять `public/hot` указывающим на свой тестовый Vite.
- Не удалять и не перезаписывать IDE-конфиги и запущенные серверы пользователя.
