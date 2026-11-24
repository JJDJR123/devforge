import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Inbox,
  KeyRound,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { kbApi } from '../api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import type { KbDoc, KbKind, KbStats, KbStatus } from '../types';
import { cn, copyText, formatRelativeTime, getErrorMessage } from '../utils';

const KIND_LABEL: Record<KbKind, string> = {
  recipe: '配方',
  rule: '规则',
  fact: '事实',
  reference: '参考',
};

const KIND_HINT: Record<KbKind, string> = {
  recipe: '可复现的流程：工具、参数、提示词、产出',
  rule: '必须遵守的约束，人批准才生效',
  fact: '项目信息，会变，需要验证时间',
  reference: '经验、踩坑、零散结论',
};

const STATUS_LABEL: Record<KbStatus, string> = {
  draft: '待审',
  published: '已发布',
  archived: '已归档',
};

type Draft = {
  id: string | null;
  title: string;
  kind: KbKind;
  visibility: 'admin' | 'members';
  summary: string;
  bodyMd: string;
  tool: string;
  prompt: string;
  tags: string;
};

const EMPTY: Draft = {
  id: null,
  title: '',
  kind: 'recipe',
  visibility: 'admin',
  summary: '',
  bodyMd: '',
  tool: '',
  prompt: '',
  tags: '',
};

function toDraft(doc: KbDoc): Draft {
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    visibility: doc.visibility || 'admin',
    summary: doc.summary,
    bodyMd: doc.bodyMd,
    tool: doc.tool,
    prompt: doc.prompt,
    tags: doc.tags.join(', '),
  };
}

