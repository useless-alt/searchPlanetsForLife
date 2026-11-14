# Отчёт по зачистке черновика (Задача 0)

Дата: 14.11.2026
Репозиторий: `searchPlanetsForLife`
Ветка работы: `rewrite`
Тег бэкапа: `pre-rewrite` → commit `10ad6ab` («chore: draft snapshot with Supabase catalog integration (pre-rewrite state)»)

---

## 0. Как выполнялась работа (бэкап до изменений)

1. В рабочем дереве находилась незакоммиченная работа по Supabase (клиент, Edge-функция `/api/catalog`, скрипт выгрузки, `supabase/schema.sql`, `.env.example`). Чтобы тег `pre-rewrite` фиксировал **всё** состояние черновика, она сначала зафиксирована коммитом-снапшотом в `main` (`10ad6ab`), и только после этого создан тег.
2. `git tag -a pre-rewrite` — аннотированный тег на `10ad6ab`.
3. `git checkout -b rewrite` — ветка `rewrite` создана от того же коммита. **Все** изменения этой задачи выполнены только в `rewrite`; `main` не изменялся после снапшот-коммита.
4. Полное состояние черновика восстановимо в любой момент: `git checkout pre-rewrite` (или `git diff pre-rewrite..rewrite`).

Откат отдельных файлов: `git checkout pre-rewrite -- <путь>`.

---

## 1. Стек черновика (зафиксировано до зачистки)

### 1.1 Общая картина

| Слой | Значение в черновике |
|---|---|
| Фреймворк | React 18.3.1 (`react-dom` 18.3.1), SPA |
| Сборщик | Vite 5.4.10 (в lock — 5.4.21), плагин `@vitejs/plugin-react` 4.3.3 |
| Язык | TypeScript 5.6.3, `strict: true` (без `noUncheckedIndexedAccess`) |
| Стили | Tailwind CSS 3.4.14 + PostCSS 8.4.49 + autoprefixer 10.4.20 |
| UI-кит | shadcn/ui-подобные примитивы на Radix (`react-dialog` 1.1.2, `react-slider` 1.2.1, `react-tooltip` 1.1.3) + `lucide-react` 0.454 + `clsx` 2.1.1 + `tailwind-merge` 2.5.4 |
| Таблица | `@tanstack/react-table` 8.20.5 |
| Состояние | `zustand` 5.0.1 (+ сериализация состояния в URL) |
| 3D | `three` 0.169.0 + `@react-three/fiber` 8.17.10 + `@react-three/drei` 9.114.3 |
| Графики | `recharts` 2.13.3 |
| Валидация | `zod` 3.23.8 |
| Кэш | `idb` 8.0.0 (IndexedDB: копии ответов и ротация бэкапов) |
| CSV-fallback | `papaparse` 5.4.1 |
| БД | `@supabase/supabase-js` 2.119.0 (Postgres + RLS) |
| Тесты | Vitest 2.1.4 + jsdom 25 (конфиг в `vite.config.ts`, `include: src/**/*.test.ts`) |
| Линт / формат | **отсутствуют** (ни ESLint, ни Prettier) |
| Менеджер пакетов | npm (`package-lock.json`, lockfile v3), единственный `package.json` в `frontend/`; workspaces не использовались |
| Node.js | 18+ (по документации черновика) |
| Деплой | Vercel: Root Directory = `frontend`, статический билд Vite + Edge-функции `api/proxy.ts`, `api/catalog.ts` |
| Структура | одно приложение в подпапке `frontend/` (не монорепо): `src/{components,three,lib/{calc,sources,pipeline,cache},workers,store,hooks}`, `api/`, `scripts/` |

### 1.2 Что из этого реально осталось после зачистки

Остался только «каркас + Supabase»: `@supabase/supabase-js` (runtime) и tooling сборки — `vite`, `vitest`, `jsdom`, `typescript`, `@vitejs/plugin-react`, `@types/node`, `tailwindcss`, `postcss`, `autoprefixer`.

---

## 2. Инвентаризация

Путь | Назначение | Решение

### 2.1 Корень репозитория

| Путь | Назначение | Решение |
|---|---|---|
| `.env.example` | шаблон переменных окружения Supabase (значения пустые) | **оставить** |
| `.gitignore` | исключения `.env*`, `node_modules`, `dist`, `/.vercel`, `/.agents`, `/data/` | **оставить** |
| `README.md` | документация черновика: архитектура, методика, формулы, деплой | **оставить** (документация; описывает уже удалённый UI — будет переписан в 1.2) |
| `backend/.gitkeep` | плейсхолдер пустой папки `backend/` | **оставить** |
| `ml/.gitkeep` | плейсхолдер пустой папки `ml/` | **оставить** |
| `docs/data-sources.md` | описание 6 научных источников, ADQL-запросы, форматы ответов | **оставить** (нужно адаптерам из 1.2) |
| `docs/json-extraction.md` | алгоритм извлечения JSON из TAP-ответов | **оставить** (нужно адаптерам из 1.2) |
| `exoplanet-prompt-v3-oneshot.md` | исходное ТЗ проекта (стек, источники, физика) | **оставить** (источник требований) |
| `goALL.yml` | пустой файл (0 байт), назначения нет | **удалить** |

