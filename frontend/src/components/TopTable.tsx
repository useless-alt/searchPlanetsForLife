import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Crosshair, Info, Sparkles } from 'lucide-react';
import { CLASS_COLORS, type ModeId } from '@/config';
import { qBadge, qBadgeClass, qualityFor, spectralClassOf } from '@/lib/calc/scoring';
import { fieldNumber } from '@/lib/calc/solver';
import type { ModelParams, PlanetEntity, RankedPlanet } from '@/types';
import { formatNumber } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { Button } from './ui/button';
import { Hint } from './ui/tooltip';
import { EarthRow } from './EarthRow';

interface Props {
  rows: RankedPlanet[];
  mode: ModeId;
  model: ModelParams;
  onResetFilters: () => void;
}

function displayRadius(entity: PlanetEntity): { value: number | null; origin: string } {
  return {
    value: fieldNumber(entity.fields, 'rade') ?? entity.computed.radiusUsed,
    origin: entity.computed.origins.rade ?? entity.fields.rade.origin ?? 'measured',
  };
}

function displayMass(entity: PlanetEntity): { value: number | null; origin: string; min: boolean } {
  return {
    value: fieldNumber(entity.fields, 'masse') ?? entity.computed.massUsed,
    origin: entity.computed.origins.masse ?? entity.fields.masse.origin ?? 'measured',
    min: entity.fields.masse.isMinMass === true,
  };
}

function OriginMark({ origin }: { origin: string }) {
  if (origin === 'measured') return null;
  return (
    <span
      className={origin === 'model' ? 'origin-model' : 'origin-physics'}
      title={origin === 'model' ? 'Модель (Чен—Киппинг)' : 'Физический расчёт'}
    >
      ~
    </span>
  );
}

function deltaCell(delta: number | null, mode: ModeId) {
  if (mode === 'classic' || delta === null) return <span className="text-slate-600">—</span>;
  if (delta === 0) return <span className="text-slate-600">0</span>;
  const positive = delta > 0;
  return (
    <span className={positive ? 'text-emerald-400' : 'text-rose-400'}>
      {positive ? '+' : ''}
      {delta}
    </span>
  );
}