export function KnowledgeView() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams] = useSearchParams();
  const docParam = searchParams.get('doc') || '';
  const [tab, setTab] = useState<KbStatus | 'all'>('draft');
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [stats, setStats] = useState<KbStats | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (status: KbStatus | 'all', q: string) => {
    setLoading(true);
    try {
      const res = await kbApi.list({ status: status === 'all' ? '' : status, q });
      setDocs(res.docs);
      setStats(res.stats);
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!docParam) return;
    let cancelled = false;
    kbApi.get(docParam)
      .then((res) => {
        if (cancelled) return;
        setDraft(toDraft(res.doc));
        setTab(res.doc.status);
      })
      .catch(() => {
        if (!cancelled) toast('找不到这条知识库记录。', 'error');
      });
    return () => { cancelled = true; };
  }, [docParam, toast]);

  useEffect(() => { void load(tab, query); }, [tab, load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { void load(tab, query); }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, tab, load]);

  const selected = useMemo(() => docs.find((doc) => doc.id === draft.id) || null, [docs, draft.id]);

  function startNew() {
    setDraft({ ...EMPTY, title: '未命名条目' });
  }

  function openDoc(doc: KbDoc) {
    setDraft(toDraft(doc));
  }

  async function save(status?: KbStatus) {
    if (!draft.title.trim()) {
      toast('标题不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        kind: draft.kind,
        visibility: draft.visibility,
        summary: draft.summary,
        bodyMd: draft.bodyMd,
        tool: draft.tool,
        prompt: draft.prompt,
        tags: draft.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
        ...(status ? { status } : {}),
      };
      if (draft.id) {
        const res = await kbApi.update(draft.id, payload);
        setDraft(toDraft(res.doc));
      } else {
        const res = await kbApi.create(payload);
        setDraft(toDraft(res.doc));
      }
      await load(tab, query);
      toast(status === 'published' ? '已发布，AI 现在能检索到它' : '已保存', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function approve(doc: KbDoc) {
    try {
      await kbApi.setStatus(doc.id, 'published');
      await load(tab, query);
      toast('已通过，进入检索', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function archive(doc: KbDoc) {
    try {
      await kbApi.setStatus(doc.id, 'archived');
      await load(tab, query);
      if (draft.id === doc.id) setDraft(EMPTY);
      toast('已归档', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function remove(doc: KbDoc) {
    const ok = await confirm({
      title: '删除这条知识？',
      message: `「${doc.title}」会被永久删除，AI 之后也检索不到。`,
      confirmText: '删除',
    });
    if (!ok) return;
    try {
      await kbApi.remove(doc.id);
      if (draft.id === doc.id) setDraft(EMPTY);
      await load(tab, query);
      toast('已删除', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function showToken() {
    try {
      const res = await kbApi.token();
      setToken(res.token);
      setTokenOpen(true);
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function rotateToken() {
    try {
      const res = await kbApi.rotateToken();
      setToken(res.token);
      toast('已换新 token，旧的要重新配到 Codex', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  return (
    <div className="kb">
      <header className="kb-head">
        <div>
          <h1><BookOpen size={20} /> AI 知识库</h1>
          <p>只有管理员可见。已发布的条目会被 AI 检索；待审的不会。</p>
        </div>
        <div className="kb-head-actions">
          <button type="button" className="btn ghost" onClick={() => void showToken()}>
            <KeyRound size={15} /> 接口 token
          </button>
          <button type="button" className="btn primary" onClick={startNew}>
            <Plus size={15} /> 新建条目
          </button>
        </div>
      </header>

      {tokenOpen ? (
        <div className="kb-token">
          <div className="kb-token-row">
            <code>{token}</code>
            <button
              type="button"
              className="btn ghost sm"
              onClick={async () => {
                const ok = await copyText(token);
                toast(ok ? '已复制' : '复制失败，请手动选中复制', ok ? 'success' : 'error');
              }}
            >
              <Copy size={13} /> 复制
            </button>
            <button type="button" className="btn ghost sm" onClick={() => void rotateToken()}>换一个</button>
            <button type="button" className="btn ghost sm" onClick={() => setTokenOpen(false)}><X size={13} /> 关闭</button>
          </div>
          <p className="kb-hint">把它填到 Codex 的 MCP 配置里（<code>DEVFORGE_KB_TOKEN</code>），AI 就能检索和提交草稿。</p>
        </div>
      ) : null}

      <div className="kb-tabs">
        {(['draft', 'published', 'archived', 'all'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={cn('kb-tab', tab === key && 'is-active')}
            onClick={() => setTab(key)}
          >
            {key === 'all' ? '全部' : STATUS_LABEL[key]}
            <span className="kb-tab-count">
              {key === 'all' ? stats?.total ?? 0 : stats?.[key] ?? 0}
            </span>
          </button>
        ))}
        <div className="kb-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜标题、正文、提示词、标签"
          />
        </div>
      </div>

      <div className="kb-body">
        <div className="kb-list">
          {loading ? <div className="kb-empty"><Loader2 size={16} className="spin" /> 加载中…</div> : null}
          {!loading && !docs.length ? (
            <div className="kb-empty">
              <Inbox size={18} />
              <span>{tab === 'draft' ? '收件箱空的，AI 提交的草稿会出现在这里' : '还没有条目'}</span>
            </div>
          ) : null}
          {docs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={cn('kb-item', draft.id === doc.id && 'is-active')}
              onClick={() => openDoc(doc)}
            >
              <div className="kb-item-top">
                <span className={cn('kb-kind', `kb-kind-${doc.kind}`)}>{KIND_LABEL[doc.kind]}</span>
                <span className="kb-item-title">{doc.title}</span>
              </div>
              {doc.summary ? <p className="kb-item-sum">{doc.summary.slice(0, 80)}</p> : null}
              <div className="kb-item-meta">
                {doc.tool ? <span>{doc.tool}</span> : null}
                <span>{formatRelativeTime(doc.updatedAt)}</span>
                {doc.source ? <span>· {doc.source}</span> : null}
              </div>
            </button>
          ))}
        </div>

        <div className="kb-detail">
          {!draft.id && !draft.title ? (
            <div className="kb-empty big">
              <BookOpen size={26} />
              <p>左边选一条，或者点「新建条目」。</p>
              <p className="kb-hint">
                配方写「怎么做到」：工具 → 参数 → 提示词 → 产出长什么样。<br />
                能用一句话复现的，才算合格。
              </p>
            </div>
          ) : (
            <div className="kb-form">
              <div className="kb-row">
                <input
                  className="kb-title-input"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="条目标题，例如：像素风角色立绘生成流程"
                />
                <select
                  value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value as KbKind })}
                >
                  {(Object.keys(KIND_LABEL) as KbKind[]).map((kind) => (
                    <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
                  ))}
                </select>
                <select
                  value={draft.visibility}
                  onChange={(event) => setDraft({ ...draft, visibility: event.target.value as 'admin' | 'members' })}
                  title="谁可以看到这条知识"
                >
                  <option value="admin">仅管理员</option>
                  <option value="members">成员可见</option>
                </select>
              </div>
              <p className="kb-hint">{KIND_HINT[draft.kind]}</p>

              <label className="kb-field">
                <span>一句话摘要</span>
                <input
                  value={draft.summary}
                  onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                  placeholder="AI 检索时先看这句，写清楚适用场景"
                />
              </label>

              <div className="kb-row two">
                <label className="kb-field">
                  <span>工具链</span>
                  <input
                    value={draft.tool}
                    onChange={(event) => setDraft({ ...draft, tool: event.target.value })}
                    placeholder="豆包 / ComfyUI / Blender 5.2"
                  />
                </label>
                <label className="kb-field">
                  <span>标签</span>
                  <input
                    value={draft.tags}
                    onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                    placeholder="像素, 立绘, 特效"
                  />
                </label>
              </div>

              <label className="kb-field">
                <span>可复用提示词</span>
                <textarea
                  value={draft.prompt}
                  onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                  rows={3}
                  placeholder="直接能粘贴到工具里的那段"
                />
              </label>

              <label className="kb-field grow">
                <span>正文（Markdown）</span>
                <textarea
                  value={draft.bodyMd}
                  onChange={(event) => setDraft({ ...draft, bodyMd: event.target.value })}
                  rows={10}
                  placeholder={'## 步骤\n1. …\n\n## 参数\n- …\n\n## 产出\n…'}
                />
              </label>

              <div className="kb-actions">
                <button type="button" className="btn" disabled={saving} onClick={() => void save()}>
                  {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} 保存草稿
                </button>
                <button type="button" className="btn primary" disabled={saving} onClick={() => void save('published')}>
                  保存并发布
                </button>
                {selected?.status === 'draft' ? (
                  <button type="button" className="btn ghost" onClick={() => void approve(selected)}>
                    <Check size={14} /> 通过（进入检索）
                  </button>
                ) : null}
                {selected ? (
                  <>
                    <button type="button" className="btn ghost" onClick={() => void archive(selected)}>
                      <Inbox size={14} /> 归档
                    </button>
                    <button type="button" className="btn ghost danger" onClick={() => void remove(selected)}>
                      <Trash2 size={14} /> 删除
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
