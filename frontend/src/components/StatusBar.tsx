import { AlertTriangle, Info, Loader2, Radio, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { fallbackStatus, sourceLabel, statusLabel, statusTone } from './status';
import { Button } from './ui/button';

export function StatusBar({ onOpenSources }: { onOpenSources: () => void }) {
  const result = useAppStore((s) => s.result);
  const progress = useAppStore((s) => s.progress);
  const done = useAppStore((s) => s.done);
  const error = useAppStore((s) => s.error);
  const notice = useAppStore((s) => s.notice);
  const setNotice = useAppStore((s) => s.setNotice);

  const statuses = result?.statuses ?? [];
  const fallbacks = statuses.filter(
    (s) => fallbackStatus(s) || s.state === 'error',
  );

  return (
    <div className="border-b border-white/[0.06] bg-space-900/40">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        {!done ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            <span>
              Данные уточняются: <b className="text-white">{progress.completed}/6</b> источников
            </span>
            <span className="hidden text-slate-500 sm:inline">· {progress.phase}</span>
            <span className="ml-1 h-1 w-24 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.min(100, (progress.completed / 6) * 100)}%` }}
              />
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Radio className="h-3 w-3 text-emerald-400" />
            Пайплайн завершён. Exo.MAST загружается только по карточке.
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {statuses.map((status) => (
            <button
              key={status.source}
              type="button"
              onClick={onOpenSources}
              title={statusLabel(status)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:border-white/15 hover:text-slate-200"
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', statusTone(status.state))} />
              {status.source === 'exomast' ? 'Exo.MAST' : status.label.replace(' Exoplanet Archive', '').replace(' (INAF)', '').replace(' (LESIA)', '').replace('ESA ', '').replace(' (STScI)', '').replace('CDS ', '')}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={onOpenSources}>
            Источники
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-t border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 border-t border-accent/20 bg-accent/[0.06] px-3 py-1.5 text-[11px] text-accent-soft">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Скрыть уведомление"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {fallbacks.length > 0 && (
        <div className="flex items-start gap-2 border-t border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-[11px] text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {fallbacks.map((status) => (
              <span key={status.source}>
                {status.state === 'error'
                  ? `${sourceLabel(status.source)}: данных нет — источник пропущен.`
                  : `Не удалось обновить ${sourceLabel(status.source)}. Используются ${
                      status.state === 'cache' ? 'резервные данные' : 'встроенный снимок'
                    } от ${statusLabel(status).replace(/^.*? от /, '')}.`}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenSources}
            className="ml-auto shrink-0 underline decoration-dotted underline-offset-2 hover:text-white"
          >
            Подробнее
          </button>
        </div>
      )}
    </div>
  );
}
