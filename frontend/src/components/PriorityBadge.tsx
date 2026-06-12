import { Priority, PRIORITY_LABELS, PRIORITY_COLORS } from '../types';

interface Props {
  priority: Priority;
  size?: 'sm' | 'md';
}

export default function PriorityBadge({ priority, size = 'sm' }: Props) {
  const color = PRIORITY_COLORS[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
