import { describe, expect, it } from 'vitest';
import { readConfig } from '../../../api/supabase-handler';
import { parseEnvFile } from '../../../vite.dev-proxy';

describe('readConfig', () => {
  it('возвращает null, если переменные не заданы', () => {
    expect(readConfig(undefined)).toBeNull();
    expect(readConfig({})).toBeNull();
    expect(readConfig({ SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(readConfig({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' })).toBeNull();
  });

  it('читает url и ключ с полным доступом', () => {
    const config = readConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
    });
    expect(config).not.toBeNull();
    expect(config?.url).toBe('https://x.supabase.co');
    expect(config?.serviceRoleKey).toBe('sb_secret_x');
    expect(config?.writeKey).toBeUndefined();
  });

  it('подхватывает ключ записи, если он задан', () => {
    const config = readConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
      SUPABASE_CATALOG_WRITE_KEY: 'write-me',
    });
    expect(config?.writeKey).toBe('write-me');
  });
});

describe('parseEnvFile', () => {
  it('читает KEY=VALUE, комментарии и кавычки', () => {
    const env = parseEnvFile(
      [
        '# комментарий',
        'SUPABASE_URL=https://x.supabase.co',
        'SUPABASE_SERVICE_ROLE_KEY="sb_secret_x"',
        "EMPTY=",
        'no-equals-line',
      ].join('\n'),
    );
    expect(env.SUPABASE_URL).toBe('https://x.supabase.co');
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('sb_secret_x');
    expect(env.EMPTY).toBe('');
    expect(env['no-equals-line']).toBeUndefined();
  });
});
