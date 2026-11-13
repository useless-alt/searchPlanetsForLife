import { Database, Loader2, Orbit, Satellite, Telescope } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from './ui/button';

const STEPS = [
  { label: 'NASA Exoplanet Archive', detail: 'pscomppars · SCHEMA GUARD', icon: Telescope },
  { label: 'Exo-MerCat и Exoplanet.eu', detail: 'кросс-имена и кандидаты', icon: Database },
  { label: 'Gaia DR3 и SIMBAD', detail: 'параметры звёзд по идентификаторам', icon: Satellite },
  { label: 'Слияние, дедупликация, решатель', detail: 'Уровни А / Б / В', icon: Orbit },
];

export function StartupProgress() {
  const progress = useAppStore((s) => s.progress);
  const error = useAppStore((s) => s.error);
  const done = useAppStore((s) => s.done);
  const refresh = useAppStore((s) => s.refresh);
  const result = useAppStore((s) => s.result);

  if (result) return null;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-space-900/60 p-6 shadow-2xl backdrop-blur">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/[0.08] shadow-glow">
            <Orbit className="h-6 w-6 animate-spin-slow text-accent-soft" />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Загружаю научные каталоги</h2>
            <p className="text-[11px] text-slate-500">
              Данные приходят из API при каждом заходе. Уровень каждого источника виден в статусах.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>{progress.phase}</span>
            <span>{progress.completed}/6 · Exo.MAST лениво</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-500"
              style={{ width: `${Math.max(3, (progress.completed / 6) * 100)}%` }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const active = progress.completed >= index;
            return (
              <div
                key={step.label}
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition ${
                  active
                    ? 'border-accent/25 bg-accent/[0.05]'
                    : 'border-white/[0.05] bg-white/[0.015]'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-accent-soft' : 'text-slate-600'}`} />
                <div className="min-w-0">
                  <p className={`text-[11px] ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                    {step.label}
                  </p>
                  <p className="text-[9px] text-slate-600">{step.detail}</p>
                </div>
                {!done && active && <Loader2 className="ml-auto h-3 w-3 animate-spin text-accent" />}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="text-[11px] text-rose-200">{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={refresh}>
              Повторить загрузку
            </Button>
          </div>
        )}

        <p className="mt-4 text-[10px] leading-relaxed text-slate-600">
          Если сеть недоступна, приложение использует IndexedDB или встроенный снимок. Приложение не
          подставляет выдуманные значения: отсутствующие данные остаются null, а расчёт показывает
          происхождение каждого числа.
        </p>
      </div>
    </div>
  );
}
