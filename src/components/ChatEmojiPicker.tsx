import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';

const GROUPS = [
  {
    id: 'smile',
    label: '表情',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖'],
  },
  {
    id: 'gesture',
    label: '手势',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💅', '🤳', '💪', '🦾', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'],
  },
  {
    id: 'game',
    label: '游戏',
    emojis: ['🎮', '🕹️', '🎲', '🎯', '🎰', '🧩', '♟️', '🎴', '🃏', '🀄', '🎭', '🎨', '🖌️', '🖍️', '📐', '📏', '✏️', '🖊️', '🖋️', '💻', '🖥️', '⌨️', '🖱️', '🕸️', '🧱', '⚙️', '🔧', '🔨', '🛠️', '⚔️', '🛡️', '🏹', '🪄', '🔮', '🧪', '⚗️', '🧬', '🚀', '🛸', '👾', '🤖', '🎃', '💎', '🗝️', '🔑', '🗺️', '🧭', '⛺', '🏰', '🌋'],
  },
  {
    id: 'life',
    label: '日常',
    emojis: ['☕', '🍵', '🧋', '🥤', '🍺', '🍻', '🍷', '🥂', '🍜', '🍲', '🍚', '🍙', '🍣', '🍕', '🍔', '🍟', '🍰', '🍩', '🍪', '🍫', '🍎', '🍊', '🍋', '🍉', '🥑', '🥦', '🌶️', '🌙', '☀️', '⭐', '✨', '🔥', '💧', '🌈', '❄️', '🌊', '🌱', '🌿', '🍀', '🌸', '🌻', '🌹', '🪴', '🏡', '🛋️', '🪑', '🕯️', '📚', '📖', '📝', '💡', '🔔', '📌', '📎'],
  },
  {
    id: 'symbol',
    label: '符号',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '✅', '❌', '⚠️', '❓', '❗', '💯', '🔥', '💥', '💫', '⭐', '🌟', '✨', '⚡', '☑️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🔶', '🔷', '🔸', '🔹', '©️', '®️', '™️'],
  },
];

export function ChatEmojiPicker({ onPick, disabled = false }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(GROUPS[0].id);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 296;
      const height = 318;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
      const top = rect.top > height + 12 ? rect.top - height - 8 : rect.bottom + 8;
      setPosition({ left, top });
    };
    update();
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      if (buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = GROUPS.find((item) => item.id === group) || GROUPS[0];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="emoji-trigger"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-label="插入 emoji"
        title="插入 emoji"
      >
        <Smile size={18} />
      </button>
      {open ? (
        <div className="emoji-popover" ref={panelRef} style={{ left: position.left, top: position.top }} role="dialog" aria-label="选择 emoji">
          <div className="emoji-tabs">
            {GROUPS.map((item) => (
              <button key={item.id} type="button" className={item.id === active.id ? 'is-active' : ''} onClick={() => setGroup(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="emoji-grid">
            {active.emojis.map((emoji, index) => (
              <button
                key={`${active.id}-${index}-${emoji}`}
                type="button"
                className="emoji-cell"
                onClick={() => {
                  onPick(emoji);
                  setOpen(false);
                }}
                aria-label={`插入 ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="emoji-foot">系统原生 emoji · 免费 · 不需要外部资源</div>
        </div>
      ) : null}
    </>
  );
}
