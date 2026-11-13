import { useEffect, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Crosshair,
  Download,
  FlaskConical,
  Globe2,
  Orbit,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CartesianGrid,
  ErrorBar,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SOURCE_CONFIG, type ModeId } from '@/config';
import type { FieldKey, ModelParams, PlanetEntity } from '@/types';
import { qBadge, qBadgeClass, qualityFor, scorePlanet } from '@/lib/calc/scoring';
import { fieldNumber, fieldString } from '@/lib/calc/solver';
import { formatDate, formatNumber, cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { Button } from './ui/button';
import { Hint } from './ui/tooltip';

const ORIGIN_LABEL = {
  measured: 'Измерено',
  physics: 'Физика',
  model: 'Модель',
} as const;

const ORIGIN_CLASS = {
  measured: 'origin-measured',
  physics: 'origin-physics',
  model: 'origin-model',
} as const;

const SOURCE_SHORT: Record<string, string> = {
  nasa: 'NASA',
  exomercat: 'Exo-MerCat',
  exoplanet_eu: 'Exoplanet.eu',
  gaia: 'Gaia',
  simbad: 'SIMBAD',
  exomast: 'Exo.MAST',
};

interface Row {
  key: FieldKey | 'computed';
  label: string;
  value: number | string | null;
  unit: string;
  origin: keyof typeof ORIGIN_LABEL | null;
  source: string | null;
  fetchedAt: string | null;
  note?: string;
}

function originOf(entity: PlanetEntity, key: FieldKey): keyof typeof ORIGIN_LABEL | null {
  return entity.computed.origins[key] ?? entity.fields[key].origin;
}

function rowsFor(entity: PlanetEntity): Row[] {
  const c = entity.computed;
  const f = entity.fields;
  const derived = c.levelB ? 'model' : 'physics';
  return [
    {
      key: 'rade',
      label: 'Радиус R',
      value: c.radiusUsed,
      unit: 'R⊕',
      origin: originOf(entity, 'rade'),
      source: f.rade.source,
      fetchedAt: f.rade.fetchedAt,
    },
    {
      key: 'masse',
      label: 'Масса M',
      value: c.massUsed,
      unit: 'M⊕',
      origin: originOf(entity, 'masse'),
      source: f.masse.source,
      fetchedAt: f.masse.fetchedAt,
      note: f.masse.isMinMass ? 'M·sin(i)' : undefined,
    },
    {
      key: 'orbsmax',
      label: 'Большая полуось a',
      value: c.semiMajorAxis,
      unit: 'а.е.',
      origin: originOf(entity, 'orbsmax'),
      source: f.orbsmax.source,
      fetchedAt: f.orbsmax.fetchedAt,
    },
    {
      key: 'orbper',
      label: 'Период P',
      value: c.period,
      unit: 'сут',
      origin: originOf(entity, 'orbper'),
      source: f.orbper.source,
      fetchedAt: f.orbper.fetchedAt,
    },
    {
      key: 'ecc',
      label: 'Эксцентриситет e',
      value: c.eccentricity,
      unit: '',
      origin: c.eAssumed ? 'physics' : originOf(entity, 'ecc'),
      source: f.ecc.source,
      fetchedAt: f.ecc.fetchedAt,
      note: c.eAssumed ? 'принято e = 0' : undefined,
    },
    {
      key: 'insol',
      label: 'Поток S',
      value: c.sFlux,
      unit: 'S⊕',
      origin: originOf(entity, 'insol') ?? 'physics',
      source: f.insol.source,
      fetchedAt: f.insol.fetchedAt,
    },
    {
      key: 'computed',
      label: 'Равновесная T_eq',
      value: c.teq,
      unit: 'K',
      origin: c.teq === null ? null : 'physics',
      source: null,
      fetchedAt: null,
    },
    {
      key: 'computed',
      label: 'Поверхностная T_s',
      value: c.ts,
      unit: 'K',
      origin: c.ts === null ? null : 'physics',
      source: null,
      fetchedAt: null,
    },
    {
      key: 'computed',
      label: 'Плотность ρ',
      value: c.rho,
      unit: 'г/см³',
      origin: c.rho === null ? null : derived,
      source: null,
      fetchedAt: null,
    },
    {
      key: 'computed',
      label: 'Скорость убегания v_e',
      value: c.ve,
      unit: 'v⊕',
      origin: c.ve === null ? null : derived,
      source: null,
      fetchedAt: null,
    },
    {
      key: 'teff',
      label: 'T_eff звезды',
      value: c.starTeff,
      unit: 'K',
      origin: originOf(entity, 'teff'),
      source: f.teff.source,
      fetchedAt: f.teff.fetchedAt,
    },
    {
      key: 'rad',
      label: 'Радиус звезды',
      value: c.starRadius,
      unit: 'R☉',
      origin: originOf(entity, 'rad'),
      source: f.rad.source,
      fetchedAt: f.rad.fetchedAt,
    },
    {
      key: 'mass',
      label: 'Масса звезды',
      value: c.starMass,
      unit: 'M☉',
      origin: originOf(entity, 'mass'),
      source: f.mass.source,
      fetchedAt: f.mass.fetchedAt,
    },
    {
      key: 'lum',
      label: 'Светимость L',
      value: c.luminosity,
      unit: 'L☉',
      origin: originOf(entity, 'lum'),
      source: f.lum.source,
      fetchedAt: f.lum.fetchedAt,
    },
    {
      key: 'spectype',
      label: 'Спектральный тип',
      value: fieldString(entity.fields, 'spectype'),
      unit: '',
      origin: originOf(entity, 'spectype'),
      source: f.spectype.source,
      fetchedAt: f.spectype.fetchedAt,
    },
    {
      key: 'dist',
      label: 'Расстояние',
      value: fieldNumber(entity.fields, 'dist'),
      unit: 'пк',
      origin: originOf(entity, 'dist'),
      source: f.dist.source,
      fetchedAt: f.dist.fetchedAt,
    },
    {
      key: 'ra',
      label: 'Прямое восхождение',
      value: fieldNumber(entity.fields, 'ra'),
      unit: '°',
      origin: originOf(entity, 'ra'),
      source: f.ra.source,
      fetchedAt: f.ra.fetchedAt,
    },
    {
      key: 'dec',
      label: 'Склонение',
      value: fieldNumber(entity.fields, 'dec'),
      unit: '°',
      origin: originOf(entity, 'dec'),
      source: f.dec.source,
      fetchedAt: f.dec.fetchedAt,
    },
  ];
}

function OriginBadge({ origin, source, fetchedAt }: Pick<Row, 'origin' | 'source' | 'fetchedAt'>) {
  if (!origin) return <span className="text-[10px] text-slate-600">—</span>;
  const content = (
    <span className={cn('inline-flex items-center gap-1 text-[10px]', ORIGIN_CLASS[origin])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {ORIGIN_LABEL[origin]}
      {origin === 'measured' && source ? ` · ${SOURCE_SHORT[source] ?? source}` : ''}
    </span>
  );
  if (origin === 'measured' && fetchedAt) {
    return <Hint content={`Источник: ${source ?? '—'} · ${formatDate(fetchedAt)}`}>{content}</Hint>;
  }
  return content;
}

function ParamTable({ entity }: { entity: PlanetEntity }) {
  const rows = useMemo(() => rowsFor(entity), [entity]);
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
      <table className="w-full text-left text-[11px]">
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.label}-${index}`}
              className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
            >
              <td className="w-[44%] px-2 py-1.5 text-slate-400">{row.label}</td>
              <td className="px-2 py-1.5 text-right font-mono text-slate-200">
                {typeof row.value === 'number'
                  ? formatNumber(row.value, row.unit === '°' ? 4 : 3)
                  : row.value ?? '—'}
                {row.unit && <span className="ml-1 text-[9px] text-slate-500">{row.unit}</span>}
                {row.note && (
                  <span className="ml-1 rounded border border-amber-400/30 bg-amber-400/10 px-1 text-[8px] text-amber-200">
                    {row.note}
                  </span>
                )}
              </td>
              <td className="w-[30%] px-2 py-1.5 text-right">
                <OriginBadge origin={row.origin} source={row.source} fetchedAt={row.fetchedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Discrepancies({ entity }: { entity: PlanetEntity }) {
  const fields = (Object.entries(entity.fields) as [FieldKey, PlanetEntity['fields'][FieldKey]][]).filter(
    ([, value]) => value.conflict || value.alternatives.length > 0,
  );
  if (fields.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-2 text-[11px] text-emerald-200/80">
        Расхождений источников не обнаружено.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {fields.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-amber-400/15 bg-amber-400/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] text-amber-100">
            <AlertTriangle className="h-3 w-3" /> {key}
            {value.conflict && <span className="text-[9px] uppercase tracking-wide">conflict</span>}
          </div>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-slate-400">
            <li>
              <span className="text-emerald-300">{SOURCE_SHORT[value.source ?? ''] ?? value.source ?? '—'}</span>{' '}
              {typeof value.value === 'number' ? formatNumber(value.value, 4) : String(value.value)}
              {value.isMinMass && ' (M·sin i)'} — выбрано
            </li>
            {value.alternatives.map((alt, i) => (
              <li key={i}>
                <span className="text-slate-300">{SOURCE_SHORT[alt.source] ?? alt.source}</span>{' '}
                {typeof alt.value === 'number' ? formatNumber(alt.value, 4) : String(alt.value)}
                {alt.isMinMass && ' (M·sin i)'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FactorBar({ label, value, active = true }: { label: string; value: number | null; active?: boolean }) {
  return (
    <div className={cn('text-[10px]', !active && 'opacity-45')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-200">{value === null ? '—' : formatNumber(value, 3)}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300"
          style={{ width: `${Math.max(0, Math.min(1, value ?? 0)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ScoreDecomposition({
  entity,
  mode,
  model,
}: {
  entity: PlanetEntity;
  mode: ModeId;
  model: ModelParams;
}) {
  const c = entity.computed;
  const score = scorePlanet(entity, {
    mode,
    hzBound: model.hzBound,
    penalizeRocky: model.penalizeRocky,
    penalizeEcc: model.penalizeEcc,
    penalizeStar: model.penalizeStar,
    applyQData: model.applyQData,
  });
  const q = qualityFor(entity, mode, model.hzBound);
  const fHz = model.hzBound === 'optimistic' ? c.fHzOpt : c.fHz;
  const penaltiesActive = mode === 'adaptive' || mode === 'rhi';
  const qActive = penaltiesActive && model.applyQData;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-accent/20 bg-accent/[0.05] p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-slate-300">Итоговый индекс · {mode}</span>
          <span className="font-mono text-lg text-accent-soft">
            {score === null ? '—' : `${formatNumber(score * 100, 2)}%`}
          </span>
        </div>
        <p className="mt-0.5 text-[9px] text-slate-500">
          Границы ЗО: {model.hzBound === 'optimistic' ? 'оптимистичная' : 'консервативная'} · Q_data
          фильтр: {model.minQData}%
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-white/[0.06] p-2.5">
        <FactorBar label="ESI_interior" value={c.esiInterior} />
        <FactorBar label="ESI_R" value={c.esiR} />
        <FactorBar label="ESI_ρ" value={c.esiRho} />
        <FactorBar label="ESI_v" value={c.esiVe} />
        <FactorBar label="ESI_S" value={c.esiS} />
        <FactorBar label="ESI_T" value={c.esiT} />
        <FactorBar label="F_HZ" value={fHz} />
        <FactorBar label="P_rocky" value={c.pRocky} active={penaltiesActive && model.penalizeRocky} />
        <FactorBar label="P_ecc" value={c.pEcc} active={penaltiesActive && model.penalizeEcc} />
        <FactorBar label="P_star" value={c.pStar} active={penaltiesActive && model.penalizeStar} />
        <FactorBar label="Q_data" value={q} active={qActive} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${qBadgeClass(q)}`}>
          Q_data: {qBadge(q)} · {formatNumber(q, 3)}
        </span>
        {c.levelB && (
          <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200">
            Уровень Б · −0.10
          </span>
        )}
        {c.eAssumed && (
          <span className="rounded-md border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-200">
            e принят · −0.05
          </span>
        )}
        {c.availableSubindexes < 4 && (
          <span className="rounded-md border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 text-[10px] text-rose-200">
            исключено субиндексов: {4 - c.availableSubindexes}
          </span>
        )}
      </div>

      {c.insufficientData && (
        <p className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-2 text-[11px] text-amber-200">
          k &lt; 3: индекс 0.00, запись остаётся в массиве и уходит за пределы Топ-50.
        </p>
      )}
    </div>
  );
}

const PROPERTY_WHITELIST = [
  'Mp',
  'Rp',
  'Ms',
  'Rs',
  'Teff',
  'a',
  'e',
  'i',
  'P',
  'depth',
  'duration',
  'insol',
  'transit_depth',
];

function ExoMastSection({ entity }: { entity: PlanetEntity }) {
  const data = useAppStore((s) => s.exomast[entity.id]);
  const loading = useAppStore((s) => s.exomastLoading[entity.id] ?? false);
  const load = useAppStore((s) => s.loadExoMast);

  useEffect(() => {
    void load(entity);
  }, [entity, load]);

  const properties = useMemo(() => {
    if (!data?.properties) return [];
    const props = data.properties;
    const normalized = new Map(Object.keys(props).map((key) => [key.toLowerCase(), key]));
    const rows: { label: string; value: string; unit: string }[] = [];
    for (const key of PROPERTY_WHITELIST) {
      const actual = normalized.get(key.toLowerCase());
      if (!actual) continue;
      const value = props[actual];
      if (typeof value !== 'number' && typeof value !== 'string') continue;
      const unitKey = normalized.get(`${key}_unit`.toLowerCase());
      rows.push({
        label: key,
        value: String(value),
        unit: unitKey ? String(props[unitKey]) : '',
      });
    }
    return rows;
  }, [data]);

  const spectrum = useMemo(() => {
    if (!data || data.spectra.length === 0) return [];
    const step = Math.max(1, Math.ceil(data.spectra.length / 420));
    return data.spectra.filter((_, i) => i % step === 0);
  }, [data]);

  const radar = useMemo(() => {
    const c = entity.computed;
    return [
      { axis: 'R', planet: c.esiR, earth: 1 },
      { axis: 'ρ', planet: c.esiRho, earth: 1 },
      { axis: 'v_e', planet: c.esiVe, earth: 1 },
      { axis: 'S', planet: c.esiS, earth: 1 },
      { axis: 'T_s', planet: c.esiT, earth: 1 },
    ];
  }, [entity]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-200">Exo.MAST (ленивая загрузка)</h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => void load(entity, true)}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Обновить данные планеты
        </Button>
      </div>

      {loading && <p className="text-[11px] text-slate-500">Запрашиваю Exo.MAST…</p>}
      {!loading && data?.error && (
        <p className="rounded border border-amber-400/20 bg-amber-400/[0.05] p-2 text-[10px] text-amber-200">
          Exo.MAST: {data.error}. Показаны прежние данные, если они были.
        </p>
      )}

      <div className="rounded-lg border border-white/[0.06] p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Свойства</p>
        {properties.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            {loading ? '…' : 'Свойства не распознаны или сервис недоступен.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {properties.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-2 text-[10px]">
                <span className="text-slate-500">{row.label}</span>
                <span className="font-mono text-slate-300">
                  {row.value} <span className="text-slate-600">{row.unit}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/[0.06] p-2">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Спектр</p>
          <span className="text-[9px] text-slate-600">файлов: {data?.spectraFiles.length ?? 0}</span>
        </div>
        {spectrum.length === 0 ? (
          <p className="text-[11px] text-slate-500">Спектров нет — это нормальный случай для большинства планет.</p>
        ) : (
          <>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spectrum} margin={{ top: 6, right: 8, bottom: 2, left: -18 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="wavelength"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fill: '#64748b', fontSize: 8 }}
                    stroke="rgba(255,255,255,0.12)"
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 8 }} stroke="rgba(255,255,255,0.12)" />
                  <ChartTooltip
                    contentStyle={{
                      background: '#080c15',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      fontSize: 10,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#34d399"
                    dot={false}
                    strokeWidth={1.2}
                    isAnimationActive={false}
                  >
                    <ErrorBar dataKey="error" width={2} strokeWidth={1} stroke="rgba(52,211,153,0.45)" />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[9px] text-slate-600">
              Ось X — длина волны, ось Y — значение из первого файла; единицы зависят от файла.
            </p>
          </>
        )}
      </div>

      <div className="rounded-lg border border-white/[0.06] p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
          Радар-сравнение с Землёй
        </p>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: '#94a3b8', fontSize: 9 }} />
              <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
              <Radar name="Земля" dataKey="earth" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.12} />
              <Radar
                name={entity.names[0]}
                dataKey="planet"
                stroke="#34d399"
                fill="#34d399"
                fillOpacity={0.22}
              />
              <ChartTooltip
                contentStyle={{
                  background: '#080c15',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  fontSize: 10,
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function PlanetCard({
  entity,
  open,
  onClose,
}: {
  entity: PlanetEntity | null;
  open: boolean;
  onClose: () => void;
}) {
  const mode = useAppStore((s) => s.mode);
  const model = useAppStore((s) => s.model);
  const setPinned = useAppStore((s) => s.setPinned);

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-space-950/35 transition-opacity',
          open && entity ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-[min(540px,100vw)] flex-col border-l border-white/10 bg-space-900/95 shadow-2xl backdrop-blur-xl transition-transform duration-300',
          open && entity ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open || !entity}
      >
        {entity ? (
          <>
            <div className="flex items-start gap-2 border-b border-white/[0.07] p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="truncate text-base font-semibold text-white">{entity.names[0]}</h2>
                  {entity.computed.levelB && (
                    <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200">
                      Реконструкция по расчётной модели
                    </span>
                  )}
                  {entity.fields.masse.isMinMass && (
                    <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200">
                      M·sin(i)
                    </span>
                  )}
                  {entity.computed.hzExtrapolated && (
                    <span className="rounded border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-[9px] text-sky-200">
                      ЗО: экстраполяция
                    </span>
                  )}
                  {entity.contested && (
                    <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200">
                      спорная
                    </span>
                  )}
                  {entity.status === 'candidate' && (
                    <span className="rounded border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-[9px] text-sky-200">
                      кандидат
                    </span>
                  )}
                  {entity.computed.insufficientData && (
                    <span className="rounded border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 text-[9px] text-rose-200">
                      Недостаточно данных для отрисовки
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {entity.hostName ?? 'звезда не указана'} · источники:{' '}
                  {entity.sources.map((s) => SOURCE_SHORT[s] ?? s).join(', ')}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={onClose} aria-label="Закрыть карточку">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-white/[0.07] px-3 py-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPinned(entity.id, { openCard: true, tab: 'map' })}
              >
                <Globe2 className="h-3.5 w-3.5" /> Показать на карте
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setPinned(entity.id, { openCard: true, tab: 'system' })}
              >
                <Orbit className="h-3.5 w-3.5" /> Приблизить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPinned(null)}>
                <ArrowUpRight className="h-3.5 w-3.5" /> Сбросить выбор
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <ParamTable entity={entity} />

              {entity.computed.missing.length > 0 && (
                <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-2 text-[10px] text-amber-200/90">
                  Не хватает: {entity.computed.missing.join(', ')}. Производные значения получены
                  физическим решателем или моделью.
                </p>
              )}

              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Activity className="h-3.5 w-3.5 text-accent" /> Расхождения источников
                </h3>
                <Discrepancies entity={entity} />
              </section>

              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <FlaskConical className="h-3.5 w-3.5 text-accent" /> Декомпозиция балла
                </h3>
                <ScoreDecomposition entity={entity} mode={mode} model={model} />
              </section>

              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Sparkles className="h-3.5 w-3.5 text-accent" /> Exo.MAST, спектр и сравнение
                </h3>
                <ExoMastSection entity={entity} />
              </section>

              {entity.dedupWarnings.length > 0 && (
                <section className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-2">
                  <p className="text-[10px] uppercase tracking-wide text-amber-200/80">
                    Предупреждения дедупликации
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-slate-400">
                    {entity.dedupWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.07] px-3 py-2 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Crosshair className="h-3 w-3" /> pin: {entity.id}
              </span>
              <span>Exo.MAST не запрашивается при старте</span>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-[11px] text-slate-500">
            Планета не найдена после обновления данных.
          </div>
        )}
      </aside>
    </>
  );
}
