import { Sparkles, X } from 'lucide-react';
import { updatesFor } from '../updates';

export function UpdateModal({
  open,
  role,
  onClose,
}: {
  open: boolean;
  role: 'admin' | 'reader' | 'guest';
  onClose: () => void;
}) {
  if (!open) return null;
  const updates = updatesFor(role);
  return (
    <div className="update-backdrop" onMouseDown={onClose}>
      <section className="update-modal" role="dialog" aria-label="更新公告" onMouseDown={(event) => event.stopPropagation()}>
        <header className="update-modal-head">
          <div>
            <span className="eyebrow"><Sparkles size={12} /> PRODUCT UPDATE</span>
            <h2>更新公告</h2>
            <p>{role === 'reader' ? '和成员相关的最新变化' : '最新产品与成员空间变化'}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭更新公告"><X size={17} /></button>
        </header>
        <div className="update-list">
          {updates.map((update) => (
            <div key={update.id} className="update-block">
              <div className="update-date">{update.date} · {update.title}</div>
              {update.items.map((item) => (
                <div key={item.title} className="update-item">
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
        <footer className="update-modal-foot">
          <span>这些更新已经生效，无需刷新缓存。</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>知道了</button>
        </footer>
      </section>
    </div>
  );
}
