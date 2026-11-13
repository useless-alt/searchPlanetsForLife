// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import { buildProxyUrl, fetchWithPolicy, readTapBody, type FetchLike } from './transport';

function response(status: number, body = '', headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

const noSleep = async (): Promise<void> => {};

describe('fetchWithPolicy', () => {
  it('делает прямой запрос для HTTPS-URL', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      calls.push(String(input));
      return response(200, '[]');
    };
    const result = await fetchWithPolicy(
      'nasa',
      { url: 'https://example.org/tap' },
      { fetchImpl, pageProtocol: 'https:', allowProxy: true, sleep: noSleep },
    );
    expect(calls).toEqual(['https://example.org/tap']);
    expect(result.usedProxy).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('отправляет HTTP-источник через Edge-прокси на HTTPS-странице', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      calls.push(String(input));
      return response(200, '[]');
    };
    const result = await fetchWithPolicy(
      'exoplanet_eu',
      { url: 'http://voparis-tap-planeto.obspm.fr/tap/sync' },
      { fetchImpl, pageProtocol: 'https:', allowProxy: true, sleep: noSleep },
    );
    expect(calls).toEqual([buildProxyUrl('http://voparis-tap-planeto.obspm.fr/tap/sync')]);
    expect(result.usedProxy).toBe(true);
  });

  it('повторяет через прокси после TypeError (CORS)', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      calls.push(String(input));
      if (calls.length === 1) throw new TypeError('Failed to fetch');
      return response(200, '[]');
    };
    const result = await fetchWithPolicy(
      'nasa',
      { url: 'http://archives.ia2.inaf.it/vo/tap/projects/sync', method: 'POST' },
      { fetchImpl, pageProtocol: 'http:', allowProxy: true, sleep: noSleep },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(buildProxyUrl('http://archives.ia2.inaf.it/vo/tap/projects/sync'));
    expect(result.usedProxy).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('уважает Retry-After при 503', async () => {
    const sleeps: number[] = [];
    let call = 0;
    const fetchImpl: FetchLike = async () => {
      call += 1;
      return call === 1 ? response(503, '', { 'retry-after': '1' }) : response(200, '[]');
    };
    const result = await fetchWithPolicy(
      'simbad',
      { url: 'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync' },
      {
        fetchImpl,
        pageProtocol: 'https:',
        allowProxy: true,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => 0.5,
      },
    );
    expect(sleeps).toEqual([1000]);
    expect(result.attempts).toBe(2);
  });

  it('сдаётся после исчерпания попыток и возвращает последний 429', async () => {
    let call = 0;
    const fetchImpl: FetchLike = async () => {
      call += 1;
      return response(429, 'rate limited');
    };
    const result = await fetchWithPolicy(
      'gaia',
      { url: 'https://gea.esac.esa.int/tap-server/tap/sync' },
      { fetchImpl, pageProtocol: 'https:', allowProxy: true, sleep: noSleep, random: () => 0.5 },
    );
    expect(call).toBe(3);
    expect(result.response.status).toBe(429);
  });

  it('не повторяет 404', async () => {
    let call = 0;
    const fetchImpl: FetchLike = async () => {
      call += 1;
      return response(404, 'missing');
    };
    const result = await fetchWithPolicy(
      'nasa',
      { url: 'https://example.org' },
      { fetchImpl, pageProtocol: 'https:', allowProxy: true, sleep: noSleep },
    );
    expect(call).toBe(1);
    expect(result.attempts).toBe(1);
  });

  it('повторяет сетевую ошибку и в итоге бросает её', async () => {
    let call = 0;
    const fetchImpl: FetchLike = async () => {
      call += 1;
      throw new TypeError('offline');
    };
    await expect(
      fetchWithPolicy(
        'nasa',
        { url: 'https://example.org' },
        { fetchImpl, pageProtocol: 'https:', allowProxy: false, sleep: noSleep },
      ),
    ).rejects.toThrow('offline');
    expect(call).toBe(3);
  });
});

describe('readTapBody', () => {
  it('читает JSON успешного ответа', async () => {
    await expect(readTapBody(response(200, '{"data":[]}'))).resolves.toEqual({ data: [] });
  });

  it('показывает статус и начало тела при ошибке', async () => {
    await expect(readTapBody(response(500, 'server down'))).rejects.toThrow('HTTP 500: server down');
  });

  it('отвергает HTML-ответ', async () => {
    await expect(readTapBody(response(200, '<html>oops</html>'))).rejects.toThrow('Non-JSON response');
  });

  it('отвергает сломанный JSON', async () => {
    await expect(readTapBody(response(200, '{broken'))).rejects.toThrow('Invalid JSON');
  });
});

describe('buildProxyUrl', () => {
  it('кодирует исходный URL', () => {
    const url = 'http://example.org/tap?query=SELECT%20*&format=json';
    const proxied = buildProxyUrl(url);
    expect(proxied.startsWith('/api/proxy?u=')).toBe(true);
    expect(decodeURIComponent(proxied.split('u=')[1])).toBe(url);
  });
});

describe('AbortSignal', () => {
  it('передаёт сигнал таймаута в fetch', async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl: FetchLike = async (_, init) => {
      signal = init?.signal;
      return response(200, '[]');
    };
    await fetchWithPolicy(
      'nasa',
      { url: 'https://example.org' },
      { fetchImpl, pageProtocol: 'https:', allowProxy: false, sleep: noSleep },
    );
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });
});
