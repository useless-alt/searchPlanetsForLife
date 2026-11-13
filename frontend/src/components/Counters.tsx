import { AlertCircle, CircleSlash, MapPinOff, Users } from 'lucide-react';
import type { RankingResult } from '@/lib/calc/scoring';
import type { PipelineResult } from '@/types';
import { formatDate } from '@/lib/utils';

export function Counters({
  result,
  ranking,
}: {
  result: PipelineResult;
  ranking: RankingResult;
}) {
  const counts = result.counts;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.06] bg-space-950/30 px-3 py-1.5 text-[11px] text-slate-400">
      <span>
        Всего в базе: <b className="text-slate-100">{counts.total.toLocaleString('ru-RU')}</b>
      </span>
      <span className="text-white/10">|</span>
      <span>
        Рассчитано: <b className="text-slate-100">{ranking.ranked.length.toLocaleString('ru-RU')}</b>
      </span>
      <span className="text-white/10">|</span>
      <span>
        В строго измеренных:{' '}
        <b className="text-slate-100">{ranking.strict.toLocaleString('ru-RU')}</b>
      </span>
      <span className="text-white/10">|</span>
      <span>
        В Топ-50: <b className="text-slate-100">{ranking.top.length}</b>
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <span className="chip" title="Явные кандидаты / False Positive">
          <Users className="h-3 w-3" /> кандидатов: {counts.candidates}
        </span>
        <span className="chip" title="Поля с расхождением источников">
          <AlertCircle className="h-3 w-3 text-amber-300" /> конфликтов: {counts.conflicts}
        </span>
        <span className="chip" title="Планеты без полных ra/dec/dist">
          <MapPinOff className="h-3 w-3" /> без координат: {counts.noCoords}
        </span>
        <span className="chip" title="k < 3: индекс 0.00, вне Топ-50">
          <CircleSlash className="h-3 w-3" /> мало данных: {counts.insufficient}
        </span>
        <span className="text-[10px] text-slate-500">{formatDate(result.generatedAt)}</span>
      </div>
    </div>
  );
}
