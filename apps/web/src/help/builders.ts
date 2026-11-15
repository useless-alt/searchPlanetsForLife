/**
 * Построители подсказок (задача 17; п. 11.1, 11.7; U39).
 *
 * `buildHelp` соединяет статическую запись словаря с уже рассчитанными
 * значениями планеты: строкой значения и блоком «Откуда значение». Данные
 * берутся из кэша разрешённых планет — запросов к API нет.
 */

import type { ParamValue, ResolvedPlanet } from '@exo/shared';

import { formatMessage, ru, SOURCE_NAME_KEYS } from '../i18n/ru';
import {
  HELP_CONTROL_WHY_LABEL,
  HELP_PHYSICS_LAWS,
  HELP_TEXTS,
  HELP_UNIT_TEXT,
} from '../i18n/help.ru';
import { appStore } from '../state/store';
import { isControlKey, resolveEntry, splitHelpKey } from './registry';
import type { HelpContent, HelpRequestCtx } from './types';
import {
  auToMlnKm,
  eccentricityShape,
  formatNumber,
  hzdValue,
  kelvinToCelsius,
  massKg,
  parsecsToKilometers,
  parsecsToLightYears,
  percentValue,
  periodYears,
  radiusKm,
  solarValue,
} from './units';

/** Ключи `ResolvedPlanet`, которые содержат числовые параметры. */
type ParamKey =
  'R' | 'M' | 'e' | 'd' | 'P' | 'S' | 'T_eq' | 'rho' | 'L' | 'st_teff' | 'st_rad' | 'dist_pc';

/** Соответствие идентификаторов словаря полям `ResolvedPlanet`. */
const PARAM_KEYS: Record<string, ParamKey> = {
  R: 'R',
  M: 'M',
  e: 'e',
  d: 'd',
  d_in: 'd',
  d_out: 'd',
  P: 'P',
  S: 'S',
  T_eq: 'T_eq',
  T_s: 'T_eq',
  rho: 'rho',
  L: 'L',
  L_sun: 'L',
  T_star: 'st_teff',
  R_sun: 'st_rad',
  dist_pc: 'dist_pc',
};

/** Единица словаря → величина, к которой она относится. */
const UNIT_TO_QUANTITY: Record<string, string> = {
  R_earth: 'R',
  M_earth: 'M',
  K: 'T_s',
  pc: 'dist_pc',
  au: 'd',
  R_sun: 'R_sun',
  L_sun: 'L_sun',
  day: 'P',
};

/** Контекст построителя: базовый контекст плюс уже загруженная планета. */
export interface HelpBuildCtx extends HelpRequestCtx {
  /**
   * Разрешённая планета из кэша воркера.
   *
   * Провайдер подставляет её из хранилища. Прямой вызов без поля ищет
   * планету в общем кэше `appStore` (удобно в тестах и императивном API).
   */
  resolved?: ResolvedPlanet | null;
}

/** Числовой параметр планеты вместе с законом для блока происхождения. */
interface ResolvedParam {
  /** Исходное значение с происхождением. */
  param: ParamValue;
  /** Число для строки значения; у T_s — T_eq + 33 K. */
  value: number;
  /** Идентификатор для выбора закона в блоке «Откуда значение». */
  lawId: string;
}

/** Достаёт параметр планеты по идентификатору словаря. */
function resolveParam(id: string, planet: ResolvedPlanet): ResolvedParam | null {
  const key = PARAM_KEYS[id];

  if (key === undefined) return null;

  const param = planet[key];

  if (param.value === null || param.provenance === null) return null;

  // T_s — температура поверхности: T_eq + 33 K (п. 2.3).
  if (id === 'T_s') {
    return { param, value: param.value + 33, lawId: 'T_s' };
  }

  return { param, value: param.value, lawId: id };
}

/** Строка значения: «Значение: {число} {единица} {пояснение}» (п. 11.7). */
function valueLineFor(id: string, value: number): string | null {
  let parts: string;

  switch (id) {
    case 'R':
      parts = `${formatNumber(value)} R⊕ ${radiusKm(value)}`;
      break;
    case 'M':
      parts = `${formatNumber(value)} M⊕ ${massKg(value)}`;
      break;
    case 'T_s':
    case 'T_star':
      parts = `${Math.round(value)} K = ${kelvinToCelsius(value)}`;
      break;
    case 'dist_pc':
      parts = `${formatNumber(value)} пк ${parsecsToLightYears(value)} (${parsecsToKilometers(value)})`;
      break;
    case 'P':
      parts = `${formatNumber(value)} дн ${periodYears(value)}`;
      break;
    case 'd':
    case 'd_in':
    case 'd_out':
      parts = `${formatNumber(value)} а.е. ${auToMlnKm(value)}`;
      break;
    case 'e':
      parts = `${value.toFixed(2)} — ${eccentricityShape(value)}`;
      break;
    case 'Q_data':
    case 'index':
    case 'F_HZ':
      parts = percentValue(value);
      break;
    case 'HZD':
      parts = hzdValue(value);
      break;
    case 'R_sun':
    case 'L_sun':
    case 'L':
      parts = solarValue(value);
      break;
    case 'S':
      parts = `${formatNumber(value)} ${HELP_UNIT_TEXT.earthFlux}`;
      break;
    case 'rho':
      parts = `${formatNumber(value)} ${HELP_UNIT_TEXT.gCm3}`;
      break;
    case 'v_e':
      parts = formatNumber(value);
      break;
    default:
      return null;
  }

  return `${HELP_TEXTS.valuePrefix} ${parts}`;
}