export function TopTable({ rows, mode, model, onResetFilters }: Props) {
  const setPinned = useAppStore((s) => s.setPinned);
  const pinnedId = useAppStore((s) => s.pinnedId);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'rank', desc: false }]);

  const columns = useMemo<ColumnDef<RankedPlanet>[]>(
    () => [
      {
        id: 'rank',
        header: '#',
        accessorFn: (row) => row.rank ?? Number.MAX_SAFE_INTEGER,
        size: 66,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-[12px] text-slate-200">{r.rank ?? '—'}</span>
              <span className="text-[9px]">{deltaCell(r.delta, mode)}</span>
            </div>
          );
        },
      },
      {
        id: 'name',
        header: 'Планета / звезда',
        accessorFn: (row) => row.entity.names[0] ?? '',
        size: 190,
        cell: ({ row }) => {
          const e = row.original.entity;
          return (
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-slate-100">
                {e.names[0] ?? 'Без имени'}
                {e.contested && (
                  <span className="ml-1 rounded border border-amber-400/30 bg-amber-400/10 px-1 text-[9px] text-amber-200">
                    спорная
                  </span>
                )}
                {e.status === 'candidate' && (
                  <span className="ml-1 rounded border border-sky-400/30 bg-sky-400/10 px-1 text-[9px] text-sky-200">
                    кандидат
                  </span>
                )}
              </div>
              <div className="truncate text-[10px] text-slate-500">
                {e.hostName ?? e.names[1] ?? '—'}
              </div>
            </div>
          );
        },
      },
      {
        id: 'score',
        header: 'Индекс',
        accessorFn: (row) => row.score ?? -1,
        size: 112,
        cell: ({ row }) => {
          const score = row.original.score;
          if (score === null) return <span className="text-slate-600">—</span>;
          return (
            <div className="min-w-[82px]">
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-[12px] text-accent-soft">{formatNumber(score * 100, 2)}%</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300"
                  style={{ width: `${Math.max(1, Math.min(100, score * 100))}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        id: 'q',
        header: 'Q_data',
        accessorFn: (row) => qualityFor(row.entity, mode, model.hzBound),
        size: 92,
        enableSorting: mode === 'adaptive' || mode === 'rhi',
        cell: ({ row }) => {
          if (mode === 'classic' || mode === 'strict') {
            return (
              <Hint content="Q_data не входит в формулу этого режима; порог минимального Q_data при этом продолжает фильтровать выдачу.">
                <span className="cursor-help text-slate-600">—</span>
              </Hint>
            );
          }
          const q = qualityFor(row.original.entity, mode, model.hzBound);
          const badge = qBadge(q);
          return (
            <Hint
              content={`Q_data = ${formatNumber(q, 3)} · ${badge}. Штрафы: уровень Б ${
                row.original.entity.computed.levelB ? 'да' : 'нет'
              }, e принят ${row.original.entity.computed.eAssumed ? 'да' : 'нет'}, исключено субиндексов ${
                4 - row.original.entity.computed.availableSubindexes
              }.`}
            >
              <span
                className={`inline-flex cursor-help rounded-md border px-1.5 py-0.5 text-[10px] ${qBadgeClass(q)}`}
              >
                {badge}
              </span>
            </Hint>
          );
        },
      },
      {
        id: 'radius',
        header: 'R, R⊕',
        accessorFn: (row) => displayRadius(row.entity).value ?? -1,
        size: 74,
        cell: ({ row }) => {
          const r = displayRadius(row.original.entity);
          return (
            <span className="font-mono text-[11px] text-slate-300">
              <OriginMark origin={r.origin} />
              {formatNumber(r.value, 2)}
            </span>
          );
        },
      },
      {
        id: 'mass',
        header: 'M, M⊕',
        accessorFn: (row) => displayMass(row.entity).value ?? -1,
        size: 82,
        cell: ({ row }) => {
          const m = displayMass(row.original.entity);
          return (
            <span className="font-mono text-[11px] text-slate-300">
              <OriginMark origin={m.origin} />
              {formatNumber(m.value, 2)}
              {m.min && (
                <span className="ml-0.5 align-super text-[8px] text-amber-300" title="M·sin(i)">
                  min
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: 'ecc',
        header: 'e',
        accessorFn: (row) => row.entity.computed.eccentricity ?? -1,
        size: 52,
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-slate-400">
            {formatNumber(row.original.entity.computed.eccentricity, 3)}
          </span>
        ),
      },
      {
        id: 'class',
        header: 'Класс',
        accessorFn: (row) => spectralClassOf(row.entity) ?? '',
        size: 54,
        cell: ({ row }) => {
          const cls = spectralClassOf(row.original.entity);
          if (!cls) return <span className="text-slate-600">—</span>;
          return (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: CLASS_COLORS[cls], boxShadow: `0 0 6px ${CLASS_COLORS[cls]}66` }}
              />
              {cls}
            </span>
          );
        },
      },
      {
        id: 'ts',
        header: 'T_s, K',
        accessorFn: (row) => row.entity.computed.ts ?? -1,
        size: 70,
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-slate-400">
            {formatNumber(row.original.entity.computed.ts, 0)}
          </span>
        ),
      },
      {
        id: 'dist',
        header: 'd, пк',
        accessorFn: (row) => fieldNumber(row.entity.fields, 'dist') ?? -1,
        size: 70,
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-slate-400">
            {formatNumber(fieldNumber(row.original.entity.fields, 'dist'), 1)}
          </span>
        ),
      },
      {
        id: 'action',
        header: '',
        size: 38,
        enableSorting: false,
        cell: ({ row }) => (
          <Hint content="Закрепить и показать на карте">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(event) => {
                event.stopPropagation();
                setPinned(row.original.entity.id, { openCard: true, tab: 'map' });
              }}
            >
              <Crosshair className="h-3.5 w-3.5" />
            </Button>
          </Hint>
        ),
      },
    ],
    [mode, model.hzBound, setPinned],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.entity.id,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 bg-space-900/95 backdrop-blur">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className="border-b border-white/[0.07] px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 transition hover:text-slate-200"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === 'asc' ? (
                            <ArrowUp className="h-2.5 w-2.5 text-accent" />
                          ) : dir === 'desc' ? (
                            <ArrowDown className="h-2.5 w-2.5 text-accent" />
                          ) : (
                            <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const pinned = row.original.entity.id === pinnedId;
              return (
                <tr
                  key={row.id}
                  onClick={() => setPinned(row.original.entity.id, { openCard: true })}
                  className={`group cursor-pointer border-b border-white/[0.035] transition hover:bg-white/[0.035] ${
                    pinned ? 'bg-accent/[0.07]' : ''
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <Sparkles className="h-6 w-6 text-slate-600" />
            <p className="text-sm text-slate-300">Подходящих планет нет</p>
            <p className="max-w-xs text-[11px] text-slate-500">
              Ослабьте фильтры или понизьте минимальный Q_data — Топ-50 строится после фильтров.
            </p>
            <Button variant="outline" size="sm" onClick={onResetFilters}>
              Сбросить фильтры
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.07] bg-space-950/50 px-2.5 py-1 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          Сортировка по заголовкам · дельта к «Упрощённому ESI» · «~» = физика/модель
        </span>
        <span>{rows.length}/50</span>
      </div>

      <EarthRow mode={mode} model={model} />
    </div>
  );
}
