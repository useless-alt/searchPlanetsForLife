-- Схема Supabase для хранения каталогов экзопланет.
--
-- Применение: Supabase Dashboard -> SQL Editor -> вставить и выполнить
-- (или `psql "$SUPABASE_DB_URL" -f supabase/schema.sql`).
--
-- Доступ: таблицы закрыты RLS без политик, поэтому читать и писать может
-- только service_role (он обходит RLS). Публичный anon-ключ не имеет
-- доступа к этим таблицам.

create table if not exists public.catalog_snapshots (
  id                bigserial primary key,
  source            text        not null,
  fetched_at        timestamptz not null default now(),
  record_count      integer     not null default 0,
  endpoint          text,
  schema_version    integer     not null default 1,
  missing_columns   text[]      not null default '{}',
  origin            text        not null default 'live',
  sha256            text,
  created_at        timestamptz not null default now()
);

create table if not exists public.catalog_rows (
  id                bigserial primary key,
  snapshot_id       bigint      not null references public.catalog_snapshots (id) on delete cascade,
  ord               integer     not null,
  data              jsonb       not null
);

create index if not exists catalog_snapshots_source_fetched_idx
  on public.catalog_snapshots (source, fetched_at desc);

create index if not exists catalog_rows_snapshot_ord_idx
  on public.catalog_rows (snapshot_id, ord);

alter table public.catalog_snapshots enable row level security;
alter table public.catalog_rows enable row level security;

-- Политик для анонимного/публичного доступа нет: только service_role.

comment on table public.catalog_snapshots is
  'Метаданные выгрузок каталогов экзопланет (по одной строке на версию источника).';
comment on table public.catalog_rows is
  'Строки выгрузок каталогов экзопланет в исходном виде (jsonb).';
