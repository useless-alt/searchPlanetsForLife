import type { SpectralClass } from '../types/settings';

/**
 * Границы спектральных классов по эффективной температуре звезды (U9).
 *
 *   O ≥ 30000; B ≥ 10000; A ≥ 7500; F ≥ 6000; G ≥ 5200; K ≥ 3900; M < 3900 К.
 *
 * Массив отсортирован по убыванию нижней границы.
 */
export const SPECTRAL_THRESHOLDS: Array<{ cls: SpectralClass; minTeff: number }> = [
  { cls: 'O', minTeff: 30000 },
  { cls: 'B', minTeff: 10000 },
  { cls: 'A', minTeff: 7500 },
  { cls: 'F', minTeff: 6000 },
  { cls: 'G', minTeff: 5200 },
  { cls: 'K', minTeff: 3900 },
  { cls: 'M', minTeff: 0 },
];
