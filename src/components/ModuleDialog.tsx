import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Layers, Loader2, X } from 'lucide-react';
import type { Module } from '../types';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { EmojiPicker } from './EmojiPicker';
import { ACCENT_SWATCHES } from '../theme';
import { cn, getErrorMessage } from '../utils';

export function ModuleDialog({
  open,
  module,
  onClose,
  onSaved,
}: {
  open: boolean;
  module?: Module | null;
  onClose: () => void;
  onSaved?: (module: Module) => void;
}) {
  const { refresh } = useApp();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('🎮');
  const [accent, setAccent] = useState('#c8f76a');
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(module?.title || '');
    setIcon(module?.icon || '🎮');
    setAccent(module?.accent || '#c8f76a');
    setIsPublic(module ? module.isPublic : true);
    setError('');
    setBusy(false);
  }, [open, module]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!title.trim()) {
      setError('给模块起一个名字。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = module
        ? await api.updateModule(module.id, { title: title.trim(), icon, accent, isPublic })
        : await api.createModule({ title: title.trim(), icon, accent, isPublic });
      await refresh();
      toast(module ? '模块已更新。' : '模块已创建。', 'success');
      onSaved?.(result.module);
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="module-modal" ariaLabel={module ? '编辑模块' : '新建模块'}>
      <form className="modal-card module-form-card" onSubmit={submit}>
        <header className="modal-head">
          <div>
            <span className="eyebrow"><Layers size={13} /> MODULE</span>
            <h2>{module ? '编辑模块' : '新建模块'}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="module-form-grid">
          <div className="module-form-main">
            <label className="field">
              <span className="field-label">模块名称</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：Godot 4 入门"
                maxLength={60}
                autoFocus
              />
            </label>

            <div className="field">
              <span className="field-label">选择图标</span>
              <EmojiPicker value={icon} onChange={setIcon} compact />
            </div>

            <div className="field">
              <span className="field-label">主题色</span>
              <div className="accent-row">
                {ACCENT_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn('accent-swatch', accent === color && 'is-active')}
                    style={{ backgroundColor: color }}
                    onClick={() => setAccent(color)}
                    aria-label={`选择颜色 ${color}`}
                  >
                    {accent === color ? <span /> : null}
                  </button>
                ))}
                <label className="accent-custom" title="自定义颜色">
                  <input
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                    aria-label="自定义主题色"
                  />
                  <span style={{ backgroundColor: accent }} />
                </label>
              </div>
            </div>

            <div className="toggle-field module-public-toggle">
              <span>
                <b>公开到网站</b>
                <em>{isPublic ? '访客可以在只读站点看到这个模块' : '只有登录后才能看到，公开站点会隐藏'}</em>
              </span>
              <button
                type="button"
                className={cn('switch', isPublic && 'is-on')}
                onClick={() => setIsPublic((value) => !value)}
                aria-pressed={isPublic}
              ><span /></button>
            </div>
          </div>

          <div className="module-preview-wrap">
            <span className="field-label">预览</span>
            <div className="module-preview" style={{ '--module-accent': accent } as CSSProperties}>
              <div className="module-preview-icon">{icon}</div>
              <div>
                <strong>{title.trim() || '你的模块'}</strong>
                <span>{isPublic ? '公开 · 0 个页面' : '私密 · 0 个页面'}</span>
              </div>
              <div className="module-preview-bar"><span /></div>
            </div>
            <p className="field-hint">模块是文件夹。创建后可以在里面添加任意页面。</p>
          </div>
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : null}
            {busy ? '保存中…' : '保存模块'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