### 2.2 Supabase-фича (keep)

| Путь | Назначение | Решение |
|---|---|---|
| `supabase/schema.sql` | DDL: `catalog_snapshots`, `catalog_rows`, индексы, включение RLS | **оставить** |
| `frontend/api/catalog.ts` | Vercel Edge-функция `/api/catalog` (обёртка над обработчиком) | **оставить** |
| `frontend/api/supabase-handler.ts` | серверная логика Supabase: чтение/запись выгрузок, работа с service-role/PAT-ключом | **оставить** |
| `frontend/src/lib/supabase/catalog.ts` | клиентский доступ к каталогам через `/api/catalog` (health, чтение, запись) | **оставить** (адаптирован, см. §4.1) |
| `frontend/src/lib/supabase/catalog.test.ts` | тесты `readConfig` и разбора `.env` | **оставить** |
| `frontend/scripts/upload-catalog.mjs` | скрипт выгрузки снимков в Postgres (REST) | **оставить** |
| `scripts/apply-supabase-schema.mjs` | применение `supabase/schema.sql` через management API | **оставить** |
| `scripts/check-supabase-keys.mjs` | диагностика, какой из ключей проекта работает с REST | **оставить** |
| `frontend/src/types.ts` | типы домена (`SourceId`, `PlanetEntity`, `FieldValue`, …), нужные клиенту Supabase | **оставить** |

### 2.3 Конфигурация и окружение (keep)

| Путь | Назначение | Решение |
|---|---|---|
| `frontend/tsconfig.json` | настройки TS (strict, alias `@/*` → `src/*`, `include: src, api, vite.config.ts`) | **оставить** |
| `frontend/vite.config.ts` | конфиг сборщика: плагины, alias, порт dev-сервера, конфиг Vitest | **оставить** |
| `frontend/vite.dev-proxy.ts` | dev-реализация серверного маршрута `/api/catalog` без `vercel dev` | **оставить** (адаптирован, см. §4.2) |
| `frontend/tailwind.config.js` | тема Tailwind (цвета, шрифты) | **оставить** |
| `frontend/postcss.config.js` | PostCSS: tailwindcss + autoprefixer | **оставить** |
| `frontend/.env.example` | шаблон переменных Supabase для `frontend/` | **оставить** |
| `frontend/.gitignore` | исключения `.env*`, `.vercel` | **оставить** |
| `frontend/.gitkeep` | плейсхолдер | **оставить** |
| `frontend/index.html` | точка входа сборки Vite (оболочка страницы) | **адаптировать** (см. §4.3) |
| `frontend/package.json` | манифест зависимостей и скриптов | **адаптировать** (см. §4.4) |
| `frontend/package-lock.json` | lockfile npm | **адаптировать** (перегенерирован) |

### 2.4 Данные и скрипты черновика

| Путь | Назначение | Решение |
|---|---|---|
| `frontend/public/data/snapshots/{nasa,exomercat,exoplanet_eu,gaia,simbad}.json` | аварийные снимки каталогов; входные данные для `npm run upload:catalog` | **оставить** (единственный оставшийся потребитель — сохранённая функция выгрузки; см. §7) |
| `frontend/scripts/make-snapshots.mjs` | генератор снимков (Vite `ssrLoadModule` + `src/lib/sources`) | **удалить** |
| `frontend/scripts/snapshot-runner.ts` | раннер выгрузки источников для генератора снимков | **удалить** |
| `scripts/make-snapshots.mjs` | дубликат генератора снимков в корне | **удалить** |
| `scripts/fetch-sources.ps1` | PowerShell-загрузка сырых JSON в `data/backups/` | **удалить** (в 1.2 загрузкой занимается `apps/server`) |

### 2.5 UI старого сайта (удалить)

