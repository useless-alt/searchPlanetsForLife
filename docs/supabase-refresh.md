# Обновление резервных копий и выгрузка в Supabase

Документ описывает схему: как каждые 3 часа обновляются данные каталога
экзопланет и как новая выгрузка заменяет прежнюю **только после успеха**.

## Что происходит за цикл

1. `npm run refresh` (`apps/server/src/cli/refresh.ts`) — автономный прогон
   конвейера без HTTP-сервера: этапы 1–2 (NASA, Exoplanet.eu, Exo-MerCat,
   Gaia, SIMBAD), слияние, запись резервных копий источников в
   `${BACKUP_DIR}/<source>/latest.json` и слитого снимка каталога в
   `${BACKUP_DIR}/merged/latest.json`.
2. `node scripts/upload-backups-to-supabase.mjs` — выгрузка в Supabase:
   - **Storage** (приватный бакет `planet-backups`):
     `catalog/<source>/latest.json`, `catalog/merged/latest.json.gz`
     (слитый снимок сжимается gzip — в несжатом виде он около 49 МБ при
     лимите объекта 50 МБ; после распаковки — байт в байт как локальный
     файл), `manifest.json` (сводка: размеры, sha256, время,
     идентификаторы снимков);
   - **Postgres**: `catalog_snapshots` (метаданные версии) и
     `catalog_rows` (строки каталога в `jsonb`).

Обе команды объединены в `npm run refresh:backup`.

## Правило «замена только после успеха»

Защита двухуровневая; если хотя бы один уровень не пройден — прежние данные
остаются в силе, ничего не перезаписывается.

| Уровень | Где | Условие отказа |
|---|---|---|
| Полнота источников | `apps/server/src/cli/refresh.ts` | хоть один обязательный источник не дал данных ни живым запросом, ни резервной копией (`error_no_backup`) → код выхода 1, снимок не пишется |
| Порог уменьшения | там же | число планет упало ниже `previous × REFRESH_MIN_RATIO` (по умолчанию 0.5) → код выхода 1 |
| Целостность выгрузки | `scripts/upload-backups-to-supabase.mjs` | запись строк прервалась или в базе оказалось не столько строк, сколько отправлено → недозагруженный снимок удаляется (каскадом), прежние версии остаются |
| Порядок удаления | там же | старые версии источника удаляются **после** того, как новая записана и пересчитана |

Список обязательных источников: `nasa, exoplanet_eu, exomercat, gaia, simbad`
(переопределяется `REFRESH_REQUIRE_SOURCES`; пустое значение отключает проверку).

## Расписание

### Вариант 1 — Планировщик Windows (работает сразу, локально)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-scheduled-task.ps1
```

Регистрируется задача `ExoCatalogRefresh`: каждые 3 часа (`-EveryHours 6` —
другой период), журнал — `data/archives/refresh.log`. Запуск идёт через
обёртку `scripts/refresh-backup.cmd` (в `cmd /c` путь с пробелами требует
экранирования кавычками — из-за этого задача сначала падала). Удаление:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-scheduled-task.ps1 -Remove
```

Требования: машина включена в момент запуска; доступ к `.env.local` с ключами.

### Вариант 2 — GitHub Actions

Файл `.github/workflows/refresh-data.yml`: cron `0 */3 * * *` (UTC) и ручной
запуск (`workflow_dispatch`).

Что делает один прогон:
1. забирает резервные копии из Supabase (`scripts/restore-backups-from-supabase.mjs`) —
   на чистом runner их нет, а конвейеру нужен fallback;
2. обновляет каталог (`npm run refresh`);
3. выгружает результат в Supabase;
4. прикладывает слитый снимок артефактом прогона (7 дней хранения).

Особенности:
- расписание GitHub срабатывает **только из ветки по умолчанию** — файл
  должен попасть в `main`;
- запуск может задержаться до ~15 минут (штатное поведение);
- ключи берутся из секретов репозитория: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (Settings → Secrets and variables → Actions);
- `concurrency` не даёт двум прогонам идти одновременно;
- если обновление неполное (источник не ответил и копии нет), workflow
  падает и **ничего не заменяет** — в Supabase остаются прежние данные.

## Статический режим (задел под GitHub Pages)

Сейчас не используется: сайт запускается обычной сборкой (`npm run build`)
рядом с `apps/server`. Код оставлен, чтобы позже можно было отдать страницу
как статику без сервера.

