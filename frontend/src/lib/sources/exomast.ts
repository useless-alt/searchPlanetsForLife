/** Exo.MAST: ленивые запросы по требованию (карточка / приближение). */

import { SOURCE_CONFIG } from '@/config';
import type { ExoMastData } from '@/types';
import { fetchWithPolicy } from './transport';

const BASE = SOURCE_CONFIG.exomast.endpoint;

async function getJson(url: string): Promise<unknown> {
  const { response } = await fetchWithPolicy('exomast', { url });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.trimStart().startsWith('<')) throw new Error('non-JSON response');
  return JSON.parse(text);
}

async function getText(url: string): Promise<string> {
  const { response } = await fetchWithPolicy('exomast', { url });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export interface ExoMastIdentifiers {
  canonicalName: string | null;
  planetNames: string[];
  starName: string | null;
  ra: number | null;
  dec: number | null;
}

export async function fetchIdentifiers(name: string): Promise<ExoMastIdentifiers> {
  const data = (await getJson(`${BASE}/exoplanets/identifiers/?name=${encodeURIComponent(name)}`)) as Record<string, unknown>;
  const planetNames = Array.isArray(data.planetNames) ? data.planetNames.map(String) : [];
  return {
    canonicalName: data.canonicalName ? String(data.canonicalName) : null,
    planetNames,
    starName: data.starName ? String(data.starName) : null,
    ra: typeof data.ra === 'number' ? data.ra : null,
    dec: typeof data.dec === 'number' ? data.dec : null,
  };
}

export function parseSpectrum(text: string): { wavelength: number; value: number; error: number | null }[] {
  const rows: { wavelength: number; value: number; error: number | null }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue;
    rows.push({
      wavelength: parts[0],
      value: parts[1],
      error: parts.length > 2 && Number.isFinite(parts[2]) ? parts[2] : null,
    });
  }
  return rows;
}

/** Полный ленивый набор: идентификаторы, свойства, список и первый спектр. */
export async function fetchExoMast(name: string): Promise<ExoMastData> {
  const result: ExoMastData = {
    canonicalName: null,
    fetchedAt: new Date().toISOString(),
    properties: null,
    spectraFiles: [],
    spectra: [],
    error: null,
  };

  try {
    const identifiers = await fetchIdentifiers(name);
    result.canonicalName = identifiers.canonicalName ?? name;
  } catch {
    result.canonicalName = name;
  }

  const canonical = result.canonicalName ?? name;

  try {
    const properties = (await getJson(`${BASE}/exoplanets/${encodeURIComponent(canonical)}/properties/`)) as unknown[];
    const composite = Array.isArray(properties) ? properties.find((p) => {
      const obj = p as Record<string, unknown>;
      return String(obj.catalog_name ?? '').toLowerCase().includes('nasa');
    }) ?? properties[0] : properties;
    result.properties = (composite as Record<string, unknown>) ?? null;
  } catch (err) {
    result.error = (err as Error).message;
  }

  try {
    const filelist = (await getJson(`${BASE}/spectra/${encodeURIComponent(canonical)}/filelist`)) as unknown;
    const files = Array.isArray(filelist)
      ? filelist.map((f) => (typeof f === 'string' ? f : String((f as Record<string, unknown>).filename ?? ''))).filter(Boolean)
      : [];
    result.spectraFiles = files;
    if (files.length > 0) {
      const text = await getText(`${BASE}/spectra/${encodeURIComponent(canonical)}/file/${encodeURIComponent(files[0])}/`);
      result.spectra = parseSpectrum(text).slice(0, 5000);
    }
  } catch {
    result.spectraFiles = [];
  }

  return result;
}