| Путь | Назначение | Решение |
|---|---|---|
| `frontend/src/App.tsx` | корневой компонент приложения | **удалить** |
| `frontend/src/main.tsx` | точка монтирования React | **удалить** |
| `frontend/src/index.css` | стили сайта (Tailwind-директивы + CSS-переменные) | **удалить** |
| `frontend/src/components/Header.tsx` | верхняя панель | **удалить** |
| `frontend/src/components/Counters.tsx` | счётчики выборки | **удалить** |
| `frontend/src/components/TopTable.tsx` | таблица Топ-50 (TanStack Table) | **удалить** |
| `frontend/src/components/FiltersPanel.tsx` | панель фильтров | **удалить** |
| `frontend/src/components/ModelPanel.tsx` | панель параметров модели | **удалить** |
| `frontend/src/components/MethodologyDialog.tsx` | модалка «Методика и ограничения» | **удалить** |
| `frontend/src/components/PlanetCard.tsx` | карточка планеты (+ Recharts) | **удалить** |
| `frontend/src/components/SourcesPanel.tsx` | панель статусов источников (использовала Supabase-клиент) | **удалить** |
| `frontend/src/components/StartupProgress.tsx` | стартовый экран прогресса | **удалить** |
| `frontend/src/components/StatusBar.tsx` | строка статуса | **удалить** |
| `frontend/src/components/EarthRow.tsx` | калибровочная строка «Земля (эталон)» | **удалить** |
| `frontend/src/components/ErrorBoundary.tsx` | граница ошибок React | **удалить** |
| `frontend/src/components/status.ts` | подписи статусов/уровней данных (в т.ч. `supabase`) | **удалить** |
| `frontend/src/components/ui/button.tsx` | примитив кнопки (shadcn-стиль) | **удалить** |
| `frontend/src/components/ui/dialog.tsx` | примитив диалога (Radix) | **удалить** |
| `frontend/src/components/ui/slider.tsx` | примитив ползунка (Radix) | **удалить** |
| `frontend/src/components/ui/tooltip.tsx` | примитив подсказки (Radix) | **удалить** |

### 2.6 Логика расчётов и данных (удалить)

| Путь | Назначение | Решение |
|---|---|---|
| `frontend/src/config.ts` | все константы и пороги модели | **удалить** (переезжает в `packages/shared`) |
| `frontend/src/lib/utils.ts` | утилита `cn()` для классов Tailwind | **удалить** |
| `frontend/src/lib/calc/num.ts` | `num()` — приведение к числу, `null ≠ 0` | **удалить** |
| `frontend/src/lib/calc/esi.ts` | подындексы ESI | **удалить** |
| `frontend/src/lib/calc/hz.ts` | зона обитаемости (Коппарапу) | **удалить** |
| `frontend/src/lib/calc/chen-kipping.ts` | Уровень Б: масса ↔ радиус | **удалить** |
| `frontend/src/lib/calc/penalties.ts` | штрафы `P_rocky`, `P_ecc`, `P_star` | **удалить** |
| `frontend/src/lib/calc/scoring.ts` | 4 режима индекса, `Q_data` | **удалить** |
| `frontend/src/lib/calc/solver.ts` | каскадный решатель пропусков (Уровни А/Б/В) | **удалить** |
| `frontend/src/lib/calc/calc.test.ts` | тесты эталона «Земля», TRAPPIST-1 e, Чен — Киппинг | **удалить** |
| `frontend/src/lib/calc/scoring.test.ts` | тесты режимов и штрафов | **удалить** |
| `frontend/src/lib/sources/tap.ts` | общий TAP-клиент (ADQL, sync) | **удалить** |
| `frontend/src/lib/sources/transport.ts` | политика транспорта: HTTPS→proxy, ретраи, таймауты | **удалить** |
| `frontend/src/lib/sources/parser.ts` | разбор TAP/JSON/CSV-ответов (`Row`, `parseTapResponse`) | **удалить** |
| `frontend/src/lib/sources/schema.ts` | SCHEMA GUARD: пересечение желаемых и реальных колонок | **удалить** |
| `frontend/src/lib/sources/nasa.ts` | адаптер NASA Exoplanet Archive | **удалить** |
| `frontend/src/lib/sources/exomercat.ts` | адаптер Exo-MerCat | **удалить** |
| `frontend/src/lib/sources/exoplanetEu.ts` | адаптер Exoplanet.eu | **удалить** |
| `frontend/src/lib/sources/gaia.ts` | адаптер ESA Gaia DR3 | **удалить** |
| `frontend/src/lib/sources/simbad.ts` | адаптер CDS SIMBAD | **удалить** |
| `frontend/src/lib/sources/exomast.ts` | ленивый адаптер Exo.MAST (identifiers/properties/spectra) | **удалить** |
| `frontend/src/lib/sources/parser.test.ts` | тесты парсера | **удалить** |
| `frontend/src/lib/sources/schema.test.ts` | тесты SCHEMA GUARD | **удалить** |
| `frontend/src/lib/sources/transport.test.ts` | тесты политики транспорта (мок `fetch`) | **удалить** |
| `frontend/src/lib/pipeline/merge.ts` | дедупликация и слияние источников (S0–S4, консенсус) | **удалить** |
| `frontend/src/lib/pipeline/names.ts` | `normName`, `hostKey`, буквы планет | **удалить** |
| `frontend/src/lib/pipeline/run.ts` | прогон загрузки; **единственный** потребитель Supabase-клиента в черновике | **удалить** |
| `frontend/src/lib/pipeline/merge.test.ts` | тесты дедупликации | **удалить** |
| `frontend/src/lib/pipeline/names.test.ts` | тесты нормализации имён | **удалить** |
| `frontend/src/lib/cache/backups.ts` | резервные копии в IndexedDB (ротация 5 версий, sha256) | **удалить** (в 1.2 — ФС сервера) |
| `frontend/src/lib/cache/snapshots.ts` | кэш снимков в IndexedDB (валидация через `zod`) | **удалить** |
| `frontend/src/lib/cache/backups.test.ts` | тесты ротации бэкапов | **удалить** |
| `frontend/src/lib/cache/snapshots.test.ts` | тесты кэша снимков | **удалить** |
| `frontend/src/store/useAppStore.ts` | Zustand-стор (режим, фильтры, pinned) | **удалить** |
| `frontend/src/store/urlState.ts` | сериализация состояния в URL | **удалить** |
| `frontend/src/store/urlState.test.ts` | тесты URL-состояния | **удалить** |
| `frontend/src/hooks/useDebouncedValue.ts` | debounce для ползунков | **удалить** |
| `frontend/src/hooks/useWebGL.ts` | проверка поддержки WebGL | **удалить** |
| `frontend/src/workers/pipeline.worker.ts` | module Web Worker: загрузка, слияние, решатель | **удалить** (в 1.2 — пересчёт в Web Worker `apps/web`) |
| `frontend/src/workers/client.ts` | клиент-обёртка над Worker | **удалить** |
| `frontend/src/workers/messages.ts` | типы сообщений Worker ↔ UI | **удалить** |

