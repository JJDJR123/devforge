import { cn } from '../utils';

export const EMOJI_OPTIONS = [
  '🎮', '🕹️', '👾', '🚀', '🧪', '🧩', '🛠️', '🎨',
  '🖌️', '🎧', '🗺️', '🧭', '📦', '💡', '🔥', '⚡',
  '🌱', '🏗️', '📐', '🧠', '📝', '📌', '🗂️', '📁',
  '🪄', '🐛', '🧱', '🎯', '🏆', '☕', '🌙', '💾',
];

export function EmojiPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (emoji: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn('emoji-picker', compact && 'is-compact')} role="listbox" aria-label="选择图标">
      {EMOJI_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="option"
          aria-selected={value === emoji}
          className={cn('emoji-option', value === emoji && 'is-active')}
          onClick={() => onChange(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
