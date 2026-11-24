import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { InviteCode } from '../types';
import { useToast } from '../components/Toast';
import { copyText, getErrorMessage } from '../utils';

export function InviteCodesView() {
  const { toast } = useToast();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await api.invites();
      setCodes(result.codes);
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function generate() {
    setGenerating(true);
    try {
      const result = await api.generateInvites(10);
      setCodes(result.codes);
      toast('已生成 10 个邀请码。', 'success');
    } catch (generateError) {
      toast(getErrorMessage(generateError), 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function copy(code: string) {
    const ok = await copyText(code);
    toast(ok ? '邀请码已复制。' : '复制失败，请手动复制。', ok ? 'success' : 'error');
  }

  return (
    <div className="requests-view invites-view">
      <header className="assets-head">
        <div>
          <span className="eyebrow">ADMIN / INVITES</span>
          <h1>邀请码</h1>
          <p>一次性使用。默认一次生成 10 条，最多保留 50 条；超过上限时优先隐藏最近使用过的码。</p>
        </div>
        <div className="invite-actions">
          <button type="button" className="btn btn-ghost" onClick={() => { void load(); }} disabled={loading}>
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} 刷新
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { void generate(); }} disabled={generating}>
            {generating ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} 生成 10 条
          </button>
        </div>
      </header>
      {error ? <div className="assets-error">{error}</div> : null}
      {loading ? <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取邀请码…</p></div>
        : codes.length === 0 ? <div className="assets-empty"><KeyRound size={26} /><p>还没有邀请码。</p></div>
          : <div className="invite-list">
            {codes.map((code) => (
              <article key={code.id} className={`invite-card${code.used ? ' is-used' : ''}`}>
                <div>
                  <code className="invite-code">{code.used ? <s>{code.code}</s> : code.code}</code>
                  <span className="invite-meta">{code.used ? `已使用 · ${code.usedBy || ''} · ${new Date(code.usedAt || '').toLocaleString('zh-CN')}` : '未使用'}</span>
                </div>
                <button type="button" className="icon-btn" onClick={() => { void copy(code.code); }} aria-label="复制邀请码" title="复制">
                  <Copy size={15} />
                </button>
              </article>
            ))}
          </div>}
    </div>
  );
}
