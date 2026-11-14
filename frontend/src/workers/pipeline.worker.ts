/** Тяжёлый пайплайн в module Web Worker. */

import { PipelineController } from '@/lib/pipeline/run';
import type { WorkerRequest, WorkerResponse } from './messages';

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

let lastEmit = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: WorkerResponse | null = null;

function flush(): void {
  if (!pending) return;
  const message = pending;
  pending = null;
  lastEmit = Date.now();
  ctx.postMessage(message);
}

function post(message: WorkerResponse): void {
  if (message.type === 'progress' && message.done) {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = message;
    flush();
    return;
  }
  pending = message;
  const elapsed = Date.now() - lastEmit;
  if (elapsed >= 400) {
    if (timer) clearTimeout(timer);
    timer = null;
    flush();
    return;
  }
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, 400 - elapsed);
}

const controller = new PipelineController((result, progress, done) => {
  post({ type: 'progress', result, progress, done });
});

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'start') {
    void controller.start(Boolean(request.forceLive), Boolean(request.preferRemote)).catch((err: unknown) => {
      post({ type: 'error', message: (err as Error).message ?? 'Неизвестная ошибка пайплайна' });
    });
    return;
  }
  if (request.type === 'use-backup') {
    void controller.useBackup(request.source, request.key).then((ok) => {
      if (!ok) post({ type: 'error', message: 'Не удалось загрузить выбранную резервную копию' });
    });
    return;
  }
};
