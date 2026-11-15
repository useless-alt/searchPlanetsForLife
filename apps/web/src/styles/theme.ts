/**
 * Зеркало токенов для TypeScript и Three.js (задача 12a; тема 27a).
 *
 * `tokens` повторяет все пользовательские свойства из `styles/tokens.css`
 * «как есть»: значения читаются из CSS в рантайме, а этот объект нужен там,
 * где CSS недоступен — прежде всего в Three.js (задачи 21–28) и в тестах
 * контраста. Тесты `contrast.test.ts` и `tokens.space.test.ts` сверяют оба
 * файла, поэтому расхождение в них — падение теста.
 *
 * «Магических» цветов вне `tokens.css` и этого файла нет: сцена берёт
 * числовые цвета из `three`, а не из литералов.
 */

/** Плоское зеркало пользовательских свойств CSS: имя → значение. */
export const tokens = {
  // 27a: глубина космоса
  'cosmos-0': '#04060c',
  'cosmos-1': '#0a0f1f',
  'cosmos-2': '#121a33',

  // 27a: стеклянные панели
  'glass-bg': 'rgba(12, 18, 36, 0.72)',
  'glass-bg-solid': '#0f1730',
  'glass-border': 'rgba(150, 180, 255, 0.16)',
  'glass-highlight': 'rgba(190, 210, 255, 0.1)',
  'glass-blur': '14px',
  'glass-shadow': '0 24px 64px rgba(2, 4, 10, 0.55)',

  // поверхности
  'color-canvas': '#04060c',
  'color-surface': '#0f1730',
  'color-surface-sunken': '#121a33',
  'color-surface-inverse': '#070b16',
  'color-overlay': 'rgba(2, 4, 10, 0.66)',

  // текст
  'color-text': '#e8eefc',
  'color-text-muted': '#a9b6d6',
  'color-text-subtle': '#8a98bb',
  'color-text-inverse': '#eef3ff',
  'color-text-disabled': '#6b7899',

  // границы
  'color-border': 'rgba(150, 180, 255, 0.12)',
  'color-border-strong': '#5b6b94',
  'color-border-inverse': 'rgba(232, 238, 252, 0.22)',

  // акцент и фокус
  'color-focus': '#b7a4ff',
  'color-accent': '#9a7cff',
  'color-accent-hover': '#b09aff',
  'color-accent-ink': '#0a0f1f',
  'color-accent-soft': 'rgba(154, 124, 255, 0.16)',
  accent: '#9a7cff',
  'accent-hover': '#b09aff',
  'accent-glow': 'rgba(154, 124, 255, 0.35)',

  // лидеры Топ-50 (п. 6.2)
  'color-leader': '#10b981',
  'color-leader-ink': '#34d399',
  'color-leader-muted': '#5f7d71',
  'leader-glow': 'rgba(16, 185, 129, 0.55)',

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
  'color-positive': '#34d399',
  'color-positive-bg': '#0d2018',
  'color-warning': '#f5c56b',
  'color-warning-bg': '#241b0a',
  'color-negative': '#ff9b93',
  'color-negative-bg': '#2a1013',
  'color-info': '#8ab4f8',
  'color-info-bg': '#0f1c33',

  // 3D (п. 11.3, 11.4)
  'color-space': '#04060c',
  'color-orbit': '#8ea0ad',
  'orbit-line': '#d7e2ea',
  'orbit-halo': '#04060c',
  'hz-fill': '#7796ba',
  'hz-edge': '#9cc3e6',

  // карта Галактики (задача 21; п. 6, 10.8; U44)
  'map-bg': '#04060c',
  'map-star-unknown': '#8b8b8b',
  'map-ring': 'rgba(142, 160, 173, 0.35)',

  // заглушки (задача 27; п. 9.2)
  'stub-planet': '#5a6066',
  'stub-star': '#3f444a',
  'stub-dust': '#9aa3ad',
  'stub-glyph': '#c9d2da',

  // фон-космос (U63; задача 27a)
  'nebula-1': 'rgba(76, 60, 160, 0.2)',
  'nebula-2': 'rgba(32, 82, 150, 0.16)',
  'nebula-3': 'rgba(18, 120, 120, 0.1)',
  'star-color': 'rgba(220, 230, 255, 0.75)',
  'space-noise-opacity': '0.05',

  // типографика (U64: два семейства)
  'font-display': "'Manrope', system-ui, 'Segoe UI', sans-serif",
  'font-text': "'Manrope', system-ui, 'Segoe UI', sans-serif",
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
  'shadow-1': '0 1px 2px rgba(2, 4, 10, 0.6)',
  'shadow-2': '0 12px 32px rgba(2, 4, 10, 0.55), 0 2px 6px rgba(2, 4, 10, 0.4)',
  'shadow-3': '0 28px 72px rgba(2, 4, 10, 0.7)',

  // движение
  'duration-in': '150ms',
  'duration-out': '120ms',
  'duration-press': '90ms',
  'duration-panel': '200ms',
  'duration-slide': '240ms',
  'duration-twinkle': '9s',
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  'ease-enter': 'cubic-bezier(0.22, 1, 0.36, 1)',

  // элементы управления
  'control-height': '44px',
  'control-height-sm': '36px',
  'focus-ring-width': '2px',
  'focus-ring-offset': '2px',

  // слои
  'z-base': '0',
  'z-space': '0',
  'z-content': '1',
  'z-map': '10',
  'z-sticky': '20',
  'z-panel': '30',
  'z-tooltip': '60',
  'z-modal': '80',
  'z-toast': '90',

  // подсказки (задача 17)
  'tooltip-bg': 'var(--color-surface-inverse)',
  'tooltip-color': 'var(--color-text-inverse)',
  'tooltip-muted': '#a9b6d6',
  'tooltip-border': 'var(--color-border-inverse)',
  'tooltip-radius': 'var(--radius-md)',
  'tooltip-padding': 'var(--space-3)',
  'tooltip-max-width': '360px',
  'tooltip-offset': '12px',
  'tooltip-margin': '8px',
  'tooltip-shadow': 'var(--shadow-3)',
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
  space: 0x04060c,
  /** Метки планет Топ-50 — изумрудный (п. 6.2). */
  leader: 0x10b981,
  /** Приглушённый цвет выбывших планет (п. 6.2). */
  leaderMuted: 0x5f7d71,
  /** Базовый цвет орбиты (задача 12a): читается на любом фоне. */
  orbit: 0x8ea0ad,
  /** Ядро линии орбиты (задача 23). */
  orbitLine: 0xd7e2ea,
  /** Тёмный ореол под ядром линии орбиты (задача 23). */
  orbitHalo: 0x04060c,
  /** Прозрачность ореола линии орбиты (задача 23). */
  orbitHaloOpacity: 0.35,
  /** Заливка зоны обитаемости. */
  hzFill: 0x7796ba,
  /** Граница зоны обитаемости. */
  hzEdge: 0x9cc3e6,
  /** Прозрачность заливки зоны обитаемости: не конфликтует с подсветкой лидеров. */
  hzFillOpacity: 0.18,
  /** Фон 3D-карты Галактики. */
  mapBackground: 0x04060c,
  /** Звезда с неизвестной температурой (п. 6.2). */
  mapStarUnknown: 0x8b8b8b,
  /** Кольца масштаба и опорные подписи карты. */
  mapRing: 0x8ea0ad,
  /** Прозрачность тонких колец масштаба. */
  mapRingOpacity: 0.35,
  /** Сфера планеты-заглушки. */
  stubPlanet: 0x5a6066,
  /** Сфера звезды-заглушки. */
  stubStar: 0x3f444a,
  /** Пыль вокруг заглушки. */
  stubDust: 0x9aa3ad,
  /** Знак вопроса и подпись заглушки. */
  stubGlyph: 0xc9d2da,
  /** Нейтральный белый свет сцены (планетный свет и ambient). */
  light: 0xffffff,
  /** Нижний тон полусферического света. */
  lightGround: 0x404040,
  /** Облачная оболочка: холодный белый. */
  cloudColor: 0xf4f8ff,
  /** Атмосфера без данных о составе: голубой ореол. */
  atmosphereFallback: 0x7fc4ff,
  /** Поверхность без палитры класса мира. */
  surfaceFallback: 0xffffff,
} as const;

/** Прозрачность заливки зоны обитаемости (0..1). */
export const HZ_FILL_OPACITY = three.hzFillOpacity;

/** Шестнадцатеричное представление числа Three.js (`0xRRGGBB` → `rrggbb`). */
export function toHexString(value: number): string {
  return value.toString(16).padStart(6, '0');
}
