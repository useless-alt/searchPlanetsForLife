import { describe, expect, it } from 'vitest';

import { SHARED_PACKAGE_READY } from './index';

describe('@exo/shared', () => {
  it('пакет готов к использованию', () => {
    expect(SHARED_PACKAGE_READY).toBe(true);
  });
});
