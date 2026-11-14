# Exoplanet Habitability Explorer

Веб-приложение «Топ-50 обитаемости экзопланет»: загрузка каталога из 6 научных API,
дедупликация, восстановление пропусков каскадным решателем (Уровни А/Б/В), расчёт
индексов обитаемости в 4 режимах, 3D-карта Галактики и 3D-сцена системы. Интерфейс на русском.

## Состояние проекта

Проект переписывается с нуля по мастер-плану (`docs/roadmap.md`, Задачи 1–31).

| Задача | Статус |
|---|---|
| 0. Аудит и зачистка черновика | ✅ [`docs/cleanup-report.md`](docs/cleanup-report.md) |
| 1. Монорепо, конфиги, структура папок | ✅ текущая |
| 2–31 | ⏳ ожидают промптов-задач |

Глобальный контекст проекта (стек, структура, сквозные соглашения, реестр решений U1–U18) —
[`docs/project-context.md`](docs/project-context.md).

## Структура

```text
/
├─ package.json                # npm workspaces: packages/*, apps/*
├─ tsconfig.base.json          # общие настройки TypeScript (strict, noUncheckedIndexedAccess)
├─ vitest.workspace.ts         # тестовые проекты монорепо
├─ .eslintrc.cjs / .prettierrc # линт и форматирование
├─ .env.example                # переменные окружения (PORT, BACKUP_DIR, …)
├─ data/backups/<source>/      # резервные копии каталогов (вне git)
├─ packages/shared/            # чистый TS: типы, константы, физика, индексы, ранжирование
├─ apps/server/                # Node.js + Fastify: адаптеры источников, резервные копии, REST
├─ apps/web/                   # Vite + React 18 + Three.js + Zustand, пересчёт в Web Worker
└─ archive/                    # код черновика вне объёма работ (вне сборки)
```

## Требования

- Node.js ≥ 20
- npm (workspaces)

## Команды

Команды выполняются в корне репозитория.

| Команда | Что делает |
|---|---|
| `npm install` | установка зависимостей всех пакетов workspaces |
| `npm run dev` | параллельный запуск сервера (`:8787`) и веб-приложения (`:5173`) |
| `npm run build` | сборка веб-приложения (`apps/web/dist`) |
| `npm run test` | тесты всех пакетов (Vitest) |
| `npm run typecheck` | проверка типов во всех пакетах (`tsc -b --noEmit`) |
| `npm run lint` | ESLint по исходникам монорепо |
| `npm run format` | форматирование Prettier |
| `npm run format:check` | проверка форматирования без записи |

Проверка сервера: `GET http://localhost:8787/api/health` → `{"status":"ok"}`.
В dev-режиме веб-приложение проксирует `/api/*` на сервер: `GET http://localhost:5173/api/health`.

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните при необходимости.

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `PORT` | порт HTTP-сервера | `8787` |
| `BACKUP_DIR` | каталог резервных копий источников | `data/backups` |
| `BACKUP_KEEP_VERSIONS` | сколько версий копии хранить на источник (минимум 5) | `5` |
| `FETCH_TIMEOUT_MS` | таймаут запросов к научным API, мс | `30000` |

## Документы

- [`docs/project-context.md`](docs/project-context.md) — глобальный контекст проекта.
- [`docs/roadmap.md`](docs/roadmap.md) — мастер-план, Задачи 1–31.
- [`docs/cleanup-report.md`](docs/cleanup-report.md) — аудит и зачистка черновика (Задача 0).
- [`docs/data-sources.md`](docs/data-sources.md) — научные источники и форматы TAP-ответов.
- [`docs/json-extraction.md`](docs/json-extraction.md) — разбор ответов источников.
- `exoplanet-prompt-v3-oneshot.md` — исходное техническое задание.
- `archive/README.md` — архивный код черновика (Supabase-фича) и инструкция по возврату.