В статическом режиме сайт не обращается к серверу: при сборке в него
кладётся `data/catalog.json` (его собирает `scripts/prepare-static-data.mjs`
из `merged/latest.json`), а клиент `apps/web/src/api/staticClient.ts`
читает этот файл вместо `/api/catalog`.

| Что | Как в статике |
|---|---|
| Каталог и рейтинг | полностью работает, данные — из файла сборки |
| Панель источников | работает: статусы берутся из самого снимка |
| «Обновить данные» | перечитывает файл; новые данные появляются после обновления данных и пересборки |
| Журнал ошибок | пуст: серверного `error-log.jsonl` на странице нет |
| Ленивый Exo.MAST (п. 9.3) | недоступен — нужен серверный прокси |

Если понадобится вернуть публикацию, к шагам выше добавляются:
репозиторий должен быть **публичным** (Pages для приватных требует Pro),
Settings → Pages → Source: **GitHub Actions**, а в workflow — сборка
`node scripts/build-pages.mjs --base=/<repo>/`, `upload-pages-artifact`
и `deploy-pages`.

Размер: `data/catalog.json` — около 49 МБ на сборку; хостинг сжимает JSON
при отдаче (~3 МБ по сети).

Локальная проверка статической сборки:

```bash
npm run build:pages        # = prepare-static-data + vite build со VITE_STATIC_DATA=1
npm run preview -w @exo/web
```

## Переменные окружения

| Переменная | Где | Назначение |
|---|---|---|
| `SUPABASE_URL` | `.env.local` (в git не попадает), секреты CI | адрес проекта |
| `SUPABASE_SERVICE_ROLE_KEY` | там же | `sb_secret_…` / `service_role`; Personal Access Token `sbp_…` тоже подходит — тогда скрипт сам применит схему через management API |
| `SUPABASE_KEEP_VERSIONS` | CI, окружение | сколько версий снимка хранить на источник; по умолчанию `1` (новая заменяет прежнюю), `3` — с историей |
| `BACKUP_DIR` | окружение | каталог копий; по умолчанию `data/backups` относительно `apps/server` |
| `BACKUP_KEEP_VERSIONS` | окружение | ротация локальных копий (п. 8.2) |
| `REFRESH_MIN_RATIO` | окружение | порог уменьшения числа планет; по умолчанию `0.5` |
| `REFRESH_REQUIRE_SOURCES` | окружение | список обязательных источников |

## Что где лежит

| Что | Где |
|---|---|
| Локальные копии источников | `apps/server/data/backups/<source>/latest.json` и `YYYYMMDD_HHMMSS.json` |
| Слитый снимок | `apps/server/data/backups/merged/latest.json` (тот же JSON, что отдаёт `GET /api/catalog`) |
| Снимок для GitHub Pages | `apps/web/public/data/catalog.json` → в сборке `dist/data/catalog.json` (в git не попадает) |
| Журнал ошибок источников | `apps/server/data/error-log.jsonl` |
| Файлы в Supabase | бакет `planet-backups`: `catalog/<source>/latest.json`, `catalog/merged/latest.json.gz`, `manifest.json` |
| Таблицы | `public.catalog_snapshots`, `public.catalog_rows` (RLS включён, политик нет — читает только `service_role`) |
| Схема | `supabase/schema.sql` |

## Ограничения

- **Ключ в браузер не попадает.** Если сайт будет читать данные из Supabase
  напрямую, нужен отдельный anon-ключ и read-only политика RLS; текущие
  таблицы закрыты для анонимного доступа.
- **DDL по ключу не выполняется.** Новые таблицы требуют SQL Editor или
  Personal Access Token `sbp_…`.
- **Лимит объекта — 50 МБ.** Слитый снимок (~49 МБ) поэтому хранится в gzip
  (~3 МБ). Если каталог вырастет ещё сильнее, сжатия перестанет хватать —
  тогда слитый снимок стоит хранить частями или в Postgres (в `catalog_rows`
  он уже есть по строкам).
- **Сайт на GitHub Pages — статический.** `apps/server` там не запускается:
  страница читает снимок из своей сборки. Кнопка «Обновить данные», журнал
  ошибок и ленивый Exo.MAST в этом режиме ограничены (см. раздел выше).
  Полный функционал требует развёрнутого Node-сервера.
