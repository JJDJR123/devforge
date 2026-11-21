import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, ImageOff, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { AssetCategory, AssetItem, AssetsResponse } from '../types';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { copyText, formatRelativeTime, getErrorMessage } from '../utils';

const CATEGORY_LABEL: Record<AssetCategory | 'all', string> = {
  all: '全部',
  note: '笔记图片',
  module_icon: '模块图标',
  site_logo: '站点 Logo',
  orphan: '未引用',
};

const CATEGORY_ORDER: AssetCategory[] = ['note', 'module_icon', 'site_logo', 'orphan'];

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function usageLabels(asset: AssetItem): string[] {
  const labels: string[] = [];
  if (asset.usedBy.site) labels.push('站点 Logo');
  for (const module of asset.usedBy.modules) labels.push(`模块「${module}」`);
  for (const page of asset.usedBy.pages) labels.push(`页面「${page}」`);
  return labels;
}

export function AssetsView() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<AssetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<AssetCategory | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api.assets());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const assets = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.assets : data.assets.filter((asset) => asset.category === filter);
  }, [data, filter]);

  const orphanCount = data?.counts.orphan || 0;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelected(new Set(assets.map((asset) => asset.id)));
  }

  async function removeAssets(ids: string[], title: string) {
    if (!ids.length || deleting) return;
    const ok = await confirm({
      title,
      message: `将删除 ${ids.length} 个文件。正在被页面、模块或站点 Logo 使用的文件会自动跳过，不会破坏现有内容。`,
      confirmText: '删除文件',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const result = await api.deleteAssets(ids);
      setSelected(new Set());
      await load();
      if (result.deleted.length) {
        toast(
          result.skipped.length
            ? `已删除 ${result.deleted.length} 个，跳过 ${result.skipped.length} 个正在使用的文件。`
            : `已删除 ${result.deleted.length} 个文件。`,
          'success',
        );
      } else {
        toast('没有删除任何文件；这些文件正在被使用。', 'error');
      }
    } catch (deleteError) {
      toast(getErrorMessage(deleteError), 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function deleteAllOrphans() {
    const ids = (data?.assets || []).filter((asset) => asset.category === 'orphan').map((asset) => asset.id);
    await removeAssets(ids, `删除全部未引用文件（${ids.length} 个）？`);
  }

  async function copyUrl(asset: AssetItem) {
    const ok = await copyText(asset.url);
    toast(ok ? '文件地址已复制。' : '复制失败，请手动复制。', ok ? 'success' : 'error');
  }

  return (
    <div className="assets-view">
      <header className="assets-head">
        <div>
          <span className="eyebrow">ADMIN / ASSETS</span>
          <h1>素材库</h1>
          <p>区分笔记图片、模块自定义图标、站点 Logo 和未被引用的上传文件。</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => { void load(); }} disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} 刷新
        </button>
      </header>

      <div className="assets-summary">
        <button type="button" className={`assets-count${filter === 'all' ? ' is-active' : ''}`} onClick={() => setFilter('all')}>
          <strong>{data?.assets.length || 0}</strong>
          <span>全部文件</span>
        </button>
        {CATEGORY_ORDER.map((category) => (
          <button
            key={category}
            type="button"
            className={`assets-count${filter === category ? ' is-active' : ''}`}
            onClick={() => setFilter(category)}
          >
            <strong>{data?.counts[category] || 0}</strong>
            <span>{CATEGORY_LABEL[category]}</span>
          </button>
        ))}
      </div>

      <div className="assets-filters" role="tablist" aria-label="素材分类">
        {(['all', ...CATEGORY_ORDER] as Array<'all' | AssetCategory>).map((category) => (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={filter === category}
            className={`assets-filter${filter === category ? ' is-active' : ''}`}
            onClick={() => setFilter(category)}
          >
            {CATEGORY_LABEL[category]}
          </button>
        ))}
      </div>

      <div className="assets-bulk">
        <span><strong>已选 {selected.size}</strong> 个</span>
        <div className="assets-bulk-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={selectVisible} disabled={!assets.length || deleting}>
            全选当前
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} disabled={!selected.size || deleting}>
            清空
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => { void removeAssets([...selected], `删除选中的 ${selected.size} 个文件？`); }}
            disabled={!selected.size || deleting}
          >
            <Trash2 size={14} /> 删除选中
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => { void deleteAllOrphans(); }}
            disabled={!orphanCount || deleting}
          >
            <Trash2 size={14} /> 一键删除未引用（{orphanCount}）
          </button>
        </div>
      </div>

      {error ? <div className="assets-error">{error}</div> : null}
      {loading && !data ? (
        <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取素材…</p></div>
      ) : assets.length === 0 ? (
        <div className="assets-empty"><ImageOff size={26} /><p>这个分类下还没有文件。</p></div>
      ) : (
        <div className="assets-grid">
          {assets.map((asset) => {
            const labels = usageLabels(asset);
            return (
              <article key={asset.id} className={`asset-card${selected.has(asset.id) ? ' is-selected' : ''}`}>
                <label className="asset-check" title="选择这个文件">
                  <input
                    type="checkbox"
                    checked={selected.has(asset.id)}
                    onChange={() => toggle(asset.id)}
                    aria-label={`选择 ${asset.name}`}
                  />
                </label>
                <a className="asset-preview" href={asset.url} target="_blank" rel="noreferrer">
                  {asset.mime.startsWith('image/') ? (
                    <img src={asset.url} alt={asset.name} loading="lazy" />
                  ) : (
                    <FileText size={30} />
                  )}
                </a>
                <div className="asset-body">
                  <div className="asset-title-row">
                    <strong title={asset.name}>{asset.name}</strong>
                    <span className={`asset-badge is-${asset.category}`}>{CATEGORY_LABEL[asset.category]}</span>
                  </div>
                  <span className="asset-meta">{formatBytes(asset.size)} · {formatRelativeTime(asset.createdAt)}</span>
                  <span className={`asset-usage${labels.length ? '' : ' is-empty'}`}>
                    {labels.length ? labels.slice(0, 2).join('、') + (labels.length > 2 ? ` 等 ${labels.length} 处` : '') : '没有被任何页面/图标引用'}
                  </span>
                  <div className="asset-actions">
                    <button type="button" className="link-button" onClick={() => { void copyUrl(asset); }}>
                      <Copy size={13} /> 复制地址
                    </button>
                    <a className="link-button" href={asset.url} target="_blank" rel="noreferrer">打开</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
