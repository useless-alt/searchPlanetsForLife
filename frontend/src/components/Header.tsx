import {
  BookOpen,
  Database,
  Filter,
  Orbit,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { MODES } from '@/config';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Hint } from './ui/tooltip';

interface HeaderProps {
  onOpenModel: () => void;
  onOpenFilters: () => void;
  onOpenSources: () => void;
  onOpenMethodology: () => void;
  filterCount: number;
}

export function Header({
  onOpenModel,
  onOpenFilters,
  onOpenSources,
  onOpenMethodology,
  filterCount,
}: HeaderProps) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const refresh = useAppStore((s) => s.refresh);
  const done = useAppStore((s) => s.done);
  const result = useAppStore((s) => s.result);

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-accent/25 bg-accent/[0.08] shadow-glow">
          <Orbit className="h-5 w-5 text-accent-soft" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_#10b981]" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-white">
            Exoplanet Habitability Explorer
          </h1>
          <p className="truncate text-[10px] text-slate-500">
            Шесть научных каталогов · физический решатель · Топ-50
          </p>
        </div>
      </div>

      <div className="order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-white/[0.07] bg-space-950/60 p-1 md:order-none md:ml-3 md:w-auto">
        {MODES.map((m) => (
          <Hint
            key={m.id}
            content={
              <span>
                <b className="text-white">{m.label}</b>
                <br />
                <span className="font-mono text-[10px] text-slate-300">{m.formula}</span>
              </span>
            }
          >
            <button
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition',
                mode === m.id
                  ? 'bg-accent/15 text-accent-soft shadow-[inset_0_0_0_1px_rgba(16,185,129,0.3)]'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200',
              )}
            >
              {m.label}
            </button>
          </Hint>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onOpenModel}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Параметры модели</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenFilters}>
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Фильтры</span>
          {filterCount > 0 && (
            <span className="rounded bg-accent/20 px-1 text-[10px] text-accent-soft">{filterCount}</span>
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenSources}>
          <Database className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Источники</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenMethodology}>
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Методика</span>
        </Button>
        <Hint content="Перезапросить все источники (LIVE → IDB → снимок)">
          <Button variant="primary" size="sm" onClick={refresh} disabled={!done && !result}>
            <RefreshCw className={cn('h-3.5 w-3.5', !done && 'animate-spin')} />
            <span className="hidden lg:inline">Обновить данные</span>
          </Button>
        </Hint>
      </div>
    </header>
  );
}
