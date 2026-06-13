import { useEffect, useState } from 'react';
import { boardsApi, projectsApi } from '../api/client';
import { ProjectMember, ROLE_LABELS } from '../types';
import Modal from './Modal';
import Avatar from './Avatar';

interface Props {
  projectId: string;
  boardId: string;
  onClose: () => void;
}

export default function BoardAccessModal({ projectId, boardId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [isRestricted, setIsRestricted] = useState(false);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<ProjectMember[]>([]);

  useEffect(() => {
    Promise.all([
      projectsApi.get(projectId),
      boardsApi.getAccess(projectId, boardId),
    ]).then(([project, access]) => {
      setMembers(project.members || []);
      setIsRestricted(access.is_restricted);
      setMemberIds(new Set(access.member_ids));
    }).finally(() => setLoading(false));
  }, [projectId, boardId]);

  const toggleRestricted = async () => {
    const v = !isRestricted;
    setIsRestricted(v);
    await boardsApi.update(projectId, boardId, { is_restricted: v });
  };

  const toggleMember = async (userId: string) => {
    const next = new Set(memberIds);
    if (next.has(userId)) {
      next.delete(userId);
      setMemberIds(next);
      await boardsApi.removeMember(projectId, boardId, userId);
    } else {
      next.add(userId);
      setMemberIds(next);
      await boardsApi.addMember(projectId, boardId, userId);
    }
  };

  // Админы/менеджеры проекта всегда имеют доступ — их не нужно отмечать
  const privileged = (m: ProjectMember) => ['admin', 'manager'].includes(m.project_role);

  return (
    <Modal onClose={onClose} title="Доступ к доске" size="sm">
      <div className="p-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Ограничить доступ</p>
                <p className="text-sm text-gray-400">Только выбранные увидят доску</p>
              </div>
              <button
                onClick={toggleRestricted}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${isRestricted ? 'bg-brand-500' : 'bg-gray-200'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${isRestricted ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {isRestricted && (
              <div className="border-t border-gray-100 pt-3 space-y-1 max-h-72 overflow-y-auto">
                {members.map(m => {
                  const always = privileged(m);
                  const checked = always || memberIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 px-2 py-2 rounded-lg ${always ? 'opacity-60' : 'hover:bg-gray-50 cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={always}
                        onChange={() => !always && toggleMember(m.id)}
                        className="w-4 h-4 accent-brand-500"
                      />
                      <Avatar name={m.full_name} color={m.avatar_color} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{m.full_name}</p>
                        <p className="text-xs text-gray-400">{always ? `${ROLE_LABELS[m.project_role]} · доступ всегда` : m.email}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
