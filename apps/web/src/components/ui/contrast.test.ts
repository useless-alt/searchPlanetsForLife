import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { three, tokens } from '../../styles/theme';
import type { TokenName } from '../../styles/theme';

/**
 * Тест контраста токенов (задача 12a).
 *
 * Все пары «текст / фон» из `styles/tokens.css` проверяются по формуле
 * WCAG 2.1: 4.5:1 для основного текста и 3:1 для крупного текста, границ,
 * фокуса и графических элементов. Заодно сверяются `tokens.css` и
 * `theme.ts`: расхождение между ними — падение теста.
 */

/** Цвет в формате RGBA (значения каналов 0..1). */
interface Rgba {
  /** Красный канал. */
  r: number;
  /** Зелёный канал. */
  g: number;
  /** Синий канал. */
  b: number;
  /** Прозрачность. */
  a: number;
}

/** Разбирает `#rgb`, `#rrggbb`, `rgb(...)` и `rgba(...)`. */
function parseColor(value: string): Rgba {
  const text = value.trim();

  if (text.startsWith('#')) {
    const hex = text.slice(1);

    if (hex.length === 3) {
      const parts = hex.split('');

      return {
        r: parseInt(`${parts[0] ?? '0'}${parts[0] ?? '0'}`, 16) / 255,
        g: parseInt(`${parts[1] ?? '0'}${parts[1] ?? '0'}`, 16) / 255,
        b: parseInt(`${parts[2] ?? '0'}${parts[2] ?? '0'}`, 16) / 255,
        a: 1,
      };
    }

    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: 1,
    };
  }

  const match = /rgba?\(([^)]+)\)/.exec(text);

  if (match?.[1] === undefined) {
    throw new Error(`Не удалось разобрать цвет: ${value}`);
  }

  const parts = match[1].split(',').map((part) => Number(part.trim()));
  const [r = 0, g = 0, b = 0, a = 1] = parts;

  return { r: r / 255, g: g / 255, b: b / 255, a };
}

