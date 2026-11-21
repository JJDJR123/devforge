import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, ImageOff, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { AssetCategory, AssetItem, AssetsResponse } from '../types';
import { useToast } from '../components/Toast';
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
  const [data, setData] = useState<AssetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<AssetCategory | 'all'>('all');

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
              <article key={asset.id} className="asset-card">
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
