import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { MODES } from '@/config';
import { useAppStore } from '@/store/useAppStore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { cn } from '@/lib/utils';

function CheckRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] p-2.5 transition hover:border-white/10',
        disabled && 'cursor-not-allowed opacity-45',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-accent bg-accent text-space-950' : 'border-white/20 bg-transparent',
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-xs text-slate-200">{label}</span>
        <span className="block text-[10px] leading-relaxed text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

export function ModelPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const mode = useAppStore((s) => s.mode);
  const model = useAppStore((s) => s.model);
  const setModel = useAppStore((s) => s.setModel);
  const resetModel = useAppStore((s) => s.resetModel);
  const penalized = mode === 'adaptive' || mode === 'rhi';
  const modeInfo = MODES.find((m) => m.id === mode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,94vw)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-accent" /> Параметры модели
          </DialogTitle>
          <DialogDescription>
            Все изменения применяются мгновенно. Штрафы и Q_data участвуют только в «Адаптивном» и
            «RHI»; ползунок минимального Q_data фильтрует выдачу во всех режимах.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="label mb-1.5">Границы зоны обитаемости</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ['conservative', 'Консервативная', 'Runaway / maximum greenhouse'],
                ['optimistic', 'Оптимистичная', 'Recent Venus / early Mars'],
              ].map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModel({ hzBound: id as 'conservative' | 'optimistic' })}
                  className={cn(
                    'rounded-lg border px-2.5 py-2 text-left transition',
                    model.hzBound === id
                      ? 'border-accent/50 bg-accent/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                  )}
                >
                  <span className="block text-xs text-slate-100">{label}</span>
                  <span className="block text-[10px] text-slate-500">{hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Влияет на «Адаптивный», «RHI» и «Строгий научный». В упрощённом ESI не используется.
            </p>
          </div>

          <div className="grid gap-1.5">
            <p className="label">Штрафы и качество данных</p>
            <CheckRow
              checked={model.penalizeRocky}
              onChange={(v) => setModel({ penalizeRocky: v })}
              label="P_rocky — штраф за некаменистость"
              hint="1 / (1 + exp(5 · (R − 1.65)))"
              disabled={!penalized}
            />
            <CheckRow
              checked={model.penalizeEcc}
              onChange={(v) => setModel({ penalizeEcc: v })}
              label="P_ecc — штраф за эксцентриситет"
              hint="1 − e²"
              disabled={!penalized}
            />
            <CheckRow
              checked={model.penalizeStar}
              onChange={(v) => setModel({ penalizeStar: v })}
              label="P_star — активность красного карлика"
              hint="0.85 при T_eff < 3900 K, иначе 1.00"
              disabled={!penalized}
            />
            <CheckRow
              checked={model.applyQData}
              onChange={(v) => setModel({ applyQData: v })}
              label="Q_data — множитель качества данных"
              hint="Выключение подставляет 1, но не влияет на фильтр минимального Q_data"
              disabled={!penalized}
            />
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="flex items-center justify-between">
              <p className="label">Минимальный Q_data</p>
              <span className="font-mono text-xs text-accent-soft">{model.minQData}%</span>
            </div>
            <Slider
              min={75}
              max={100}
              step={1}
              value={[model.minQData]}
              onValueChange={([v]) => setModel({ minQData: v })}
            />
            <p className="text-[10px] text-slate-500">
              Фильтрует планеты с Q_data ниже порога во всех режимах, независимо от чекбокса Q_data.
            </p>
          </div>

          <div className="rounded-lg border border-accent/15 bg-accent/[0.04] p-2.5 text-[11px] leading-relaxed text-slate-400">
            <span className="text-slate-200">{modeInfo?.label}: </span>
            <span className="font-mono text-[10px] text-accent-soft/90">{modeInfo?.formula}</span>
          </div>

          <Button variant="outline" onClick={resetModel}>
            <RotateCcw className="h-3.5 w-3.5" /> Сбросить настройки
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
