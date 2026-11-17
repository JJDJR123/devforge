import { RefreshCw, ServerCrash } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { BrandLockup } from './BrandMark';

export function BootError() {
  const { bootError, retryBoot } = useApp();

  return (
    <div className="boot-error-screen">
      <div className="boot-error-card">
        <BrandLockup compact />
        <div className="boot-error-icon"><ServerCrash size={26} /></div>
        <h1>连不上学习舱</h1>
        <p>{bootError || '服务器没有响应，请确认服务已经启动。'}</p>
        <div className="boot-error-hints">
          <span>本机开发：确认 <code>npm run dev</code> 正在运行</span>
          <span>云端部署：检查 <code>docker compose ps</code> 与 Caddy 日志</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={retryBoot}>
          <RefreshCw size={16} /> 重试连接
        </button>
      </div>
    </div>
  );
}