/** Накладывает полупрозрачный цвет на подложку. */
function composite(foreground: Rgba, background: Rgba): Rgba {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

/** Относительная яркость по WCAG 2.1. */
function luminance(color: Rgba): number {
  const channel = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** Контраст двух цветов (полупрозрачный цвет накладывается на фон). */
export function contrastRatio(foreground: string, background: string): number {
  const back = parseColor(background);
  const front = composite(parseColor(foreground), back);
  const first = luminance(front);
  const second = luminance(back);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Пара токенов и минимальный контраст, который она обязана держать. */
interface ContrastPair {
  /** Что проверяем. */
  name: string;
  /** Токен переднего плана. */
  foreground: TokenName;
  /** Токен фона. */
  background: TokenName;
  /** Минимальный контраст. */
  min: number;
}

const PAIRS: ContrastPair[] = [
  // Основной текст.
  { name: 'текст на холсте', foreground: 'color-text', background: 'color-canvas', min: 4.5 },
  { name: 'текст на поверхности', foreground: 'color-text', background: 'color-surface', min: 4.5 },
  {
    name: 'приглушённый текст на холсте',
    foreground: 'color-text-muted',
    background: 'color-canvas',
    min: 4.5,
  },
  {
    name: 'приглушённый текст на поверхности',
    foreground: 'color-text-muted',
    background: 'color-surface',
    min: 4.5,
  },
  {
    name: 'второстепенный текст на холсте',
    foreground: 'color-text-subtle',
    background: 'color-canvas',
    min: 4.5,
  },
  {
    name: 'второстепенный текст на поверхности',
    foreground: 'color-text-subtle',
    background: 'color-surface',
    min: 4.5,
  },
  {
    name: 'текст на утопленной поверхности',
    foreground: 'color-text',
    background: 'color-surface-sunken',
    min: 4.5,
  },
  {
    name: 'обратный текст на тёмной поверхности',
    foreground: 'color-text-inverse',
    background: 'color-surface-inverse',
    min: 4.5,
  },

  // Акцент, ссылки, кнопки.
  {
    name: 'ссылка на поверхности',
    foreground: 'color-accent',
    background: 'color-surface',
    min: 4.5,
  },
  { name: 'ссылка на холсте', foreground: 'color-accent', background: 'color-canvas', min: 4.5 },
  {
    name: 'подпись на заливке акцента',
    foreground: 'color-accent-ink',
    background: 'color-accent',
    min: 4.5,
  },

  // Границы, фокус и прочие нетекстовые элементы.
  { name: 'фокус на холсте', foreground: 'color-focus', background: 'color-canvas', min: 3 },
  { name: 'фокус на поверхности', foreground: 'color-focus', background: 'color-surface', min: 3 },
  {
    name: 'сильная граница на поверхности',
    foreground: 'color-border-strong',
    background: 'color-surface',
    min: 3,
  },
  {
    name: 'недоступный текст на поверхности',
    foreground: 'color-text-disabled',
    background: 'color-surface',
    min: 3,
  },

  // Происхождение значения (п. 4.3, 11.1; U15).
  {
    name: '«Измерено»',
    foreground: 'color-provenance-measured',
    background: 'color-provenance-measured-bg',
    min: 4.5,
  },
  {
    name: '«Физика»',
    foreground: 'color-provenance-physics',
    background: 'color-provenance-physics-bg',
    min: 4.5,
  },
  {
    name: '«Модель»',
    foreground: 'color-provenance-model',
    background: 'color-provenance-model-bg',
    min: 4.5,
  },
  {
    name: '«Оценка»',
    foreground: 'color-provenance-estimate',
    background: 'color-provenance-estimate-bg',
    min: 4.5,
  },

  // Достоверность Q_data (U8).
  {
    name: 'Q_data «Высокая»',
    foreground: 'color-quality-high',
    background: 'color-quality-high-bg',
    min: 4.5,
  },
  {
    name: 'Q_data «Средняя»',
    foreground: 'color-quality-medium',
    background: 'color-quality-medium-bg',
    min: 4.5,
  },
  {
    name: 'Q_data «Оценочная»',
    foreground: 'color-quality-low',
    background: 'color-quality-low-bg',
    min: 4.5,
  },

  // Состояния (баннеры).
  { name: 'успех', foreground: 'color-positive', background: 'color-positive-bg', min: 4.5 },
  { name: 'предупреждение', foreground: 'color-warning', background: 'color-warning-bg', min: 4.5 },
  { name: 'ошибка', foreground: 'color-negative', background: 'color-negative-bg', min: 4.5 },
  { name: 'информация', foreground: 'color-info', background: 'color-info-bg', min: 4.5 },

  // 3D (п. 11.3, 11.4): изумрудный Топ-50 и приглушённый цвет выбывших.
  {
    name: 'лидер Топ-50 на фоне космоса',
    foreground: 'color-leader',
    background: 'color-space',
    min: 3,
  },
  {
    name: 'выбывшая планета на фоне космоса',
    foreground: 'color-leader-muted',
    background: 'color-space',
    min: 3,
  },
  {
    name: 'линия орбиты на фоне космоса',
    foreground: 'color-orbit',
    background: 'color-space',
    min: 3,
  },
  {
    name: 'граница зоны обитаемости на фоне космоса',
    foreground: 'color-hz-edge',
    background: 'color-space',
    min: 3,
  },
];

describe('контраст токенов', () => {
  it.each(PAIRS)('$name: не ниже $min:1', ({ foreground, background, min }) => {
    const ratio = contrastRatio(tokens[foreground], tokens[background]);

    expect(ratio).toBeGreaterThanOrEqual(min);
  });

  it('изумрудный акцент не читается как текст на светлом фоне и заменён тёмным', () => {
    // #10b981 — цвет меток Топ-50 в 3D (п. 6.2); на светлом фоне он не годится
    // для текста, поэтому для надписей взят тёмный оттенок того же тона.
    expect(contrastRatio(tokens['color-leader'], tokens['color-surface'])).toBeLessThan(4.5);
    expect(
      contrastRatio(tokens['color-leader-ink'], tokens['color-surface']),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('зеркало токенов', () => {
  /** Путь к `tokens.css`: ищем от рабочего каталога вверх по дереву. */
  function findTokensFile(): string {
    const candidates = [
      path.resolve(process.cwd(), 'src/styles/tokens.css'),
      path.resolve(process.cwd(), 'apps/web/src/styles/tokens.css'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }

    throw new Error(`Файл токенов не найден: ${candidates.join(', ')}`);
  }

  const css = readFileSync(findTokensFile(), 'utf8');

  const cssTokens = new Map<string, string>();

  for (const line of css.split('\n')) {
    const match = /^\s*(--[a-z0-9-]+):\s*(.+?);\s*(?:\/\*.*?\*\/)?\s*$/.exec(line);

    if (match?.[1] !== undefined && match[2] !== undefined) {
      cssTokens.set(match[1].slice(2), match[2]);
    }
  }

  it('tokens.css и theme.ts содержат одинаковый набор токенов', () => {
    expect(cssTokens.size).toBe(Object.keys(tokens).length);

    for (const [name, value] of cssTokens) {
      expect(tokens[name as keyof typeof tokens], `токен ${name}`).toBe(value);
    }
  });

  it('цвета Three.js совпадают с токенами', () => {
    const toNumber = (name: keyof typeof tokens): number =>
      Number.parseInt(tokens[name].replace('#', ''), 16);

    expect(three.space).toBe(toNumber('color-space'));
    expect(three.leader).toBe(toNumber('color-leader'));
    expect(three.leaderMuted).toBe(toNumber('color-leader-muted'));
    expect(three.orbit).toBe(toNumber('color-orbit'));
    expect(three.hzEdge).toBe(toNumber('color-hz-edge'));
  });
});
