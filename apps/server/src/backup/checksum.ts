/**
 * Контрольная сумма резервной копии (п. 8.1).
 *
 * checksum = SHA-256 (hex) от JSON-строки payload. Та же строка используется
 * при записи и при проверке целостности при чтении.
 */

import { createHash } from 'node:crypto';

/**
 * Считает SHA-256 (hex) от `JSON.stringify(payload)`.
 *
 * Значение `undefined` (payload не сериализуется) трактуется как пустая строка —
 * такой payload отсеивается проверкой `invalid_json` ещё до записи.
 */
export function computeChecksum(payload: unknown): string {
  const serialized = JSON.stringify(payload);
  return createHash('sha256')
    .update(serialized ?? '', 'utf8')
    .digest('hex');
}
