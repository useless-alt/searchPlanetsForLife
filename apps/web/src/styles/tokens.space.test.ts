import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ru } from '../i18n/ru';
import { tokens, type TokenName } from './theme';

/**
 * Тест космической темы (задача 27a).
 *
 * Проверяет обязательные ограничения постановки, которые важнее вкуса:
 * контраст текста к `--glass-bg-solid`, разнос оттенков акцента от цветов
 * Топ-50, зоны обитаемости и линии орбиты, неизменность цветов
 * происхождения значения и запасной вариант стекла без размытия (U65).
 */

/** Цвет в каналах 0..1. */
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Разбирает `#rgb`, `#rrggbb`, `rgb()` и `rgba()`. */
function parseColor(value: string): Rgba {
  const text = value.trim();
  const reference = /var\(--([\w-]+)\)/.exec(text);

  if (reference?.[1] !== undefined) {
    const name = reference[1] as keyof typeof tokens;
    const resolved = tokens[name];

    if (typeof resolved === 'string' && resolved !== value) return parseColor(resolved);
  }

  if (text.startsWith('#')) {
    const hex = text.slice(1);
    const expand =
      hex.length === 3
        ? hex
            .split('')
            .map((char) => `${char}${char}`)
            .join('')
        : hex;

    return {
      r: parseInt(expand.slice(0, 2), 16) / 255,
      g: parseInt(expand.slice(2, 4), 16) / 255,
      b: parseInt(expand.slice(4, 6), 16) / 255,
      a: 1,
    };
  }

  const match = /rgba?\(([^)]+)\)/.exec(text);

  if (match?.[1] === undefined) throw new Error(`Не разобрать цвет: ${value}`);

  const [r = 0, g = 0, b = 0, a = 1] = match[1].split(',').map((part) => Number(part.trim()));

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

