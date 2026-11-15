import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { registerWebApp, resolveStaticPath } from './static';

/** Временные каталоги, которые надо убрать после теста. */
const tempDirs: string[] = [];

/** Создаёт минимальную сборку: `index.html` и хешированный ассет. */
async function makeDist(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'exo-web-'));
  tempDirs.push(root);
  await writeFile(path.join(root, 'index.html'), '<!doctype html><div id="root"></div>');
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'assets', 'app-1a2b.js'), 'console.log("exo");');
  return root;
}

/** Приложение с раздачей статики. */
async function makeApp(root: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerWebApp(app, { root });
  await app.ready();
  return app;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('раздача собранного веб-приложения', () => {
  it('корень отдаёт index.html без долгого кэша', async () => {
    const app = await makeApp(await makeDist());
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toContain('id="root"');
    await app.close();
  });

  it('ассет из assets отдаётся с immutable-кэшем и правильным типом', async () => {
    const app = await makeApp(await makeDist());
    const response = await app.inject({ method: 'GET', url: '/assets/app-1a2b.js' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/javascript');
    expect(response.headers['cache-control']).toContain('immutable');
    expect(response.body).toContain('exo');
    await app.close();
  });

  it('путь без расширения отдаёт оболочку приложения (SPA)', async () => {
    const app = await makeApp(await makeDist());
    const response = await app.inject({ method: 'GET', url: '/planets/wasp-12-b' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('id="root"');
    await app.close();
  });

  it('отсутствующий файл с расширением — 404, а не index.html', async () => {
    const app = await makeApp(await makeDist());
    const response = await app.inject({ method: 'GET', url: '/missing.png' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('неизвестный /api-маршрут остаётся JSON-ошибкой и не уходит в SPA', async () => {
    const app = await makeApp(await makeDist());
    const response = await app.inject({ method: 'GET', url: '/api/unknown' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found' });
    await app.close();
  });

  it('POST на статический путь — 404', async () => {
    const app = await makeApp(await makeDist());
    const response = await app.inject({ method: 'POST', url: '/' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('HEAD отдаёт заголовки без тела', async () => {
    const app = await makeApp(await makeDist());
    const response = await app.inject({ method: 'HEAD', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
    expect(response.headers['content-length']).toBeDefined();
    await app.close();
  });

  it('выход за пределы каталога сборки блокируется', async () => {
    const root = await makeDist();
    const app = await makeApp(root);
    const response = await app.inject({ method: 'GET', url: '/..%2F..%2Fsecret.txt' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('resolveStaticPath', () => {
  it('путь внутри каталога разрешается', () => {
    const root = path.resolve('/srv/dist');
    expect(resolveStaticPath(root, '/assets/app.js')).toBe(path.resolve(root, 'assets/app.js'));
  });

  it('корень и вложенный каталог остаются внутри', () => {
    const root = path.resolve('/srv/dist');
    expect(resolveStaticPath(root, '/')).toBe(root);
  });

  it('пути с .. не выводят за пределы каталога', () => {
    const root = path.resolve('/srv/dist');
    for (const urlPath of [
      '/../../etc/passwd',
      '/..%2F..%2Fetc%2Fpasswd',
      '/..\\..\\etc\\passwd',
    ]) {
      const resolved = resolveStaticPath(root, urlPath);
      expect(resolved === null || resolved.startsWith(`${root}${path.sep}`)).toBe(true);
    }
  });

  it.skipIf(process.platform !== 'win32')('абсолютный путь чужого диска блокируется', () => {
    expect(resolveStaticPath(path.resolve('C:\\srv\\dist'), '/C:/Windows/win.ini')).toBeNull();
  });

  it('битый процентный escape запрещён', () => {
    expect(resolveStaticPath(path.resolve('/srv/dist'), '/%E0%A4%A')).toBeNull();
  });
});
