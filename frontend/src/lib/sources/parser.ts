/** Парсеры ответов TAP: JSON-массив, {metadata|columns|fields, data}, CSV-fallback. */

import Papa from 'papaparse';
import { num } from '../calc/num';

export class UnknownFormatError extends Error {
  constructor(message = 'Unknown TAP response format') {
    super(message);
    this.name = 'UnknownFormatError';
  }
}

export class NonJsonResponseError extends Error {
  constructor(public readonly bodyStart: string) {
    super(`Non-JSON response: ${bodyStart}`);
    this.name = 'NonJsonResponseError';
  }
}

export type Row = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findMeta(obj: Record<string, unknown>): { name: string }[] | null {
  for (const key of ['metadata', 'columns', 'fields']) {
    const value = obj[key];
    if (Array.isArray(value)) {
      const names = value
        .map((c) => (isObject(c) ? String(c.name ?? c.column_name ?? '') : ''))
        .filter((n) => n.length > 0);
      if (names.length > 0) return names.map((name) => ({ name }));
    }
  }
  return null;
}

/** Разбирает TAP-ответ в массив объектов. */
export function parseTapResponse(json: unknown): Row[] {
  if (Array.isArray(json)) {
    return json.filter(isObject) as Row[];
  }
  if (isObject(json)) {
    const data = json.data;
    if (Array.isArray(data)) {
      const meta = findMeta(json);
      if (meta) {
        return data.map((row) => {
          if (isObject(row)) return row as Row;
          if (!Array.isArray(row)) return {};
          const out: Row = {};
          meta.forEach((col, i) => {
            out[col.name] = row[i] ?? null;
          });
          return out;
        });
      }
      if (data.every(isObject)) return data as Row[];
    }
  }
  throw new UnknownFormatError();
}

/** Толерантный доступ к полю без учёта регистра. */
export function pick(row: Row, ...names: string[]): unknown {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) map.set(k.toLowerCase(), v);
  for (const name of names) {
    const key = name.toLowerCase();
    if (map.has(key)) return map.get(key);
  }
  return null;
}

export function pickNum(row: Row, ...names: string[]): number | null {
  return num(pick(row, ...names));
}

export function pickStr(row: Row, ...names: string[]): string | null {
  const v = pick(row, ...names);
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** CSV-fallback (papaparse). */
export function parseCsv(text: string): Row[] {
  if (text.trim().length === 0) return [];
  const parsed = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new UnknownFormatError(parsed.errors[0]?.message ?? 'CSV parse error');
  }
  return parsed.data;
}

export function ensureJsonBody(text: string): unknown {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new NonJsonResponseError(text.slice(0, 200));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UnknownFormatError('Response is not valid JSON');
  }
}
