import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { api } from '../api';
import type { PortfolioItem } from '../types';
import { BrandLockup } from '../components/BrandMark';
import { formatRelativeTime, getErrorMessage } from '../utils';
import '../styles/portfolio.css';

function bytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function kind(mime: string) {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('zip')) return 'ZIP';
  if (mime.startsWith('video/')) return 'VIDEO';
  return 'FILE';
}

function WorksThumb({ item }: { item: PortfolioItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <a className="works-thumb" href={`/api/works/${item.id}/file`} target="_blank" rel="noreferrer">
      {item.previewUrl && !failed
        ? <img src={item.previewUrl} alt={item.title} loading="lazy" onError={() => setFailed(true)} />
        : <FileText size={30} />}
    </a>
  );
}

export function WorksPage() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow,noarchive';
    document.head.append(meta);
    document.title = '作品集 · DEVFORGE';
    api.publicPortfolio()
      .then((result) => setItems(result.items))
      .catch((loadError) => setError(getErrorMessage(loadError)))
      .finally(() => setLoading(false));
    return () => { meta.remove(); };
  }, []);

  return (
    <div className="works-page">
      <header className="works-head">
        <BrandLockup compact />
        <span className="works-kicker">SELECTED WORKS / 作品集</span>
        <h1>作品集下载</h1>
        <p>这里是我整理的作品文件。页面不进入站点导航，拿到链接即可下载。</p>
      </header>

      {error ? <div className="assets-error">{error}</div> : null}
      {loading ? (
        <div className="works-empty"><Loader2 size={22} className="spin" /> 正在读取…</div>
      ) : items.length === 0 ? (
        <div className="works-empty"><FileText size={26} /> 还没有公开作品。</div>
      ) : (
        <div className="works-grid">
          {items.map((item) => (
            <article key={item.id} className="works-card">
              <WorksThumb item={item} />
              <div className="works-body">
                <span className="works-type">{kind(item.mime)} · {bytes(item.size)}</span>
                <h2>{item.title}</h2>
                {item.description ? <p>{item.description}</p> : null}
                <span className="works-meta">{formatRelativeTime(item.createdAt)}</span>
                <a className="btn btn-primary works-download" href={item.downloadUrl}>
                  <Download size={15} /> 下载文件
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      <footer className="works-foot">
        <span>DEVFORGE · SELECTED WORKS</span>
        <span>直接下载链接 · 请勿公开转载</span>
      </footer>
    </div>
  );
}
