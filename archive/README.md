# archive/ — код вне объёма текущих работ

Папка `archive/` не участвует в сборке, тестах и деплое монорепо: на неё не ссылаются
`package.json` workspaces, `tsconfig.base.json`, конфиги ESLint/Prettier/Vitest и CI.
Здесь лежит код, который работал в черновике, но не входит в план задач 1–31.

**Важно:** по обновлённому мастер-плану введена задача **11a «Supabase: выгрузка готовых
записей»** (зависит от 7, 10, 11) — она возвращает эту фичу в проект и привязывает её
к новой модели данных. Поэтому код сохранён целиком и не удаляется; при выполнении 11a
файлы переносятся из `archive/supabase/` в `apps/server/` по месту назначения.

---

## archive/supabase/ — фича внешней БД (Supabase Postgres)

### Почему в архиве

Глобальный контекст проекта (п. 1.4) фиксирует:

- «Аутентификации, ролей и БД в ТЗ нет. Миграций нет, хранилище только JSON-файлы»;
- «П. 8.5 (Supabase) помечен „в текущий объём работ не входит“, в план не включён».

То есть схема БД в проекте не предусмотрена, а единственное хранилище — JSON-файлы
на сервере (`data/backups/<source>/`, Задача 7). Код Supabase сохранён целиком
(Задача 0), но вынесен из рабочего дерева, чтобы не влиять на сборку монорепо.

### Состав

| Путь | Назначение |
|---|---|
| `schema.sql` | DDL: `catalog_snapshots`, `catalog_rows`, индексы, `enable row level security` (политик для `anon` нет — доступ только через `service_role`) |
| `api/catalog.ts` | Edge-функция Vercel `/api/catalog` (обёртка над обработчиком) |
| `api/supabase-handler.ts` | серверная логика: чтение/запись выгрузок, работа с `service_role`/PAT-ключом, ротация 3 последних версий |
| `client/catalog.ts` | клиентский доступ к каталогам через `/api/catalog` (health, чтение, запись) |
| `client/catalog.test.ts` | тесты `readConfig` и разбора `.env` |
| `client/types.ts` | прежние доменные типы черновика (`SourceId`, `PlanetEntity`, `FieldValue`, …) — использовались клиентом. Новые доменные типы проектируются в Задаче 2 (`packages/shared/src/types/`) |
| `scripts/upload-catalog.mjs` | выгрузка снимков в Postgres через REST |
| `scripts/apply-supabase-schema.mjs` | применение `schema.sql` через management API |
| `scripts/check-supabase-keys.mjs` | диагностика, какой из ключей проекта работает с REST |
| `vite.dev-proxy.ts` | dev-плагин Vite: разбор `.env` + маршрут `/api/catalog` (без `vercel dev`) |
| `env.example` | шаблон переменных окружения (бывший `frontend/.env.example`) |
| `env.root.example` | шаблон переменных окружения (бывший корневой `.env.example`) |

### Переменные окружения

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret `sb_secret_…`, legacy JWT `service_role`
или Personal Access Token `sbp_…`), `SUPABASE_CATALOG_WRITE_KEY` (ключ записи в заголовке
`x-catalog-key`; без него `POST` отключён, чтение работает).

Реальные значения остались в `frontend/.env.local` — файл вне git, не читался и не копировался.
При возврате фичи в проект ключи переносятся в `apps/server/.env`.

### Что заработает сразу после возврата в `apps/server`

- `schema.sql` — применить как есть (или через `scripts/apply-supabase-schema.mjs`).
- `api/supabase-handler.ts` — переносится в `apps/server` почти без изменений: он не зависит
  ни от Edge-рантайма, ни от Vite (только `@supabase/supabase-js`).
- `client/catalog.ts` — клиентский слой; в новой архитектуре чтение каталога идёт
  через REST `apps/server`, поэтому клиент переписывается под новый API.

### Что потребует правок при возврате

| Файл | Что поправить |
|---|---|
| `scripts/upload-catalog.mjs` | каталог снимков по умолчанию — `public/data/snapshots/`; в новой схеме это `data/backups/<source>/latest.json` (или собственный вызов с `--dir=`) |
| `scripts/check-supabase-keys.mjs` | читает `frontend/.env.local` — перенести на путь нового сервера |
| `client/catalog.test.ts` | сейчас вне vitest-конфигурации монорепо; при возврате — переподключить к тестам `apps/server` |
| `vite.dev-proxy.ts` | функции `parseEnvFile` / `loadDevEnv` пригодятся для dev-конфига `apps/web` (адрес `apps/server`); маршрут `/api/catalog` в новой схеме заменяется прокси на Fastify |

### История

Код перенесён из `supabase/`, `frontend/api/`, `frontend/src/lib/supabase/`,
`frontend/scripts/`, `scripts/` коммитом `chore(task 0): park Supabase feature in archive/`.
Состояние черновика до зачистки — тег `pre-rewrite`, ветка `rewrite`.
