import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

type Props = { children: ReactNode };
type State = { failed: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DEVFORGE UI error', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot-error-screen">
        <div className="boot-error-card">
          <div className="boot-error-icon"><TriangleAlert size={26} /></div>
          <h1>界面遇到了一点问题</h1>
          <p>你的数据已经保存在服务器上。刷新页面通常就能恢复。</p>
          <div className="boot-error-hints">
            <span>{this.state.message || '未知错误'}</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> 刷新页面
          </button>
        </div>
      </div>
    );
  }
}
