import { Filter, RotateCcw } from 'lucide-react';
import { CLASS_COLORS, SPECTRAL_CLASS_LIST, type SpectralClass } from '@/config';
import { useAppStore } from '@/store/useAppStore';
import { cn, formatNumber } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Slider } from './ui/slider';

interface RangeControlProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: [number, number] | null;
  onChange: (value: [number, number] | null) => void;
  digits?: number;
}

function RangeControl({ label, unit, min, max, step, value, onChange, digits = 2 }: RangeControlProps) {
  const current = value ?? [min, max];
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="label">{label}</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-slate-300">
            {value ? `${formatNumber(current[0], digits)} — ${formatNumber(current[1], digits)}` : 'любой'}{' '}
            <span className="text-slate-500">{unit}</span>
          </span>
          {value && (
            <button
              type="button"
              className="text-[10px] text-slate-500 underline decoration-dotted hover:text-slate-300"
              onClick={() => onChange(null)}
            >
              сбросить
            </button>
          )}
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={current}
        minStepsBetweenThumbs={1}
        onValueChange={([a, b]) => {
          if (a <= min && b >= max) onChange(null);
          else onChange([a, b]);
        }}
      />
    </div>
  );
}

export function FiltersPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);

  const activeCount =
    (filters.spectral.length > 0 ? 1 : 0) +
    (filters.radius ? 1 : 0) +
    (filters.ts ? 1 : 0) +
    (filters.ecc ? 1 : 0) +
    (filters.includeCandidates ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(600px,94vw)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-accent" /> Фильтры
          </DialogTitle>
          <DialogDescription>
            Топ-50 строится после фильтров. Планеты с null в фильтруемом поле при активном фильтре
            исключаются. Изменения применяются без кнопки «Применить».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="label">Спектральный класс</p>
              {filters.spectral.length > 0 && (
                <button
                  type="button"
                  className="text-[10px] text-slate-500 underline decoration-dotted hover:text-slate-300"
                  onClick={() => setFilters({ spectral: [] })}
                >
                  все классы
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SPECTRAL_CLASS_LIST.map((cls) => {
                const active = filters.spectral.includes(cls);
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() =>
                      setFilters({
                        spectral: active
                          ? filters.spectral.filter((s) => s !== cls)
                          : [...filters.spectral, cls],
                      })
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition',
                      active
                        ? 'border-accent/50 bg-accent/10 text-white'
                        : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20',
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: CLASS_COLORS[cls as SpectralClass] }}
                    />
                    {cls}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Источник: st_spectype, иначе класс по st_teff (M &lt; 3900 K … O ≥ 30 000 K).
            </p>
          </div>

          <RangeControl
            label="Радиус планеты"
            unit="R⊕"
            min={0}
            max={25}
            step={0.1}
            value={filters.radius}
            onChange={(radius) => setFilters({ radius })}
          />
          <RangeControl
            label="Температура поверхности T_s"
            unit="K"
            min={0}
            max={1200}
            step={1}
            value={filters.ts}
            onChange={(ts) => setFilters({ ts })}
            digits={0}
          />
          <RangeControl
            label="Эксцентриситет"
            unit="e"
            min={0}
            max={1}
            step={0.01}
            value={filters.ecc}
            onChange={(ecc) => setFilters({ ecc })}
          />

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
            <span>
              <span className="block text-xs text-slate-200">Показывать кандидатов</span>
              <span className="block text-[10px] text-slate-500">
                Явные Candidate / False Positive из каталогов; по умолчанию скрыты.
              </span>
            </span>
            <span
              className={cn(
                'relative h-5 w-9 rounded-full transition',
                filters.includeCandidates ? 'bg-accent' : 'bg-white/15',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                  filters.includeCandidates ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={filters.includeCandidates}
              onChange={(e) => setFilters({ includeCandidates: e.target.checked })}
            />
          </label>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Активных фильтров: {activeCount}</span>
            <Button variant="outline" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" /> Сбросить фильтры
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
