/** Сообщения между главным потоком и Worker. */

import type { PipelineResult, SourceId } from '@/types';
import type { ProgressInfo } from '@/lib/pipeline/run';

export type WorkerRequest =
  | { type: 'start'; forceLive?: boolean }
  | { type: 'use-backup'; source: SourceId; key: string };

export interface WorkerProgressMessage {
  type: 'progress';
  result: PipelineResult;
  progress: ProgressInfo;
  done: boolean;
}

export interface WorkerErrorMessage {
  type: 'error';
  message: string;
}

export type WorkerResponse = WorkerProgressMessage | WorkerErrorMessage;
