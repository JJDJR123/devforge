import { useEffect, useState } from 'react';
import { ImageOff, Images, Loader2 } from 'lucide-react';
import { api } from '../api';
import type { MemberAsset } from '../types';
import { getErrorMessage } from '../utils';

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function MemberAssetsView() {
  const [assets, setAssets] = useState<MemberAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.memberAssets()
      .then((result) => { if (!cancelled) setAssets(result.assets); })
      .catch((loadError) => { if (!cancelled) setError(getErrorMessage(loadError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="member-view">
      <header className="member-head">
        <div>
          <span className="eyebrow">MEMBER / ASSETS</span>
          <h1>成员素材库</h1>
          <p>只显示公开页面里已经引用的图片。未引用文件和管理用素材不会出现在这里。</p>
        </div>
      </header>

      {error ? <div className="assets-error">{error}</div> : null}
      {loading ? (
        <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取素材…</p></div>
      ) : assets.length === 0 ? (
        <div className="assets-empty"><ImageOff size={26} /><p>还没有对成员开放的素材。</p></div>
      ) : (
        <div className="member-assets-grid">
          {assets.map((asset) => (
            <a key={asset.id} className="member-asset" href={asset.url} target="_blank" rel="noreferrer">
              <img src={asset.url} alt={asset.name} loading="lazy" />
              <div>
                <strong>{asset.name}</strong>
                <span>{asset.pageTitle || '公开页面'} · {formatBytes(asset.size)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
      <div className="member-foot-note"><Images size={14} /> 成员只读，不能上传或删除素材。</div>
    </div>
  );
}
