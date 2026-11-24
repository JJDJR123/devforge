import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Search } from 'lucide-react';
import { api } from '../api';
import type { MemberKbDoc } from '../types';
import { getErrorMessage } from '../utils';

export function MemberKbView() {
  const [docs, setDocs] = useState<MemberKbDoc[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MemberKbDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      api.memberKb(query)
        .then((result) => {
          if (cancelled) return;
          setDocs(result.docs);
          setSelected((current) => current && result.docs.some((doc) => doc.id === current.id) ? current : result.docs[0] || null);
        })
        .catch((loadError) => { if (!cancelled) setError(getErrorMessage(loadError)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const selectedTags = useMemo(() => selected?.tags || [], [selected]);

  return (
    <div className="member-view">
      <header className="member-head">
        <div>
          <span className="eyebrow">MEMBER / KNOWLEDGE</span>
          <h1>成员知识库</h1>
          <p>只显示管理员发布并对成员开放的内容。不能编辑、删除或发布。</p>
        </div>
        <div className="member-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文、工具…" />
        </div>
      </header>

      {error ? <div className="assets-error">{error}</div> : null}
      {loading && !docs.length ? (
        <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取知识库…</p></div>
      ) : docs.length === 0 ? (
        <div className="assets-empty"><BookOpen size={26} /><p>还没有对成员开放的知识库条目。</p></div>
      ) : (
        <div className="member-kb-layout">
          <aside className="member-kb-list">
            {docs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className={`member-kb-item${selected?.id === doc.id ? ' is-active' : ''}`}
                onClick={() => setSelected(doc)}
              >
                <strong>{doc.title}</strong>
                <span>{doc.summary || doc.tool || '知识库条目'}</span>
              </button>
            ))}
          </aside>
          <article className="member-kb-doc">
            {selected ? (
              <>
                <div className="member-kb-title">
                  <div>
                    <span className="asset-badge is-note">{selected.kind}</span>
                    <h2>{selected.title}</h2>
                  </div>
                  <span className="asset-meta">更新于 {new Date(selected.updatedAt).toLocaleString('zh-CN')}</span>
                </div>
                {selected.summary ? <p className="member-kb-summary">{selected.summary}</p> : null}
                {selected.tool ? <p className="member-kb-meta">工具：{selected.tool}</p> : null}
                <pre className="member-kb-body">{selected.bodyMd || '（没有正文）'}</pre>
                {selected.prompt ? <pre className="member-kb-prompt">{selected.prompt}</pre> : null}
                {selectedTags.length ? <div className="member-kb-tags">{selectedTags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
              </>
            ) : null}
          </article>
        </div>
      )}
    </div>
  );
}
