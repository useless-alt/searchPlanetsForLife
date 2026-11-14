/** Клиент Worker: создание, сообщения, обработка прогресса. */

import type { SourceId } from '@/types';
import type { WorkerRequest, WorkerResponse } from './messages';
import type { ProgressInfo } from '@/lib/pipeline/run';
import type { PipelineResult } from '@/types';

export interface PipelineCallbacks {
  onProgress: (result: PipelineResult, progress: ProgressInfo, done: boolean) => void;
  onError: (message: string) => void;
}

export class PipelineClient {
  private worker: Worker | null = null;
  private readonly callbacks: PipelineCallbacks;

  constructor(callbacks: PipelineCallbacks) {
    this.callbacks = callbacks;
  }

  start(forceLive = false, preferRemote = false): void {
    this.stop();
    this.worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), {
      type: 'module',
      name: 'exoplanet-pipeline',
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        this.callbacks.onProgress(message.result, message.progress, message.done);
      } else {
        this.callbacks.onError(message.message);
      }
    };
    this.worker.onerror = (event) => {
      this.callbacks.onError(event.message || 'Ошибка Web Worker');
    };
    this.send({ type: 'start', forceLive, preferRemote });
  }

  useBackup(source: SourceId, key: string): void {
    this.send({ type: 'use-backup', source, key });
  }

  private send(request: WorkerRequest): void {
    this.worker?.postMessage(request);
  }

  stop(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