### 2.7 3D-код (удалить)

| Путь | Назначение | Решение |
|---|---|---|
| `frontend/src/three/GalaxyMap.tsx` | 3D-карта Галактики | **удалить** |
| `frontend/src/three/SystemScene.tsx` | 3D-сцена системы | **удалить** |
| `frontend/src/three/blackbody.ts` | цвет звезды по температуре (blackbody → sRGB) | **удалить** |
| `frontend/src/three/coords.ts` | перевод экваториальных координат в 3D | **удалить** |
| `frontend/src/three/shaders.ts` | процедурные GLSL-шейдеры | **удалить** |

### 2.8 Серверный прокси к научным API (удалить)

| Путь | Назначение | Решение |
|---|---|---|
| `frontend/api/proxy.ts` | Vercel Edge-функция `/api/proxy` (обёртка, allowlist хостов) | **удалить** |
| `frontend/api/proxy-handler.ts` | реализация прокси с SSRF-защитой | **удалить** (в 1.2 запросы идут из `apps/server`) |

---

## 3. Список удалённого (итог)

**73 файла** удалено из отслеживаемых:

- **UI и страницы (20):** `src/App.tsx`, `src/main.tsx`, `src/index.css`, 12 компонентов в `src/components/`, 4 примитива в `src/components/ui/`, `src/components/status.ts`.
- **3D (5):** `src/three/{GalaxyMap,SystemScene}.tsx`, `src/three/{blackbody,coords,shaders}.ts`.
- **Расчёты и данные (33):** `src/config.ts`, `src/lib/utils.ts`, `src/lib/calc/*` (9), `src/lib/sources/*` (13), `src/lib/pipeline/*` (5), `src/lib/cache/*` (4).
- **Состояние, хуки, воркер (8):** `src/store/*` (3), `src/hooks/*` (2), `src/workers/*` (3).
- **Серверный прокси и скрипты (6):** `frontend/api/proxy.ts`, `frontend/api/proxy-handler.ts`, `frontend/scripts/make-snapshots.mjs`, `frontend/scripts/snapshot-runner.ts`, `scripts/fetch-sources.ps1`, `scripts/make-snapshots.mjs`.
- **Прочее (1):** `goALL.yml` (пустой файл).

Дополнительно удалены с диска (не отслеживались в git, артефакты сборки старого сайта): `frontend/dist/`, `frontend/.vercel/output/`.

---

## 4. Что адаптировано (4 файла)

### 4.1 `frontend/src/lib/supabase/catalog.ts`
Удалён импорт `type { Row } from '../sources/parser'` (модуль парсера удалён как старая логика данных) — тип `Row = Record<string, unknown>` объявлен локально в самом файле. Публичный API модуля не изменился.

### 4.2 `frontend/vite.dev-proxy.ts`
Удалён middleware `/api/proxy` (импортировал удалённый `./api/proxy-handler`), обновлён комментарий-заголовок. Dev-маршрут `/api/catalog` (Supabase) сохранён без изменений — его использует тест `src/lib/supabase/catalog.test.ts`.

