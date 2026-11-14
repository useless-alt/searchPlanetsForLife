import { useEffect, useState } from 'react';
import { Database, Download, History, RotateCcw, TerminalSquare, UploadCloud } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getBackup, listBackupVersions, type BackupMeta } from '@/lib/cache/backups';
import { fetchCatalogHealth, uploadCatalogSnapshot, type CatalogHealth } from '@/lib/supabase/catalog';
import { rowsFromPayload } from '@/lib/pipeline/run';
import type { SourceId, SourceStatus } from '@/types';
import { formatDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { tierLabel, statusBadgeClass, statusLabel, statusTone } from './status';

const ORDER: SourceId[] = ['nasa', 'exomercat', 'exoplanet_eu', 'gaia', 'simbad', 'exomast'];

function emptyStatus(source: SourceId): SourceStatus {
  return {
    source,
    label: source,
    state: source === 'exomast' ? 'pending' : 'pending',
    records: 0,
    fetchedAt: null,
    tier: null,
    error: null,
    schemaMissing: [],
  };
}

export function SourcesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const result = useAppStore((s) => s.result);
  const rollback = useAppStore((s) => s.rollback);
  const setNotice = useAppStore((s) => s.setNotice);
  const preferRemote = useAppStore((s) => s.preferRemote);
  const setPreferRemote = useAppStore((s) => s.setPreferRemote);
  const [versions, setVersions] = useState<Record<string, { key: string; meta: BackupMeta }[]>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [health, setHealth] = useState<CatalogHealth | null>(null);
  const [writeKey, setWriteKey] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ORDER.map(async (source) => [source, await listBackupVersions(source)] as const),
      );
      if (cancelled) return;
      const map: Record<string, { key: string; meta: BackupMeta }[]> = {};
      const chosen: Record<string, string> = {};
      for (const [source, list] of entries) {
        map[source] = list;
        if (list.length > 0) chosen[source] = list[0].key;
      }
      setVersions(map);
      setSelected(chosen);
    })();
    void (async () => {
      const state = await fetchCatalogHealth();
      if (!cancelled) setHealth(state);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const statuses = ORDER.map(
    (source) => result?.statuses.find((s) => s.source === source) ?? emptyStatus(source),
  );

  async function exportBackup(source: SourceId): Promise<void> {
    setBusy(source);
    try {
      const key = selected[source];
      const record = key ? await getBackup(source, key) : await getBackup(source);
      if (!record) {
        setNotice('Резервная копия для экспорта не найдена');
        return;
      }
      const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${source}_${record.meta.fetchedAt.replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  /** Выгрузка текущей резервной копии источника в Supabase Postgres. */
  async function uploadToSupabase(source: SourceId): Promise<void> {
    if (!writeKey) {
      setNotice('Укажите ключ записи (SUPABASE_CATALOG_WRITE_KEY) в панели Supabase');
      return;
    }
    setBusy(source);
    try {
      const key = selected[source];
      const record = key ? await getBackup(source, key) : await getBackup(source);
      const rows = record ? rowsFromPayload(record.payload) : null;
      if (!record || !rows || rows.length === 0) {
        setNotice(`Нет данных в резерве ${source} для выгрузки`);
        return;
      }
      const result = await uploadCatalogSnapshot({
        source,
        rows,
        endpoint: record.meta.endpoint,
        fetchedAt: record.meta.fetchedAt,
        origin: 'live',
        schemaMissing: [],
        sha256: record.meta.sha256,
        writeKey,
      });
      if (result.ok) {
        setNotice(`${source}: ${rows.length} записей загружено в Supabase`);
      } else {
        setNotice(`${source}: загрузка не выполнена — ${result.error ?? 'неизвестная ошибка'}`);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(960px,95vw)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-accent" /> Источники, резервы и диагностика
          </DialogTitle>
          <DialogDescription>
            Каждый источник проходит уровни LIVE → IndexedDB → Supabase (Postgres) → встроенный снимок →
            пропуск. Откат применяет выбранную версию резерва в текущем сеансе; экспорт скачивает JSON.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                health === null ? 'bg-slate-600' : health.ok ? 'bg-emerald-400' : 'bg-rose-500'
              }`}
            />
            <span className="text-sm font-medium text-slate-100">Supabase (Postgres)</span>
            <span className="text-[11px] text-slate-400">
              {health === null
                ? 'проверка подключения…'
                : health.ok
                  ? `подключено${health.latencyMs ? `, ${health.latencyMs} мс` : ''}`
                  : health.configured
                    ? `недоступно: ${health.error}`
                    : 'не настроено — задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY'}
            </span>
            <input
              type="password"
              className="input ml-auto h-7 w-[220px]"
              placeholder="Ключ записи (x-catalog-key)"
              value={writeKey}
              onChange={(e) => setWriteKey(e.target.value)}
              aria-label="Ключ записи в Supabase"
            />
          </div>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={preferRemote}
              onChange={(e) => setPreferRemote(e.target.checked)}
            />
            Брать каталоги из Postgres как из основного источника (без запросов к TAP)
          </label>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Ключ хранится только в памяти вкладки. Он совпадает с SUPABASE_CATALOG_WRITE_KEY на сервере.
            Массовая выгрузка всех источников: <code className="text-slate-400">npm run upload:catalog</code>.
          </p>
        </div>

        <div className="space-y-2">
          {statuses.map((status) => {
            const list = versions[status.source] ?? [];
            const isExomast = status.source === 'exomast';
            return (
              <div
                key={status.source}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${statusTone(status.state)}`} />
                  <span className="text-sm font-medium text-slate-100">{status.label}</span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] ${statusBadgeClass(status.state)}`}
                  >
                    {statusLabel(status)}
                  </span>
                  <span className="chip">{tierLabel(status.tier)}</span>
                  <span className="text-[11px] text-slate-400">
                    записей: <b className="text-slate-200">{status.records.toLocaleString('ru-RU')}</b>
                  </span>
                  {status.fetchedAt && (
                    <span className="text-[11px] text-slate-500">{formatDate(status.fetchedAt)}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <select
                      className="input h-7 max-w-[230px]"
                      value={selected[status.source] ?? ''}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [status.source]: e.target.value }))
                      }
                      disabled={list.length === 0}
                      aria-label={`Версия резерва ${status.label}`}
                    >
                      {list.length === 0 && <option value="">нет версий</option>}
                      {list.map((v) => (
                        <option key={v.key} value={v.key}>
                          {formatDate(v.meta.fetchedAt)} · {v.meta.recordCount} записей
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isExomast || !selected[status.source] || busy === status.source}
                      onClick={() => {
                        const key = selected[status.source];
                        if (key) rollback(status.source, key);
                      }}
                    >
                      <RotateCcw className="h-3 w-3" /> Откатить
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isExomast || busy === status.source}
                      onClick={() => void exportBackup(status.source)}
                    >
                      <Download className="h-3 w-3" /> Экспорт
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isExomast || busy === status.source || !writeKey}
                      onClick={() => void uploadToSupabase(status.source)}
                    >
                      <UploadCloud className="h-3 w-3" /> В Supabase
                    </Button>
                  </div>
                </div>
                {status.error && (
                  <p className="mt-1.5 text-[11px] text-amber-200/90">Причина: {status.error}</p>
                )}
                {status.schemaMissing.length > 0 && (
                  <p className="mt-1 text-[11px] text-sky-200/80">
                    Нет в схеме, колонки пропущены: {status.schemaMissing.join(', ')}
                  </p>
                )}
                {isExomast && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Exo.MAST не входит в стартовую загрузку и не имеет резервов: запросы идут только
                    при открытии карточки.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/[0.07] bg-space-950/40 p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <TerminalSquare className="h-3.5 w-3.5 text-accent" /> Журнал ошибок (последние 50)
            </h3>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1 font-mono text-[10px]">
              {(result?.logs ?? []).length === 0 && (
                <p className="text-slate-500">Журнал пуст.</p>
              )}
              {[...(result?.logs ?? [])].reverse().map((entry, i) => (
                <div
                  key={`${entry.time}-${i}`}
                  className={
                    entry.level === 'error'
                      ? 'text-rose-300'
                      : entry.level === 'warn'
                        ? 'text-amber-200'
                        : 'text-slate-400'
                  }
                >
                  <span className="text-slate-600">{formatDate(entry.time)}</span>{' '}
                  <span className="text-slate-300">[{entry.source}]</span> {entry.reason}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-space-950/40 p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <History className="h-3.5 w-3.5 text-accent" /> Диагностика схем и слияния
            </h3>
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1 text-[11px] text-slate-400">
              {(result?.diagnostics ?? ['Диагностика появится после первого ответа источников.']).map(
                (line, i) => (
                  <li key={i} className="border-l border-white/10 pl-2">
                    {line}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
