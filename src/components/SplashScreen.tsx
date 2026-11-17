import { BrandMark } from './BrandMark';

export function SplashScreen() {
  return (
    <div className="splash-screen">
      <div className="splash-grid" aria-hidden="true" />
      <div className="splash-inner">
        <BrandMark size={64} />
        <div className="splash-word">DEVFORGE</div>
        <div className="splash-sub">独立游戏开发学习舱</div>
        <div className="splash-loader" aria-hidden="true">
          <span />
        </div>
        <div className="splash-status">正在连接你的学习舱…</div>
      </div>
      <div className="splash-foot">SINGLE USER · SELF HOSTED · PWA</div>
    </div>
  );
}
