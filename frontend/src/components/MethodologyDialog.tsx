import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { cn } from '@/lib/utils';

const TABS = [
  ['formulas', 'Формулы'],
  ['sources', 'Источники'],
  ['limits', 'Ограничения'],
  ['decisions', 'Принятые решения'],
] as const;

type TabId = (typeof TABS)[number][0];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <h3 className="mb-1.5 text-xs font-semibold text-slate-100">{title}</h3>
      <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <code className="block overflow-x-auto rounded-md border border-white/[0.06] bg-space-950/60 px-2 py-1 font-mono text-[10px] text-accent-soft/90">
      {children}
    </code>
  );
}

export function MethodologyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<TabId>('formulas');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(920px,95vw)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" /> Методика и ограничения
          </DialogTitle>
          <DialogDescription>
            Научная прозрачность: каждое число в карточке имеет происхождение «Измерено»,
            «Физика» или «Модель», а уровень данных источника виден в панели статусов.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-white/[0.07] bg-space-950/50 p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] transition',
                tab === id
                  ? 'bg-accent/15 text-accent-soft'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'formulas' && (
          <div className="grid gap-2 md:grid-cols-2">
            <Section title="ESI (Earth Similarity Index)">
              <Formula>ESI_i = (1 − |x − x0| / (x + x0)) ^ w</Formula>
              <p>R: (1.0; 0.57) · ρ: (5.51; 1.07) · v_e: (1.0; 0.70) · S: (1.0; 1.07) · T_s: (288; 5.58).</p>
              <Formula>ESI_interior = (ESI_R · ESI_ρ · ESI_v)^(1/3)</Formula>
              <Formula>ESI4 = (ESI_R · ESI_ρ · ESI_v · ESI_T)^(1/4)</Formula>
            </Section>
            <Section title="Зона обитаемости (Коппарапу)">
              <Formula>S_eff = S_sun + a·T* + b·T*² + c·T*³ + d·T*⁴, T* = T − 5780</Formula>
              <Formula>d_in = √(L / S_eff,in), d_out = √(L / S_eff,out)</Formula>
              <Formula>d_eff = a · (1 − e²)^0.25</Formula>
              <Formula>HZD = (2·d_eff − d_out − d_in) / (d_out − d_in)</Formula>
              <Formula>F_HZ = max(0, 1 − HZD²)</Formula>
              <p>
                Консервативная пара: runaway / maximum greenhouse. Оптимистичная: recent Venus /
                early Mars. При T_eff вне [2600, 7200] K полином считается на ближайшей границе и
                включается бейдж «ЗО: экстраполяция»; вне [2300, 7600] K F_HZ = null.
              </p>
            </Section>
            <Section title="Решатель пропусков">
              <p>
                <b className="text-slate-300">Уровень А (физика):</b> L = R*²·(T_eff/5772)⁴; третий
                закон Кеплера; e = 0 с флагом eAssumed; S = L/(a²·√(1−e²)); T_eq = 255·S^0.25; T_s =
                T_eq + 33; ρ = 5.51·M/R³; v_e = √(M/R).
              </p>
              <p>
                <b className="text-slate-300">Уровень Б (модель, Чен—Киппинг 2017):</b> R→M по
                степенным законам; M→R. Штраф Q_data −0.10.
              </p>
              <p>
                <b className="text-slate-300">Уровень В:</b> n = 4 субиндекса; исключение
                невычислимых, корень степени 1/k при k ≥ 3. Иначе индекс 0.00 и
                insufficient_data.
              </p>
            </Section>
            <Section title="Штрафы и Q_data">
              <Formula>P_rocky = 1/(1 + exp(5·(R − 1.65)))</Formula>
              <Formula>P_ecc = 1 − e², P_star = 0.85 при T_eff &lt; 3900 K</Formula>
              <p>
                Q_data: 1.00; −0.10 за уровень Б; −0.05 за eAssumed (кроме P &lt; 10 сут); −0.05 за
                каждый исключённый субиндекс в «Адаптивном»; floor 0.75. Бейджи: ≥ 0.95 высокая,
                0.85–0.95 средняя, &lt; 0.85 оценочная.
              </p>
            </Section>
            <Section title="Режимы">
              <p><b className="text-slate-300">Адаптивный:</b> geomean(ESI_R, ESI_ρ, ESI_v, F_HZ), k ≥ 3, · штрафы · Q_data.</p>
              <p><b className="text-slate-300">RHI:</b> √(ESI_interior · F_HZ) · штрафы · Q_data; только при всех 4 субиндексах.</p>
              <p><b className="text-slate-300">Упрощённый ESI (R, S):</b> √(ESI_S · ESI_R), без штрафов. Это не PHL-ESI.</p>
              <p><b className="text-slate-300">Строгий научный:</b> √(ESI4 · F_HZ), только измеренные R, истинная M, e, a или P, T_eff, M*, L или R*.</p>
            </Section>
            <Section title="Калибровка «Земля (эталон)»">
              <p>
                Считается тем же кодом из физических констант: R = 1, M = 1, e = 0.0167, a = 1 а.е.,
                P = 365.25 сут, T_eff = 5772 K, L = 1 L☉, M* = 1 M☉.
              </p>
              <p>
                Формула F_HZ = 1 − HZD² даёт Земле F_HZ ≈ 0.25 (консервативная) и ≈ 0.74
                (оптимистичная). Это известное свойство формулы, а не ошибка: формулы не
                «подгоняются».
              </p>
            </Section>
          </div>
        )}

        {tab === 'sources' && (
          <div className="grid gap-2 md:grid-cols-2">
            <Section title="NASA Exoplanet Archive">
              <p>Таблица pscomppars, одна строка = одна планета. Композит из публикаций; параметры внутри строки не гарантированно согласованы.</p>
              <p>st_lum — log10(L/L☉), переводится в L = 10^st_lum. pl_bmassprov с «sin» помечает M·sin(i).</p>
            </Section>
            <Section title="Exo-MerCat (INAF)">
              <p>Объединённый каталог и кросс-имена nasa_name / eu_name / exomercat_name. Служит основой явных связей S0 при дедупликации.</p>
              <p>HTTP-эндпоинт на HTTPS-странице проходит только через Edge-прокси.</p>
            </Section>
            <Section title="Exoplanet.eu (LESIA)">
              <p>Таблица exoplanet.epn_core, формат DaCHS; парсер толерантен к columns/data и CSV-fallback.</p>
              <p>Алиасы alt_target_name делятся по запятой, точке с запятой и вертикальной черте.</p>
            </Section>
            <Section title="Gaia DR3 (ESA)">
              <p>Параметры звёзд по source_id из NASA, порции ≤ 400, параллелизм ≤ 2. При ошибке JOIN — два отдельных запроса.</p>
              <p>Расстояние из параллакса используется только как fallback и только при parallax_over_error ≥ 5.</p>
            </Section>
            <Section title="SIMBAD (CDS)">
              <p>Кросс-идентификация, sp_type и параллакс. Точные строки «Gaia DR3 N» / «TIC N», порции ≤ 300.</p>
              <p>Основное зеркало Harvard, запасные Strasbourg; при отказе — следующее зеркало.</p>
            </Section>
            <Section title="Exo.MAST (STScI)">
              <p>Только лениво, при открытии карточки: identifiers → properties → spectra/filelist → первый спектр. При старте не запрашивается.</p>
              <p>Отсутствие спектров — нормальный случай; UI показывает «спектров нет».</p>
            </Section>
            <Section title="SCHEMA GUARD">
              <p>Перед TAP-запросом читается TAP_SCHEMA.columns. В SELECT попадает только пересечение желаемых и существующих колонок. Схема кэшируется в IndexedDB на 24 ч, отсутствующие колонки выводятся в диагностику.</p>
            </Section>
            <Section title="Транспорт и уровни данных">
              <p>LIVE → IDB (последний успешный ответ) → встроенный снимок public/data/snapshots → источник пропущен. Таймауты: NASA 60 с, Gaia 90 с, остальные 45 с; ретраи 429/502/503/504 с Retry-After и бэкоффом.</p>
              <p>Резервы: последние 5 версий на источник, проверка «не меньше 50% предыдущего объёма», sha256, экспорт и ручной откат.</p>
            </Section>
          </div>
        )}

        {tab === 'limits' && (
          <div className="grid gap-2 md:grid-cols-2">
            <Section title="Композитность pscomppars">
              <p>Одна строка NASA может смешивать измерения разных публикаций и эпох. Консенсус-проверка снижает риск, но не устраняет его; альтернативы доступны в карточке.</p>
            </Section>
            <Section title="M·sin(i)">
              <p>Масса с pl_bmassprov, содержащим «sin», является нижней границей. Она помечается бейджем «M·sin(i)» и не допускает планету в «Строгий научный».</p>
            </Section>
            <Section title="F_HZ и границы ЗО">
              <p>F_HZ нормирован так, что равен 1 в центре ЗО и 0 на границах; у Земли он ≈ 0.25 в консервативной модели. Это свойство формулы 1 − HZD², а не ошибка.</p>
            </Section>
            <Section title="Экстраполяция ЗО">
              <p>Для T_eff вне [2600, 7200] K полином Коппарапу считается на границе диапазона и помечается бейджем. Вне [2300, 7600] K F_HZ не вычисляется.</p>
            </Section>
            <Section title="Адаптивный ≠ RHI">
              <p>«Адаптивный» использует геометрическое среднее доступных субиндексов при k ≥ 3 и может отличаться от RHI, который требует все четыре. Это осознанное решение.</p>
            </Section>
            <Section title="Расхождения и пропуски">
              <p>null никогда не превращается в 0. Если источники расходятся больше допуска, поле получает conflict = true; при двух кандидатах остаётся приоритетный, при трёх — ближайший к медиане. Значение без источника не подставляется.</p>
            </Section>
            <Section title="Данные и деплой">
              <p>Приложение не хранит собственных каталогов: данные приходят из API при каждом заходе. Снимки public/data/snapshots — только аварийный слой, создаваемый человеком перед демо.</p>
            </Section>
            <Section title="Что не проверено вживую">
              <p>Полный LIVE-прогон всех шести API зависит от сети и лимитов обсерваторий. Тесты транспорта, парсеров, схем и резервов используют мок-fetch; см. README.</p>
            </Section>
          </div>
        )}

        {tab === 'decisions' && (
          <div className="grid gap-2 md:grid-cols-2">
            <Section title="Разрешение противоречий в промпте">
              <p>Формула RHI даёт Земле ≈ 0.502 при заявленном диапазоне [0.46, 0.50]. Формула оставлена без изменений; тест допускает 0.502, расхождение описано в README.</p>
            </Section>
            <Section title="Vite вместо Next.js">
              <p>Выбран Vite + React 18: это соответствует требованию Edge-функции frontend/api/proxy.ts и даёт статический билд на Vercel.</p>
            </Section>
            <Section title="Dev-прокси">
              <p>В dev-режиме тот же обработчик прокси поднят плагином Vite, поэтому npm run dev работает без vercel dev. Для HTTP-источников на HTTPS-странице прокси обязателен.</p>
            </Section>
            <Section title="Границы ЗО и Q_data">
              <p>Оба варианта ЗО считаются в Worker при слиянии, чтобы переключение было мгновенным. Q_data считается для обоих вариантов.</p>
            </Section>
            <Section title="Кандидаты">
              <p>Все записи загружаются и учитываются в «Всего в базе». В рейтинге по умолчанию скрыты только явные Candidate / False Positive; переключатель возвращает их.</p>
            </Section>
            <Section title="Визуализация">
              <p>3D-карта использует радиальное сжатие r' = K·log10(1+r) с сохранением направления. Сцена системы — процедурные шейдеры, без текстур и внешних моделей; при недостатке данных показывается серая сфера и облако пыли.</p>
            </Section>
            <Section title="Данные-артефакты">
              <p>Каталоги и снимки не коммитятся в git. Скрипт scripts/make-snapshots.mjs запускает человек перед демо; резервы IDB создаются самим приложением.</p>
            </Section>
            <Section title="Ограничение окружения">
              <p>Приложение — SPA без SSR и собственного бэкенда, кроме api/proxy.ts. Асинхронные TAP-задачи не поддерживаются: при переполнении sync-запроса причина попадает в диагностику.</p>
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
