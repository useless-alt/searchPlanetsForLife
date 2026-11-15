import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadEnvFiles, parseEnvFile } from './env';

/** Временные каталоги, которые надо убрать после теста. */
const tempDirs: string[] = [];

/** Временный каталог с файлами. */
async function makeDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'exo-env-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content);
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('parseEnvFile', () => {
  it('читает пары, пропускает комментарии и пустые строки', () => {
    const parsed = parseEnvFile(
      ['# комментарий', 'PORT=8787', '', 'BACKUP_DIR=data/backups'].join('\n'),
    );

    expect(parsed).toEqual({ PORT: '8787', BACKUP_DIR: 'data/backups' });
  });

  it('снимает кавычки и пробелы вокруг значения', () => {
    const parsed = parseEnvFile('A="1"\nB=\'2\'\nC= 3 ');
    expect(parsed).toEqual({ A: '1', B: '2', C: '3' });
  });

  it('строки без ключа или без = игнорируются', () => {
    expect(parseEnvFile('=нет ключа\nпросто текст\n=1')).toEqual({});
  });
});

describe('loadEnvFiles', () => {
  it('читает .env из текущего каталога', async () => {
    const dir = await makeDir({ '.env': 'PORT=9100\nEXO_TEST_VALUE=from-env\n' });
    const env: NodeJS.ProcessEnv = {};

    const loaded = loadEnvFiles(env, dir);

    expect(env.PORT).toBe('9100');
    expect(env.EXO_TEST_VALUE).toBe('from-env');
    expect(loaded.some((file) => file.endsWith('.env'))).toBe(true);
  });

  it('не перетирает уже заданные переменные процесса', async () => {
    const dir = await makeDir({ '.env': 'PORT=9100\n' });
    const env: NodeJS.ProcessEnv = { PORT: '9000' };

    loadEnvFiles(env, dir);

    expect(env.PORT).toBe('9000');
  });

  it('отсутствие файлов в текущем каталоге — не ошибка', async () => {
    const dir = path.join(os.tmpdir(), `exo-no-such-dir-${Date.now()}`);
    const loaded = loadEnvFiles({}, dir);
    expect(loaded.some((file) => file.startsWith(dir))).toBe(false);
  });
});
