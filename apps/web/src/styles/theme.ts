/**
 * Зеркало токенов для TypeScript и Three.js (задача 12a).
 *
 * `tokens` повторяет все пользовательские свойства из `styles/tokens.css`
 * «как есть»: значения читаются из CSS в рантайме, а этот объект нужен там,
 * где CSS недоступен — прежде всего в Three.js (задачи 21–28) и в тестах
 * контраста. Тест `contrast.test.ts` сверяет оба файла, поэтому расхождение
 * в них — падение теста.
 *
 * «Магических» цветов вне `tokens.css` и этого файла нет.
 */

/** Плоское зеркало пользовательских свойств CSS: имя → значение. */
export const tokens = {
  // поверхности
  'color-canvas': '#f4f6f5',
  'color-surface': '#ffffff',
  'color-surface-sunken': '#eaedec',
  'color-surface-inverse': '#14181c',
  'color-overlay': 'rgba(11, 16, 20, 0.44)',

  // текст
  'color-text': '#12161a',
  'color-text-muted': '#545b62',
  'color-text-subtle': '#656d73',
  'color-text-inverse': '#f5f7f7',
  'color-text-disabled': '#656d73',

  // границы
  'color-border': 'rgba(18, 22, 26, 0.12)',
  'color-border-strong': '#7a8186',
  'color-border-inverse': 'rgba(245, 247, 247, 0.24)',

  // акцент и фокус
  'color-focus': '#047857',
  'color-accent': '#047857',
  'color-accent-hover': '#065f46',
  'color-accent-ink': '#ffffff',
  'color-accent-soft': '#e6f4ee',

  // лидеры Топ-50 (п. 6.2)
  'color-leader': '#10b981',
  'color-leader-ink': '#047857',
  'color-leader-muted': '#5f7d71',

  // происхождение значения (п. 4.3, 11.1; U15)
  'color-provenance-measured': '#17603a',
  'color-provenance-measured-bg': '#e9f5ec',
  'color-provenance-physics': '#1a5fd0',
  'color-provenance-physics-bg': '#e8effc',
  'color-provenance-model': '#7a5100',
  'color-provenance-model-bg': '#fbf0d9',
  'color-provenance-estimate': '#545b62',
  'color-provenance-estimate-bg': '#eef0f1',

  // достоверность Q_data (U8)
  'color-quality-high': '#047857',
  'color-quality-high-bg': '#e6f4ee',
  'color-quality-medium': '#4b5563',
  'color-quality-medium-bg': '#eef1f4',
  'color-quality-low': '#5f686f',
  'color-quality-low-bg': '#f0f1f1',

  // состояния (баннеры)
  'color-positive': '#17603a',
  'color-positive-bg': '#e9f5ec',
  'color-warning': '#8a5100',
  'color-warning-bg': '#fdf3e2',
  'color-negative': '#b3261e',
  'color-negative-bg': '#fdecea',
  'color-info': '#1a5fd0',
  'color-info-bg': '#e8effc',

  // 3D (п. 11.3, 11.4)
  'color-space': '#0b1014',
  'color-orbit': '#8ea0ad',
  'color-hz-fill': 'rgba(125, 148, 173, 0.18)',
  'color-hz-edge': '#7d94ad',

  // типографика
  'font-display': "'Schibsted Grotesk', system-ui, 'Segoe UI', sans-serif",
  'font-text': "'Schibsted Grotesk', system-ui, 'Segoe UI', sans-serif",
  'font-mono': "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",

  'weight-regular': '400',
  'weight-medium': '500',
  'display-weight': '400',
  'display-tracking': '-0.035em',

  'text-h1': 'clamp(28px, 1.6vw + 22px, 36px)',
  'text-h2': '24px',
  'text-h3': '20px',
  'text-lead': '18px',
  'text-body': '16px',
  'text-small': '14px',
  'text-label': '13px',

  'leading-tight': '1.2',
  'leading-body': '1.55',

  // отступы
  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-5': '24px',
  'space-6': '32px',
  'space-7': '48px',
  'space-8': '64px',
  'space-9': '96px',
  'space-10': '128px',

  // радиусы
  'radius-sm': '4px',
  'radius-md': '6px',
  'radius-lg': '8px',
  'radius-pill': '999px',

  // тени
  'shadow-1': '0 1px 2px rgba(18, 22, 26, 0.06)',
  'shadow-2': '0 8px 24px rgba(18, 22, 26, 0.1), 0 2px 6px rgba(18, 22, 26, 0.06)',
  'shadow-3': '0 24px 64px rgba(18, 22, 26, 0.18)',

  // движение
  'duration-in': '150ms',
  'duration-out': '120ms',
  'duration-press': '90ms',
  'duration-panel': '200ms',
  'duration-slide': '240ms',
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  'ease-enter': 'cubic-bezier(0.22, 1, 0.36, 1)',

  // элементы управления
  'control-height': '44px',
  'control-height-sm': '36px',
  'focus-ring-width': '2px',
  'focus-ring-offset': '2px',

  // слои
  'z-base': '0',
  'z-map': '10',
  'z-sticky': '20',
  'z-panel': '30',
  'z-tooltip': '60',
  'z-modal': '80',
  'z-toast': '90',
} as const;

/** Имя пользовательского свойства CSS. */
export type TokenName = keyof typeof tokens;

/** Значение токена по имени. */
export type TokenValue = (typeof tokens)[TokenName];

/**
 * Числовые цвета для Three.js (0xRRGGBB).
 *
 * Значения берутся из тех же токенов: тест контраста сверяет их с `tokens`,
 * поэтому расхождение с CSS невозможно незаметно.
 */
export const three = {
  /** Фон 3D-карты и 3D-сцены. */
  space: 0x0b1014,
  /** Метки планет Топ-50 — изумрудный (п. 6.2). */
  leader: 0x10b981,
  /** Приглушённый цвет выбывших планет (п. 6.2). */
  leaderMuted: 0x5f7d71,
  /** Линия орбиты: читается на любом фоне и не превращается в визуальный шум. */
  orbit: 0x8ea0ad,
  /** Граница зоны обитаемости. */
  hzEdge: 0x7d94ad,
  /** Прозрачность заливки зоны обитаемости: не конфликтует с подсветкой лидеров. */
  hzFillOpacity: 0.18,
} as const;

/** Прозрачность заливки зоны обитаемости (0..1). */
export const HZ_FILL_OPACITY = three.hzFillOpacity;

/** Шестнадцатеричное представление числа Three.js (`0xRRGGBB` → `rrggbb`). */
export function toHexString(value: number): string {
  return value.toString(16).padStart(6, '0');
}
