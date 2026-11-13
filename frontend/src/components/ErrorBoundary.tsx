import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  failed: boolean;
  message: string | null;
}

/** Изолирует падение WebGL/3D: таблица должна продолжать работать. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[3D]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-slate-400">
            <p className="font-medium text-slate-200">3D-модуль недоступен</p>
            <p>{this.state.message ?? 'Не удалось инициализировать WebGL.'}</p>
            <p>Таблица и расчёты продолжают работать.</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
