import { cn, initials } from '../utils';

export function Avatar({
  name,
  size = 34,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('avatar', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
