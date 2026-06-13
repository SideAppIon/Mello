import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, PRIORITY_COLORS } from '../types';
import { useBoardStore } from '../store/board';
import PriorityBadge from './PriorityBadge';
import Avatar from './Avatar';
import { format, isPast, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Props {
  task: Task;
}

export default function TaskCard({ task }: Props) {
  const { openTaskModal } = useBoardStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const deadlineDate = task.deadline ? new Date(task.deadline) : null;
  const deadlineOverdue = deadlineDate && isPast(deadlineDate) && !isToday(deadlineDate);
  const deadlineToday = deadlineDate && isToday(deadlineDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => openTaskModal(task)}
      className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-brand-500/30 transition-all cursor-pointer p-3 group"
    >
      {/* Priority strip */}
      <div
        className="h-0.5 rounded-full mb-2 -mx-3 -mt-3 rounded-t-xl"
        style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
      />

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map(tag => (
            <span
              key={tag.id}
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <p className={`text-sm font-medium leading-snug mb-2 transition-colors flex items-start gap-1.5 ${task.is_completed ? 'text-gray-400 line-through' : 'text-gray-900 group-hover:text-brand-600'}`}>
        {task.is_completed && (
          <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <span>{task.title}</span>
      </p>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <PriorityBadge priority={task.priority} />
          {deadlineDate && (
            <span className={`text-xs flex items-center gap-1 ${deadlineOverdue ? 'text-red-500' : deadlineToday ? 'text-amber-500' : 'text-gray-400'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {format(deadlineDate, 'd MMM', { locale: ru })}
            </span>
          )}
          {task.estimated_hours && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {task.estimated_hours}ч
            </span>
          )}
          {task.subtasks && task.subtasks.length > 0 && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              {task.subtasks.filter(s => s.is_done).length}/{task.subtasks.length}
            </span>
          )}
        </div>
        {task.assignees.length > 0 && (
          <div className="flex -space-x-1">
            {task.assignees.slice(0, 3).map(a => (
              <Avatar key={a.id} name={a.full_name} color={a.avatar_color} size="sm" className="ring-2 ring-white" />
            ))}
            {task.assignees.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-gray-200 ring-2 ring-white flex items-center justify-center text-xs text-gray-600">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