/**
 * Блок «Откуда значение» (п. 4.3, 11.1).
 *
 * `measured` называет источник, `physics` — закон, `model` — Чена — Киппинга,
 * `estimate` — приближённое допущение. Для принятого нулевого
 * эксцентриситета используется отдельная формулировка.
 */
function originText(id: string, param: ParamValue, planet: ResolvedPlanet): string | null {
  let text: string;

  switch (param.provenance) {
    case 'measured': {
      const sourceKey = param.source === null ? null : SOURCE_NAME_KEYS[param.source];
      const sourceName = sourceKey === null ? null : ru[sourceKey];

      text =
        sourceName === null
          ? HELP_TEXTS.measuredNoSource
          : formatMessage(HELP_TEXTS.measured, { source: sourceName });
      break;
    }
    case 'physics': {
      const law = HELP_PHYSICS_LAWS[id];

      text =
        law === undefined ? HELP_TEXTS.physicsNoLaw : formatMessage(HELP_TEXTS.physics, { law });
      break;
    }
    case 'model':
      text = HELP_TEXTS.model;
      break;
    case 'estimate':
      text =
        id === 'e' && planet.flags.e_assumed_zero
          ? HELP_TEXTS.estimateEccentricity
          : HELP_TEXTS.estimate;
      break;
    default:
      return null;
  }

  return param.fromBackup ? `${text}${HELP_TEXTS.backupSuffix}` : text;
}

/**
 * Строит содержимое подсказки по ключу реестра.
 *
 * Возвращает `null`, если ключ неизвестен: подсказка тогда не показывается.
 * Для `val.*` и `unit.*` с `planetId` добавляются строка значения и блок
 * происхождения; без кэша планеты остаётся статический текст словаря.
 */
export function buildHelp(key: string, ctx: HelpBuildCtx = {}): HelpContent | null {
  const entry = resolveEntry(key);

  if (entry === null) return null;

  const parsed = splitHelpKey(key);
  const scope = parsed?.scope ?? '';
  const rawId = parsed?.id ?? key;
  const quantityId = scope === 'unit' ? (UNIT_TO_QUANTITY[rawId] ?? rawId) : rawId;
  const isValueKey = scope === 'val' || scope === 'unit';

  let resolved: ResolvedPlanet | null = null;

  if (ctx.planetId !== undefined) {
    resolved =
      ctx.resolved !== undefined
        ? ctx.resolved
        : (appStore.getState().resolvedCache[ctx.planetId] ?? null);
  }

  const resolvedParam = isValueKey && resolved !== null ? resolveParam(quantityId, resolved) : null;
  const valueLine =
    resolvedParam === null
      ? undefined
      : (valueLineFor(quantityId, resolvedParam.value) ?? undefined);
  const origin =
    resolvedParam === null || resolved === null
      ? null
      : originText(resolvedParam.lawId, resolvedParam.param, resolved);

  let what = entry.what;

  if (what.includes('{list}')) {
    const list =
      ctx.missing === undefined || ctx.missing.length === 0
        ? HELP_TEXTS.missingFallback
        : ctx.missing.join(', ');

    what = formatMessage(what, { list });
  }

  if (ctx.lines !== undefined && ctx.lines.length > 0) {
    what = formatMessage(HELP_TEXTS.labelLines, {
      base: what,
      lines: ctx.lines.join(HELP_TEXTS.lineSeparator),
    });
  }

  let why = entry.why;

  if (ctx.disabledReason !== undefined && ctx.disabledReason !== '') {
    const reason = formatMessage(HELP_TEXTS.disabledReason, { reason: ctx.disabledReason });

    why = why === undefined ? reason : `${why}${HELP_TEXTS.disabledReasonSeparator}${reason}`;
  }

  const blocks: HelpContent['blocks'] = [{ label: 'what', text: what }];

  if (entry.units !== undefined) blocks.push({ label: 'units', text: entry.units });

  if (why !== undefined) blocks.push({ label: 'why', text: why });

  if (origin !== null) blocks.push({ label: 'origin', text: origin });

  return {
    title: entry.title,
    ...(valueLine === undefined ? {} : { valueLine }),
    blocks,
    ...(isControlKey(key) ? { whyLabel: HELP_CONTROL_WHY_LABEL } : {}),
  };
}
