import { useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { ExternalLink, Link2, Play } from 'lucide-react';

function normalizeUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function embedInfo(value: string): { type: 'iframe' | 'video' | 'link'; src: string; label: string } | null {
  const url = normalizeUrl(value);
  if (!url) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  const youtubeId = (() => {
    if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0];
    if (host.endsWith('youtube.com')) {
      if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
      const match = parsed.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/);
      if (match) return match[1];
    }
    return '';
  })();
  if (youtubeId) {
    return {
      type: 'iframe',
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}`,
      label: 'YouTube',
    };
  }

  if (host.endsWith('bilibili.com')) {
    const bvid = parsed.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1] || parsed.searchParams.get('bvid');
    if (bvid) {
      return {
        type: 'iframe',
        src: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&autoplay=0`,
        label: '哔哩哔哩',
      };
    }
  }

  if (host.endsWith('vimeo.com')) {
    const id = parsed.pathname.split('/').filter(Boolean).pop();
    if (id && /^\d+$/.test(id)) {
      return {
        type: 'iframe',
        src: `https://player.vimeo.com/video/${id}`,
        label: 'Vimeo',
      };
    }
  }

  if (/\.(mp4|webm|ogv|mov)(?:$|\?)/i.test(parsed.pathname + parsed.search)) {
    return { type: 'video', src: url, label: '视频文件' };
  }

  return { type: 'link', src: url, label: host };
}

function EmbedRenderer({ block, editor }: { block: any; editor: any }) {
  const current = String((block.props as Record<string, unknown>).url || '');
  const [value, setValue] = useState(current);
  const [editing, setEditing] = useState(!current);
  const info = embedInfo(current);
  const writable = editor.isEditable !== false;

  function commit() {
    const next = normalizeUrl(value);
    if (!next) return;
    editor.updateBlock(block, { props: { url: next } });
    setEditing(false);
  }

  if (writable && editing) {
    return (
      <div className="embed-block is-editing" contentEditable={false}>
        <div className="embed-head">
          <span><Link2 size={14} /> 视频嵌入</span>
          <em>B 站 / YouTube / Vimeo / MP4</em>
        </div>
        <div className="embed-form">
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              }
            }}
            placeholder="粘贴视频链接，例如 https://www.bilibili.com/video/BV..."
            spellCheck={false}
          />
          <button type="button" onClick={commit} disabled={!value.trim()}>
            <Play size={14} /> 嵌入
          </button>
        </div>
        {current ? (
          <button type="button" className="embed-cancel" onClick={() => setEditing(false)}>取消</button>
        ) : null}
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="embed-block" contentEditable={false}>
      {info?.type === 'video' ? (
        <video src={info.src} controls preload="metadata" className="embed-video" />
      ) : info?.type === 'iframe' ? (
        <iframe
          src={info.src}
          title={info.label}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <a className="embed-link-card" href={info?.src || current} target="_blank" rel="noreferrer">
          <span className="embed-link-icon"><ExternalLink size={18} /></span>
          <span>
            <strong>{info?.label || '外部链接'}</strong>
            <em>{current}</em>
          </span>
          <ExternalLink size={15} />
        </a>
      )}
      <div className="embed-foot">
        <span>{info?.label || '链接'}</span>
        {writable ? (
          <button type="button" onClick={() => { setValue(current); setEditing(true); }}>更换链接</button>
        ) : null}
      </div>
    </div>
  );
}

export const EmbedBlock = createReactBlockSpec(
  {
    type: 'embed',
    content: 'none',
    propSchema: {
      url: { default: '' },
    },
  },
  {
    render: ({ block, editor }) => <EmbedRenderer block={block} editor={editor} />,
  },
);
