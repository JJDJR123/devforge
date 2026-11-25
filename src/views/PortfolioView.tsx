import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../api';
import type { PortfolioItem } from '../types';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { copyText, formatRelativeTime, getErrorMessage } from '../utils';
import '../styles/portfolio.css';

const ACCEPT = '.pdf,.zip,.png,.jpg,.jpeg,.webp,.gif,.avif,.mp4,.webm';
const MAX_MB = 200;

function bytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function fileKind(mime: string) {
  if (mime.startsWith('image/')) return '图片';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('zip')) return 'ZIP';
  if (mime.startsWith('video/')) return '视频';
  return '文件';
}

function PortfolioThumb({ item }: { item: PortfolioItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <a className="portfolio-thumb" href={item.visible ? item.downloadUrl : undefined} target="_blank" rel="noreferrer">
      {item.previewUrl && !failed
        ? <img src={item.previewUrl} alt={item.title} loading="lazy" onError={() => setFailed(true)} />
        : <FileText size={26} />}
    </a>
  );
}

export function PortfolioView() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [maxBytes, setMaxBytes] = useState(MAX_MB * 1024 * 1024);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [replaceProgress, setReplaceProgress] = useState<{ id: string; loaded: number; total: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; description: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);

  async function load() {
    try {
      const result = await api.adminPortfolio();
      setItems(result.items);
      if (result.maxBytes) setMaxBytes(result.maxBytes);
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function chooseFile(next: File | undefined) {
    if (!next) return;
    if (next.size > maxBytes) {
      toast(`文件不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB。`, 'error');
      return;
    }
    setFile(next);
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, ''));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setProgress({ loaded: 0, total: file.size });
    try {
      await api.uploadPortfolio(
        file,
        { title: title.trim() || file.name, description: description.trim() },
        (loaded, total) => setProgress({ loaded, total }),
      );
      setFile(null);
      setTitle('');
      setDescription('');
      toast('作品已上传。', 'success');
      await load();
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function replaceFile(file: File | undefined) {
    const id = replaceIdRef.current;
    if (!file || !id) return;
    if (file.size > maxBytes) {
      toast(`文件不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB。`, 'error');
      return;
    }
    setReplaceProgress({ id, loaded: 0, total: file.size });
    try {
      await api.replacePortfolioFile(id, file, (loaded, total) => setReplaceProgress({ id, loaded, total }));
      toast('文件已替换，下载链接保持不变。', 'success');
      await load();
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    } finally {
      setReplaceProgress(null);
      replaceIdRef.current = null;
    }
  }

  async function toggleVisible(item: PortfolioItem) {    try {
      const result = await api.updatePortfolio(item.id, { visible: !item.visible });
      setItems((current) => current.map((entry) => entry.id === item.id ? result.item : entry));
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function remove(item: PortfolioItem) {
    const ok = await confirm({
      title: `删除「${item.title}」？`,
      message: '文件和下载记录会一起删除，不能撤销。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePortfolio(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      toast('已删除。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      const result = await api.updatePortfolio(editing.id, {
        title: editing.title,
        description: editing.description,
      });
      setItems((current) => current.map((entry) => entry.id === editing.id ? result.item : entry));
      setEditing(null);
      toast('信息已保存。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function copyDownload(item: PortfolioItem) {
    const url = `${window.location.origin}${item.downloadUrl}`;
    const ok = await copyText(url);
    toast(ok ? '下载链接已复制。' : '复制失败，请手动复制。', ok ? 'success' : 'error');
  }

  async function copyPage() {
    const ok = await copyText(`${window.location.origin}/works`);
    toast(ok ? '作品集页面链接已复制。' : '复制失败。', ok ? 'success' : 'error');
  }

  return (
    <div className="portfolio-view">
      <header className="portfolio-head">
        <div>
          <span className="eyebrow">ADMIN / WORKS</span>
          <h1>作品集</h1>
          <p>只有你在这里管理文件。前台 `/works` 是不进导航的分享页，拿到链接的人可以直接下载。</p>
        </div>
        <div className="portfolio-head-actions">
          <button type="button" className="btn btn-ghost" onClick={() => window.open('/works', '_blank', 'noopener')}>
            <Eye size={15} /> 打开下载页
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { void copyPage(); }}>
            <Copy size={15} /> 复制页面链接
          </button>
        </div>
      </header>

      <section
        className={`portfolio-upload${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="portfolio-upload-icon"><Upload size={22} /></div>
        <div className="portfolio-upload-main">
          <strong>{file ? file.name : '拖入文件，或点击选择'}</strong>
          {progress ? (
            <div className="portfolio-progress-block">
              <div className="portfolio-progress-track">
                <span style={{ width: `${progress.total ? Math.min(100, (progress.loaded / progress.total) * 100) : 0}%` }} />
              </div>
              <span>{Math.round((progress.loaded / Math.max(1, progress.total)) * 100)}% · {bytes(progress.loaded)} / {bytes(progress.total)}</span>
            </div>
          ) : (
            <span>PDF / ZIP / 图片 / MP4 / WebM · 单文件最多 {Math.round(maxBytes / 1024 / 1024)}MB</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ''; }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = '';
            void replaceFile(selected);
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Plus size={15} /> 选择文件
        </button>
      </section>

      <div className="portfolio-form">
        <label className="portfolio-field">
          <span>标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="作品名称" maxLength={120} />
        </label>
        <label className="portfolio-field">
          <span>说明</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="一句话说明，可选" maxLength={2000} />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => { void upload(); }} disabled={!file || busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} {busy ? '上传中…' : '上传到作品集'}
        </button>
      </div>

      <section className="portfolio-list">
        <div className="portfolio-list-head">
          <h2>已上传 <span>{items.length}</span></h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void load(); }} disabled={loading}>刷新</button>
        </div>
        {loading ? <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取…</p></div>
          : items.length === 0 ? <div className="assets-empty"><FileText size={26} /><p>还没有作品，先上传一个。</p></div>
            : items.map((item) => (
              <article key={item.id} className={`portfolio-item${item.visible ? '' : ' is-hidden'}`}>
                <PortfolioThumb item={item} />
                <div className="portfolio-item-main">
                  {editing?.id === item.id ? (
                    <>
                      <input className="portfolio-edit-title" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
                      <textarea className="portfolio-edit-desc" value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} rows={2} />
                      <div className="portfolio-item-actions">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => { void saveEdit(); }}><Check size={13} /> 保存</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="portfolio-item-title">
                        <strong>{item.title}</strong>
                        <span>{fileKind(item.mime)} · {bytes(item.size)}</span>
                        {!item.visible ? <em>不显示</em> : null}
                      </div>
                      {item.description ? <p>{item.description}</p> : null}
                      <span className="portfolio-meta">{item.originalName} · {formatRelativeTime(item.createdAt)}</span>
                      {replaceProgress?.id === item.id ? (
                        <span className="portfolio-replace-status">
                          替换中 {Math.round((replaceProgress.loaded / Math.max(1, replaceProgress.total)) * 100)}% · {bytes(replaceProgress.loaded)} / {bytes(replaceProgress.total)}
                        </span>
                      ) : null}
                      <div className="portfolio-item-actions">
                        <a className="btn btn-ghost btn-sm" href={item.downloadUrl}><Download size={14} /> 下载</a>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void copyDownload(item); }}><Copy size={14} /> 复制直链</button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={replaceProgress?.id === item.id}
                          onClick={() => {
                            replaceIdRef.current = item.id;
                            replaceInputRef.current?.click();
                          }}
                        >
                          <Upload size={14} /> 替换文件
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: item.id, title: item.title, description: item.description })}>编辑</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void toggleVisible(item); }}>{item.visible ? <><EyeOff size={14} /> 隐藏</> : <><Eye size={14} /> 显示</>}</button>
                        <button type="button" className="btn btn-ghost btn-sm is-danger" onClick={() => { void remove(item); }}><Trash2 size={14} /> 删除</button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            ))}
      </section>
    </div>
  );
}