### 4.3 `frontend/index.html`
Удалён `<script type="module" src="/src/main.tsx">` (точка входа удалена). Файл оставлен как точка входа сборки Vite: без него `vite build` из сохранённого `vite.config.ts` не работает. Разметка будет заменена в задаче 1.2 (`apps/web`).

### 4.4 `frontend/package.json` (+ перегенерация `package-lock.json`)

Удалены зависимости, использовавшиеся только удалённым кодом:

| Удалённый пакет | Кто его использовал |
|---|---|
| `react`, `react-dom`, `@types/react`, `@types/react-dom` | удалённые компоненты страницы |
| `@radix-ui/react-dialog`, `@radix-ui/react-slider`, `@radix-ui/react-tooltip` | удалённые UI-примитивы |
| `@tanstack/react-table` | удалённая таблица Топ-50 |
| `lucide-react`, `clsx` | удалённые компоненты и `lib/utils.ts` |
| `recharts` | удалённая карточка планеты |
| `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three` | удалённый 3D-код |
| `zustand` | удалённый Zustand-стор |
| `zod` | удалённый `lib/cache/snapshots.ts` |
| `idb` | удалённый `lib/cache/backups.ts` |
| `papaparse`, `@types/papaparse` | удалённые парсер/приложение |

Оставлены: `@supabase/supabase-js` (Supabase-фича) и инструментальные `vite`, `vitest`, `jsdom`, `typescript`, `@vitejs/plugin-react`, `@types/node`, `tailwindcss`, `postcss`, `autoprefixer` (сборочная конфигурация). Скрипт `npm run snapshots` удалён вместе с генератором снимков; `npm run upload:catalog` и `npm run supabase:schema` сохранены.

---

## 5. Описание Supabase-фичи

### 5.1 Схема БД (`supabase/schema.sql`)

| Таблица | Содержимое | Ключевые поля |
|---|---|---|
| `public.catalog_snapshots` | метаданные одной выгрузки (одна строка на версию источника) | `id` (bigserial PK), `source`, `fetched_at`, `record_count`, `endpoint`, `schema_version`, `missing_columns text[]`, `origin` (`live`/`backup`/`snapshot`), `sha256`, `created_at` |
| `public.catalog_rows` | строки выгрузки в исходном виде | `id` (bigserial PK), `snapshot_id` (FK → `catalog_snapshots`, `on delete cascade`), `ord` (порядок), `data` (`jsonb`) |

Индексы: `catalog_snapshots(source, fetched_at desc)`, `catalog_rows(snapshot_id, ord)`.

### 5.2 Политики RLS

Обе таблицы созданы с `enable row level security`, **политик для `anon`/публичного доступа нет**. Следствие: читать и писать может только `service_role` (он обходит RLS); публичный anon-ключ к этим таблицам не имеет доступа. Секрет в браузер не попадает — всё общение идёт через серверный маршрут `/api/catalog`.

### 5.3 Что и когда записывается

Запись выполняется **только** из двух мест:

1. `npm run upload:catalog` (`frontend/scripts/upload-catalog.mjs`) — разовая/ручная выгрузка: берёт `frontend/public/data/snapshots/<source>.json` (или каталог из `--dir=`), по каждому источнику вставляет запись в `catalog_snapshots`, затем грузит строки в `catalog_rows` порциями по 500, после чего удаляет версии старше трёх последних (`KEEP_VERSIONS = 3`).
2. `POST /api/catalog` — тот же сценарий по HTTP. Доступ закрыт: требуется заголовок `x-catalog-key`, совпадающий с `SUPABASE_CATALOG_WRITE_KEY`; при его отсутствии запись отключается (403), чтение продолжает работать.

Когда данные пишутся «сами»: **никогда автоматически**. Черновик не обновлял БД при загрузке сайта — только по команде человека скриптом. Это осознанное ограничение: запись идёт через service-role ключ, а автоматическая запись при каждом запуске потребовала бы ключа на стороне клиента.

### 5.4 Что и когда читается

| Маршрут | Назначение | Когда вызывается |
|---|---|---|
| `GET /api/catalog?health=1` | проверка связи + задержка | диагностика |
| `GET /api/catalog?sources=nasa,gaia` | последняя выгрузка каждого источника: метаданные + все строки (`catalog_rows` с пагинацией по 1000, сортировка по `ord`) | чтение каталога |
| `POST /api/catalog` | запись выгрузки (см. 5.3) | по команде |

Источники: `nasa`, `exomercat`, `exoplanet_eu`, `gaia`, `simbad`, `exomast`.

