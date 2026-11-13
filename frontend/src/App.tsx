import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { Download, Filter, LayoutList, Map as MapIcon, Orbit, SlidersHorizontal, Sparkles } from 'lucide-react';
import { MODES } from '@/config';
import { useAppStore, rank } from '@/store/useAppStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useWebGL } from '@/hooks/useWebGL';
import { fieldNumber } from '@/lib/calc/solver';
import { qualityFor, spectralClassOf } from '@/lib/calc/scoring';
import { formatNumber } from '@/lib/utils';
import type { RankedPlanet } from '@/types';
import { Header } from '@/components/Header';
import { StatusBar } from '@/components/StatusBar';
import { Counters } from '@/components/Counters';
import { TopTable } from '@/components/TopTable';
import { SourcesPanel } from '@/components/SourcesPanel';
import { ModelPanel } from '@/components/ModelPanel';
import { FiltersPanel } from '@/components/FiltersPanel';
import { MethodologyDialog } from '@/components/MethodologyDialog';
import { PlanetCard } from '@/components/PlanetCard';
import { StartupProgress } from '@/components/StartupProgress';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GalaxyMap } from '@/three/GalaxyMap';
import { SystemScene } from '@/three/SystemScene';
import { cn } from '@/lib/utils';

function downloadCsv(rows: RankedPlanet[], mode: string): void {
  const data = rows.map((row) => {
    const e = row.entity;
    return {
      rank: row.rank ?? '',
      planet: e.names[0] ?? '',
      host: e.hostName ?? '',
      mode,
      index_percent: row.score === null ? '' : (row.score * 100).toFixed(4),
      q_data: qualityFor(e, 'adaptive', 'conservative').toFixed(3),
      radius_re: formatNumber(fieldNumber(e.fields, 'rade') ?? e.computed.radiusUsed, 4),
      mass_me: formatNumber(fieldNumber(e.fields, 'masse') ?? e.computed.massUsed, 4),
      mass_is_min: e.fields.masse.isMinMass ? 'yes' : 'no',
      eccentricity: formatNumber(e.computed.eccentricity, 4),
      spectral_class: spectralClassOf(e) ?? '',
      ts_k: formatNumber(e.computed.ts, 1),
      distance_pc: formatNumber(fieldNumber(e.fields, 'dist'), 3),
      sources: e.sources.join('|'),
      level_b: e.computed.levelB ? 'yes' : 'no',
      conflict_fields: Object.entries(e.fields)
        .filter(([, v]) => v.conflict)
        .map(([k]) => k)
        .join('|'),
    };
  });
  const csv = Papa.unparse(data, { delimiter: ';' });
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `exoplanet_top50_${mode}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const startPipeline = useAppStore((s) => s.startPipeline);
  const result = useAppStore((s) => s.result);
  const mode = useAppStore((s) => s.mode);
  const model = useAppStore((s) => s.model);
  const filters = useAppStore((s) => s.filters);
  const pinnedId = useAppStore((s) => s.pinnedId);
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const cardOpen = useAppStore((s) => s.cardOpen);
  const setCardOpen = useAppStore((s) => s.setCardOpen);
  const mapResetToken = useAppStore((s) => s.mapResetToken);
  const resetFilters = useAppStore((s) => s.resetFilters);

  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'table' | 'visual'>('table');

  const webgl = useWebGL();

  useEffect(() => {
    startPipeline();
  }, [startPipeline]);

  const debouncedModel = useDebouncedValue(model, 150);
  const debouncedFilters = useDebouncedValue(filters, 150);

  const ranking = useMemo(
    () => rank(result, mode, debouncedModel, debouncedFilters),
    [result, mode, debouncedModel, debouncedFilters],
  );

  const pinned = useMemo(
    () => result?.entities.find((entity) => entity.id === pinnedId) ?? null,
    [result, pinnedId],
  );

  const filterCount =
    (filters.spectral.length > 0 ? 1 : 0) +
    (filters.radius ? 1 : 0) +
    (filters.ts ? 1 : 0) +
    (filters.ecc ? 1 : 0) +
    (filters.includeCandidates ? 1 : 0);

  const modeInfo = MODES.find((m) => m.id === mode);

  return (
    <TooltipProvider delayDuration={220}>
      <div className="flex h-screen flex-col overflow-hidden">
        <Header
          onOpenModel={() => setModelOpen(true)}
          onOpenFilters={() => setFiltersOpen(true)}
          onOpenSources={() => setSourcesOpen(true)}
          onOpenMethodology={() => setMethodOpen(true)}
          filterCount={filterCount}
        />

        <StatusBar onOpenSources={() => setSourcesOpen(true)} />

        {result && ranking && <Counters result={result} ranking={ranking} />}

        <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-1.5 lg:hidden">
          <Button
            size="sm"
            variant={mobileView === 'table' ? 'primary' : 'ghost'}
            onClick={() => setMobileView('table')}
          >
            <LayoutList className="h-3.5 w-3.5" /> Таблица
          </Button>
          <Button
            size="sm"
            variant={mobileView === 'visual' ? 'primary' : 'ghost'}
            onClick={() => setMobileView('visual')}
          >
            <Orbit className="h-3.5 w-3.5" /> 3D
          </Button>
          <span className="ml-auto text-[10px] text-slate-500">{modeInfo?.label}</span>
        </div>

        {!result ? (
          <StartupProgress />
        ) : (
          <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.12fr)_minmax(400px,0.88fr)]">
            <section
              className={cn(
                'min-h-0 flex-col border-r border-white/[0.06]',
                mobileView === 'table' ? 'flex' : 'hidden lg:flex',
              )}
            >
              <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                <div>
                  <h2 className="text-xs font-semibold text-slate-100">Топ-50</h2>
                  <p className="text-[9px] text-slate-500">
                    {modeInfo?.label} · сортировка по заголовкам · сдвиг к упрощённому ESI
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setFiltersOpen(true)}>
                    <Filter className="h-3.5 w-3.5" /> Фильтры
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => ranking && downloadCsv(ranking.top, mode)}
                  >
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                </div>
              </div>
              <TopTable
                rows={ranking?.top ?? []}
                mode={mode}
                model={debouncedModel}
                onResetFilters={resetFilters}
              />
            </section>

            <section
              className={cn(
                'min-h-0 flex-col p-2',
                mobileView === 'visual' ? 'flex' : 'hidden lg:flex',
              )}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <div className="flex overflow-hidden rounded-lg border border-white/[0.08] bg-space-950/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTab('map')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition',
                      tab === 'map'
                        ? 'bg-accent/15 text-accent-soft'
                        : 'text-slate-400 hover:bg-white/5',
                    )}
                  >
                    <MapIcon className="h-3 w-3" /> Карта Галактики
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('system')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition',
                      tab === 'system'
                        ? 'bg-accent/15 text-accent-soft'
                        : 'text-slate-400 hover:bg-white/5',
                    )}
                  >
                    <Orbit className="h-3 w-3" /> Сцена системы
                  </button>
                </div>
                <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-slate-500">
                  <Sparkles className="h-3 w-3 text-accent/70" />
                  {pinned ? pinned.names[0] : 'планета не закреплена'}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setModelOpen(true)}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="min-h-0 flex-1">
                <ErrorBoundary label="3D">
                  {webgl ? (
                    tab === 'map' ? (
                      <GalaxyMap
                        entities={result.entities}
                        top={ranking?.top ?? []}
                        resetToken={mapResetToken}
                      />
                    ) : (
                      <SystemScene entity={pinned} />
                    )
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-space-950/40 p-6 text-center text-[11px] text-slate-400">
                      <p className="text-sm text-slate-200">WebGL недоступен</p>
                      <p>Таблица, фильтры и карточка планеты продолжают работать.</p>
                    </div>
                  )}
                </ErrorBoundary>
              </div>
            </section>
          </main>
        )}

        <SourcesPanel open={sourcesOpen} onOpenChange={setSourcesOpen} />
        <ModelPanel open={modelOpen} onOpenChange={setModelOpen} />
        <FiltersPanel open={filtersOpen} onOpenChange={setFiltersOpen} />
        <MethodologyDialog open={methodOpen} onOpenChange={setMethodOpen} />
        <PlanetCard entity={pinned} open={cardOpen} onClose={() => setCardOpen(false)} />
      </div>
    </TooltipProvider>
  );
}
