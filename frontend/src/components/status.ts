import { SOURCE_CONFIG } from '@/config';
import type { SourceId, SourceStatus } from '@/types';
import { formatDate } from '@/lib/utils';

export function sourceLabel(source: SourceId): string {
  return SOURCE_CONFIG[source].label;
}

export function statusLabel(status: SourceStatus): string {
  if (status.source === 'exomast' && status.state === 'pending') return 'Ленивая загрузка по карточке';
  switch (status.state) {
    case 'live':
      return 'Обновлено';
    case 'cache':
      return `Резервная копия от ${formatDate(status.fetchedAt)}`;
    case 'snapshot':
      return `Встроенный снимок от ${formatDate(status.fetchedAt)}`;
    case 'error':
      return 'Ошибка: данных нет — источник пропущен';
    case 'skipped':
      return 'Пропущен — нет идентификаторов';
    default:
      return 'Ожидание';
  }
}

export function statusTone(state: SourceStatus['state']): string {
  switch (state) {
    case 'live':
      return 'bg-emerald-400';
    case 'cache':
      return 'bg-amber-400';
    case 'snapshot':
      return 'bg-sky-400';
    case 'error':
      return 'bg-rose-500';
    case 'skipped':
      return 'bg-slate-500';
    default:
      return 'bg-slate-600';
  }
}

export function statusBadgeClass(state: SourceStatus['state']): string {
  switch (state) {
    case 'live':
      return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
    case 'cache':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
    case 'snapshot':
      return 'border-sky-400/30 bg-sky-400/10 text-sky-200';
    case 'error':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
    case 'skipped':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
    default:
      return 'border-white/10 bg-white/5 text-slate-400';
  }
}

export function fallbackStatus(status: SourceStatus): boolean {
  return status.state === 'cache' || status.state === 'snapshot';
}

export function tierLabel(tier: SourceStatus['tier']): string {
  if (tier === 'live') return 'LIVE';
  if (tier === 'cache') return 'IDB';
  if (tier === 'snapshot') return 'СНИМОК';
  return '—';
}