В черновике чтение из Supabase было подключено в конвейере загрузки (`src/lib/pipeline/run.ts`, уровень данных «supabase» между LIVE и встроенным снимком) и в панели источников (`src/components/SourcesPanel.tsx`). Оба этих потребителя удалены как старая логика; **клиент и серверный обработчик сохранены** и будут подключены заново в `apps/server`/`apps/web`.

### 5.5 Переменные окружения

| Переменная | Назначение | Где задаётся | Обязательна |
|---|---|---|---|
| `SUPABASE_URL` | URL проекта, `https://<project-ref>.supabase.co` | `frontend/.env.local` (dev) / переменные Vercel (prod) | да |
| `SUPABASE_SERVICE_ROLE_KEY` | ключ с полным доступом: `sb_secret_…` (новый secret), legacy JWT `service_role` либо Personal Access Token `sbp_…` (тогда сервер сам добывает ключ проекта через management API и кэширует его на 10 минут) | `frontend/.env.local` / Vercel | да |
| `SUPABASE_CATALOG_WRITE_KEY` | секретный ключ записи; клиент отправляет его в заголовке `x-catalog-key`. Без него POST отключён, чтение работает | `frontend/.env.local` / Vercel | нет (только для записи) |

Шаблоны: `.env.example` (корень) и `frontend/.env.example` (значения пустые, только пояснения).

---

## 6. Расхождения между стеком черновика и стеком из задачи 1.2

Эталон 1.2 (из спецификации 1.2, п. «Стек»):