/** Контраст двух цветов. */
function contrastRatio(foreground: string, background: string): number {
  const back = parseColor(background);
  const front = composite(parseColor(foreground), back);
  const first = luminance(front);
  const second = luminance(back);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Оттенок в градусах (HSL, 0..360). */
function hue(value: string): number {
  const { r, g, b } = parseColor(value);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;

  let degrees: number;

  if (max === r) degrees = ((g - b) / delta) % 6;
  else if (max === g) degrees = (b - r) / delta + 2;
  else degrees = (r - g) / delta + 4;

  return (((degrees * 60) % 360) + 360) % 360;
}

/** Кратчайшая разница двух оттенков. */
function hueDistance(first: string, second: string): number {
  const difference = Math.abs(hue(first) - hue(second));

  return Math.min(difference, 360 - difference);
}

/** Пара «текст на стекле» и порог. */
const GLASS_PAIRS: Array<{ name: string; token: TokenName; min: number }> = [
  { name: 'основной текст', token: 'color-text', min: 4.5 },
  { name: 'приглушённый текст', token: 'color-text-muted', min: 4.5 },
  { name: 'второстепенный текст', token: 'color-text-subtle', min: 4.5 },
  { name: 'ссылка и акцент', token: 'color-accent', min: 4.5 },
  { name: 'текст лидера Топ-50', token: 'color-leader-ink', min: 4.5 },
  { name: 'фокус', token: 'color-focus', min: 3 },
  { name: 'сильная граница', token: 'color-border-strong', min: 3 },
  { name: 'недоступный текст', token: 'color-text-disabled', min: 3 },
];

/** Путь к файлу в `apps/web` (тесты запускаются из корня и из пакета). */
function webFile(relative: string): string {
  const candidates = [
    path.resolve(process.cwd(), relative),
    path.resolve(process.cwd(), 'apps/web', relative),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(`Файл не найден: ${relative}`);
}

describe('космическая тема: контраст на стекле', () => {
  it.each(GLASS_PAIRS)('$name: не ниже $min:1 к --glass-bg-solid', ({ token, min }) => {
    expect(contrastRatio(tokens[token], tokens['glass-bg-solid'])).toBeGreaterThanOrEqual(min);
  });

  it('основной текст читается на самом глубоком фоне', () => {
    expect(contrastRatio(tokens['color-text'], tokens['cosmos-0'])).toBeGreaterThanOrEqual(4.5);
  });

  it('подписи на тёмной подсказке остаются читаемыми', () => {
    expect(
      contrastRatio(tokens['color-text-inverse'], tokens['color-surface-inverse']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokens['tooltip-muted'], tokens['color-surface-inverse']),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('состояния источников читаются на своих подложках и на стекле', () => {
    const states: Array<[TokenName, TokenName]> = [
      ['color-positive', 'color-positive-bg'],
      ['color-warning', 'color-warning-bg'],
      ['color-negative', 'color-negative-bg'],
      ['color-info', 'color-info-bg'],
    ];

    for (const [foreground, background] of states) {
      expect(
        contrastRatio(tokens[foreground], tokens[background]),
        foreground,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(tokens[foreground], tokens['glass-bg-solid']),
        foreground,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('космическая тема: оттенки', () => {
  it('акцент отличается от лидера, зоны обитаемости и линии орбиты не меньше чем на 40°', () => {
    expect(hueDistance(tokens['color-accent'], tokens['color-leader'])).toBeGreaterThanOrEqual(40);
    expect(hueDistance(tokens['color-accent'], tokens['hz-fill'])).toBeGreaterThanOrEqual(40);
    expect(hueDistance(tokens['color-accent'], tokens['orbit-line'])).toBeGreaterThanOrEqual(40);
  });

  it('акцент не совпадает с изумрудным и остаётся сине-фиолетовым', () => {
    const accentHue = hue(tokens['color-accent']);

    expect(accentHue).toBeGreaterThan(240);
    expect(accentHue).toBeLessThan(270);
  });
});

describe('космическая тема: цвета происхождения не изменены', () => {
  it('четыре цвета и их подложки совпадают с задачей 12a', () => {
    expect(tokens['color-provenance-measured']).toBe('#17603a');
    expect(tokens['color-provenance-physics']).toBe('#1a5fd0');
    expect(tokens['color-provenance-model']).toBe('#7a5100');
    expect(tokens['color-provenance-estimate']).toBe('#545b62');
    expect(tokens['color-provenance-measured-bg']).toBe('#e9f5ec');
    expect(tokens['color-provenance-physics-bg']).toBe('#e8effc');
    expect(tokens['color-provenance-model-bg']).toBe('#fbf0d9');
    expect(tokens['color-provenance-estimate-bg']).toBe('#eef0f1');
  });

  it('текстовые метки происхождения не изменены (п. 4.3, 11.1)', () => {
    expect(ru['provenance.measured']).toBe('Измерено');
    expect(ru['provenance.physics']).toBe('Физика');
    expect(ru['provenance.model']).toBe('Модель');
    expect(ru['provenance.estimate']).toBe('Оценка');
  });

  it('контраст четырёх пар остаётся не ниже 4.5:1', () => {
    const pairs: Array<[TokenName, TokenName]> = [
      ['color-provenance-measured', 'color-provenance-measured-bg'],
      ['color-provenance-physics', 'color-provenance-physics-bg'],
      ['color-provenance-model', 'color-provenance-model-bg'],
      ['color-provenance-estimate', 'color-provenance-estimate-bg'],
    ];

    for (const [foreground, background] of pairs) {
      expect(
        contrastRatio(tokens[foreground], tokens[background]),
        foreground,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('космическая тема: стекло и фон', () => {
  it('размытие не превышает 14px, фон и границы заданы отдельными токенами', () => {
    expect(tokens['glass-blur']).toBe('14px');
    expect(parseColor(tokens['glass-bg']).a).toBeGreaterThan(0);
    expect(parseColor(tokens['glass-border']).a).toBeGreaterThan(0);
    expect(tokens['glass-bg-solid']).toBe('#0f1730');
  });

  it('глубокий фон — три уровня из постановки', () => {
    expect(tokens['cosmos-0']).toBe('#04060c');
    expect(tokens['cosmos-1']).toBe('#0a0f1f');
    expect(tokens['cosmos-2']).toBe('#121a33');
  });

  it('при prefers-reduced-transparency и качестве low стекло теряет размытие', () => {
    const css = readFileSync(webFile('src/styles/global.css'), 'utf8');

    const reduced = /@media \(prefers-reduced-transparency: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(reduced?.[1]).toBeDefined();
    expect(reduced?.[1]).toContain('.ui-glass');
    expect(reduced?.[1]).toContain('backdrop-filter: none');

    const lowQuality = /html\[data-quality='low'\] \.ui-glass\s*\{([^}]*)\}/.exec(css);
    expect(lowQuality?.[1]).toContain('backdrop-filter: none');
    expect(lowQuality?.[1]).toContain('--glass-bg-solid');
  });

  it('фон-космос лежит под содержимым и не перехватывает указатель (U63)', () => {
    const css = readFileSync(webFile('src/styles/space.css'), 'utf8');

    expect(css).toContain('pointer-events: none');
    expect(css).toContain('z-index: var(--z-space)');
    expect(css).toContain('data:image/svg+xml');
    expect(css).toContain('box-shadow');
    expect(css.length).toBeLessThan(16000);
  });
});
