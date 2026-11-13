import { useMemo } from 'react';
import { Globe2 } from 'lucide-react';
import { EARTH_FIELDS, earthComputed } from '@/lib/calc/solver';
import { qBadge, qBadgeClass, qualityFor, scorePlanet } from '@/lib/calc/scoring';
import type { ModeId } from '@/config';
import type { ModelParams, PlanetEntity } from '@/types';
import { formatNumber } from '@/lib/utils';
import { Hint } from './ui/tooltip';

export function EarthRow({
  mode,
  model,
}: {
  mode: ModeId;
  model: ModelParams;
}) {
  const entity = useMemo<PlanetEntity>(() => {
    const conservative = earthComputed('conservative');
    const optimistic = earthComputed('optimistic');
    return {
      id: 'earth-calibration',
      names: ['Земля (эталон)'],
      sources: [],
      status: 'confirmed',
      contested: false,
      hostName: 'Солнце',
      letter: null,
      gaiaDr3Id: null,
      ticId: null,
      exomastName: null,
      fields: EARTH_FIELDS,
      dedupWarnings: [],
      computed: {
        ...conservative,
        fHzOpt: optimistic.fHz,
        hzdOpt: optimistic.hzd,
        dInOpt: optimistic.dIn,
        dOutOpt: optimistic.dOut,
        hzOptValid: optimistic.hzValid,
        qDataAdaptiveOpt: optimistic.qDataAdaptive,
        availableSubindexesOpt: optimistic.availableSubindexes,
      },
    };
  }, []);

  const score = scorePlanet(entity, {
    mode,
    hzBound: model.hzBound,
    penalizeRocky: model.penalizeRocky,
    penalizeEcc: model.penalizeEcc,
    penalizeStar: model.penalizeStar,
    applyQData: model.applyQData,
  });
  const q = qualityFor(entity, mode, model.hzBound);
  const fHz = model.hzBound === 'optimistic' ? entity.computed.fHzOpt : entity.computed.fHz;

  return (
    <div className="border-t border-accent/15 bg-accent/[0.035] px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-200">
          <Globe2 className="h-3.5 w-3.5" /> Земля (эталон)
        </span>
        <span className="text-[9px] uppercase tracking-wide text-emerald-400/60">вне Топ-50</span>
        <span className="font-mono text-slate-300">
          R = 1.00 R⊕ · M = 1.00 M⊕ · e = 0.0167 · G2V · d = 0 пк
        </span>
        <span className="font-mono text-slate-400">
          F_HZ = <b className="text-slate-200">{formatNumber(fHz, 3)}</b>
        </span>
        <Hint
          content={
            mode === 'classic' || mode === 'strict'
              ? 'Q_data не входит в формулу этого режима, но порог минимального Q_data продолжает фильтровать выдачу.'
              : `Калибровочная строка считается тем же кодом из физических констант. Q_data = ${formatNumber(
                  q,
                  3,
                )}. Индекс режима: ${score === null ? '—' : `${formatNumber(score * 100, 2)}%`}.`
          }
        >
          {mode === 'classic' || mode === 'strict' ? (
            <span className="cursor-help rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500">
              Q: —
            </span>
          ) : (
            <span className={`cursor-help rounded-md border px-1.5 py-0.5 text-[10px] ${qBadgeClass(q)}`}>
              Q: {qBadge(q)}
            </span>
          )}
        </Hint>
        <span className="ml-auto font-mono text-[12px] text-emerald-300">
          {score === null ? '—' : `${formatNumber(score * 100, 2)}%`}
        </span>
      </div>
      <p className="mt-0.5 text-[9px] text-slate-500">
        Эталон нужен для проверки формул: F_HZ ≈ 0.25 (консервативная) — известное свойство
        F_HZ = 1 − HZD², а не ошибка реализации.
      </p>
    </div>
  );
}