| Слой | Решение в 1.2 |
|---|---|
| Язык | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` |
| Менеджер | npm workspaces, Node.js ≥ 20 |
| `packages/shared` | чистый TS без DOM/Node API: типы, константы, физика, индексы, ранжирование |
| `apps/server` | Node.js + Fastify: адаптеры источников, резервные копии, дедупликация, REST |
| `apps/web` | Vite + React 18 + Three.js + Zustand; тяжёлый пересчёт в Web Worker |
| Тесты | Vitest (во всех пакетах) |
| Линт/формат | ESLint + Prettier |

Сравнение и рекомендации:

| # | Слой | Черновик | 1.2 | Расхождение | Рекомендация (что принять) |
|---|---|---|---|---|---|
| 1 | Структура репозитория | одно приложение в `frontend/`, без workspaces | монорепо: `packages/shared`, `apps/server`, `apps/web` | черновик — подкаталог внутри одного приложения; 1.2 — монорепо | **Принять 1.2.** `frontend/` переименовать/пересобрать в `apps/web`, корневые `package.json` + workspaces. `frontend/api/catalog.ts` и `frontend/api/supabase-handler.ts` перенести в `apps/server` (см. §6.2) |
| 2 | Типизация | `strict: true`, **без** `noUncheckedIndexedAccess` | требуется `noUncheckedIndexedAccess: true` | черновик слабее | **Принять 1.2.** Добавить флаг в общий tsconfig.base; при переносе кода из `lib/calc` ожидать правок в обращениях по индексу |
| 3 | Node.js | 18+ | ≥ 20 | на 2 majors ниже | **Принять 1.2.** Обновить `engines` в манифестах и образы CI/deploy |
| 4 | Менеджер пакетов | npm, один `package.json`, без workspaces | npm workspaces | черновик не монорепозиторий | **Принять 1.2.** npm уже совпадает — переносить менеджер не нужно, добавить только `workspaces` и корневой `package-lock.json` |
| 5 | Серверная часть | запросы к TAP идут **из браузера**, HTTP-источники — через Edge-прокси `/api/proxy` (обход CORS) | `apps/server` (Node + Fastify) с адаптерами источников | черновик — клиентская загрузка + Edge-прокси; 1.2 — серверная | **Принять 1.2.** `/api/proxy` и `api/proxy-handler.ts` уже удалены; адаптеры (`src/lib/sources/*`) переносятся в `apps/server` вместе с `transport.ts` и `schema.ts` |
| 6 | Supabase | `@supabase/supabase-js` в Vercel Edge-функции (`runtime = edge`) | сервер на Node/Fastify | Edge-функция → обычный Fastify-маршрут | **Принять 1.2** (перенести обработчик в `apps/server`), **но схему и RLS оставить без изменений** — они корректны и для Node-сервера. Версию `@supabase/supabase-js` 2.119.0 перенести |
| 7 | Резервные копии | IndexedDB в браузере (`idb`), ротация 5 версий + `public/data/snapshots/*.json` | файловая система сервера `data/backups/<source>/` | черновик — клиентский кэш; 1.2 — серверный | **Принять 1.2.** `lib/cache/*` удалён; копии на диске сервера. Публичные снимки (~20 МБ) — перенести на сервер или загрузить в Supabase и убрать из git (см. §7) |
| 8 | Тяжёлые расчёты | module Web Worker в `src/workers/` | пересчёт в Web Worker в `apps/web` | способ совпадает | **Принять 1.2.** Типы сообщений (`workers/messages.ts`) — кандидат на `packages/shared` |
| 9 | 3D | `three` 0.169 + `@react-three/fiber` 8.17 + `@react-three/drei` 9.114 | «Three.js» (R3F не указан) | черновик — R3F-обёртка | **Принять 1.2 по сути**, но уточнить: перенести связку R3F 8 + drei 9 (совместима с React 18) или писать на чистом three. Версии зафиксированы в §1.1 |
| 10 | Состояние клиента | `zustand` 5.0.1 | Zustand | совпадает | **Принять 1.2.** Версию 5.0.1 сохранить |
| 11 | React | 18.3.1 | React 18 | совпадает | **Принять 1.2.** Версию 18.3.1 сохранить |
| 12 | Сборщик | Vite 5.4.10 | Vite | совпадает | **Принять 1.2.** `vite.config.ts` (alias `@/*`, порт 5173, конфиг Vitest) перенести в `apps/web` как основу |
| 13 | Tailwind | 3.4.14 + PostCSS 8.4.49 + autoprefixer 10.4.20 | Tailwind/PostCSS не уточнены | совпадает по факту | **Принять черновик** (версии рабочие), перенести `tailwind.config.js` и `postcss.config.js` в `apps/web` |
| 14 | Линт/формат | **отсутствуют** | ESLint + Prettier | черновик без контроля качества кода | **Принять 1.2.** Добавить ESLint + Prettier на уровень монорепо (это единственный слой 1.2, которого в черновике нет вообще) |
| 15 | Тесты | Vitest 2.1.4 + jsdom, конфиг внутри `vite.config.ts`, `include: src/**/*.test.ts` | Vitest во всех пакетах | конфигурация единая на приложение | **Принять 1.2.** Развести конфиги по пакетам; тесты физики/индексов (`lib/calc/*.test.ts`, удалённые) — обязательно перенести в `packages/shared` вместе с кодом |
| 16 | Типы домена | `src/types.ts` (монолит) | `packages/shared` — «типы, константы, физика, индексы, ранжирование» | черновик — один файл в приложении | **Принять 1.2.** `src/types.ts` разнести: `SourceId`/`FieldKey`/доменные типы → `packages/shared`, остальное — по месту |
| 17 | Формат данных в БД | `catalog_rows.data` — плоский `jsonb` исходной строки каталога | в 1.2 формат не зафиксирован | потенциальное расхождение | Оставить как есть на этапе 1.1; при появлении в `packages/shared` нормализованной схемы — decided в задаче 1.1 (в отчёте зафиксировано, что изменений не вносилось) |
| 18 | Логирование/наблюдаемость | только UI-панель источников и журнал ошибок в браузере | сервер на Fastify | логи переезжают на сервер | Учесть в 1.1: минимальный логгер Fastify на адаптеры |

### 6.1 Итоговая рекомендация

**Принять стек 1.2 целиком.** Расхождения черновика с 1.2 — не конфликт, а недоделанная часть черновика: в нём нет ни монорепо, ни сервера, ни линтера, ни `noUncheckedIndexedAccess`. Единственное, что стоит взять из черновика «как есть», — проверенные версии и настройки: `vite` 5.4, `typescript` 5.6, `tailwind` 3.4 + `postcss` 8.4, `zustand` 5.0, `react` 18.3, `three` 0.169 + R3F 8.17 + drei 9.114, `@supabase/supabase-js` 2.119, `vitest` 2.1 + jsdom 25.

### 6.2 Что переезжает в `apps/server` по пунктам

| Из черновика | Куда в 1.2 | Комментарий |
|---|---|---|
| `frontend/api/supabase-handler.ts` | `apps/server` (маршрут `/api/catalog`) | логика чтения/записи и работа с ключом — без изменений |
| `frontend/api/catalog.ts` | `apps/server` | Edge-обёртка больше не нужна |
| `supabase/schema.sql` | `supabase/schema.sql` (или `apps/server/db/`) | схема и RLS без изменений |
| `frontend/scripts/upload-catalog.mjs` | `apps/server/scripts/` или корневой `scripts/` | читает снимки; в 1.2 снимки берутся с сервера |
| `scripts/apply-supabase-schema.mjs`, `scripts/check-supabase-keys.mjs` | `scripts/` (корень монорепо) | без изменений |
| `src/lib/sources/*` | `apps/server` (адаптеры) | нужны адаптерам источников |
| `src/lib/calc/*`, `src/lib/pipeline/*`, `src/config.ts` | `packages/shared` | чистая физика, индексы, ранжирование |
| `src/types.ts` | `packages/shared` | доменные типы |
| `src/workers/messages.ts` | `packages/shared` | контракт Worker ↔ UI |

---

## 7. Замечания по данным и риски

1. **Снимки каталогов (≈20 МБ) оставлены в `frontend/public/data/snapshots/`.** Единственный оставшийся их потребитель — сохранённая функция выгрузки `npm run upload:catalog`. В 1.2 источником снимков должен стать `apps/server` (`data/backups/<source>/`), после чего файлы стоит убрать из git и хранить только в Postgres. Учтите: `data/backups/*/latest.json` сейчас в формате «массив строк», а `upload-catalog.mjs` ожидает `{meta, rows}` — формат нужно привести к общему при переносе.
2. **README.md и `docs/*` описывают удалённый черновик.** Сохранены как носители методики (формулы, эталон «Земля», калибровочные значения) — переписываются в 1.2.
3. **`frontend/index.html`** остаётся минимальной оболочкой без точки входа; `vite build` собирает пустую страницу. Полноценная страница появится в `apps/web`.
4. **`backend/` и `ml/`** — пустые плейсхолдеры черновика; в 1.2 их роль выполняют `apps/server` и `packages/shared`. Решение об удалении — за задачей 1.2.

---

## 8. Секреты

| Проверка | Результат |
|---|---|
| Открытые секреты в отслеживаемых файлах | **не найдено**: в `.env.example`, `frontend/.env.example`, `supabase/schema.sql`, скриптах и коде — только плейсхолдеры (`sb_secret_xxxxx`, `sbp_xxx`, `sb_secret_x` в тестах) |
| `frontend/.env.local` (реальные ключи) | **не читался, не копировался, не выводился и не закоммичен**; файл в `.gitignore` (`git check-ignore` подтверждает) |
| Коммиты задачи | коммиты содержат только код, конфиги и документацию; файлов с ключами нет |
| Отчёт | содержит только имена переменных окружения и плейсхолдеры, значений ключей нет |

Рекомендация на будущее: при переезде на монорепо перенести реальные ключи в `apps/server/.env`, а `frontend/.env.local` удалить; в Vercel задать `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` как переменные окружения проекта.

---

## 9. Результат и проверка

### 9.1 Команды и их результат

| Команда | Результат |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | без ошибок |
| `npm run test` (`vitest run`) | 1 файл, 4 теста — успешно (`src/lib/supabase/catalog.test.ts`) |
| `npm run build` (`tsc --noEmit && vite build`) | успешно, собран пустой shell (`dist/index.html`, 0.51 kB) |

### 9.2 Оставшиеся отслеживаемые файлы (33)

```
.env.example
.gitignore
README.md
backend/.gitkeep
docs/data-sources.md
docs/json-extraction.md
exoplanet-prompt-v3-oneshot.md
frontend/.env.example
frontend/.gitignore
frontend/.gitkeep
frontend/api/catalog.ts
frontend/api/supabase-handler.ts
frontend/index.html
frontend/package-lock.json
frontend/package.json
frontend/postcss.config.js
frontend/public/data/snapshots/{exomercat,exoplanet_eu,gaia,nasa,simbad}.json
frontend/scripts/upload-catalog.mjs
frontend/src/lib/supabase/catalog.test.ts
frontend/src/lib/supabase/catalog.ts
frontend/src/types.ts
frontend/tailwind.config.js
frontend/tsconfig.json
frontend/vite.config.ts
frontend/vite.dev-proxy.ts
ml/.gitkeep
scripts/apply-supabase-schema.mjs
scripts/check-supabase-keys.mjs
supabase/schema.sql
```

Не отслеживаются (в `.gitignore`): `.agents/`, `data/`, `frontend/.env.local`, `frontend/.vercel/`, `frontend/node_modules/`.

### 9.3 Чек-лист критериев приёмки

| Критерий | Статус |
|---|---|
| Тег `pre-rewrite` существует | ✅ `pre-rewrite` → `10ad6ab` |
| Работа ведётся в ветке `rewrite` | ✅ все изменения — в `rewrite`; `main` не изменялся |
| Все файлы из «keep» на месте | ✅ Supabase-код (9 файлов), конфигурация и окружение (11 файлов), доменные типы, `.env.example`, `.gitignore` — на месте (§2.2, §2.3) |
| Компонентов и страниц старого сайта нет | ✅ удалены все 22 UI-файла, `App.tsx`, `main.tsx`, `index.css`, оба 3D-модуля (§2.5–§2.7) |
| В отчёте есть описание Supabase-фичи | ✅ §5: таблицы, RLS, что/когда записывается и читается, переменные окружения |
| В отчёте есть сравнение стеков | ✅ §6: 18 расхождений черновика и стека 1.2 + рекомендации |
| Секретов в отчёте и коммитах нет | ✅ §8 |
| Новый код не написан | ✅ изменены только 4 существующих файла (адаптация зависимостей) и `package.json`; новых файлов кода нет |
