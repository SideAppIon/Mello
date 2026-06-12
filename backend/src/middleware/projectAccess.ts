import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { queryOne } from '../db';

export interface ProjectMember {
  role: string;
  project_id: string;
}

export interface ProjectRequest extends AuthRequest {
  projectMember?: ProjectMember;
  projectId?: string;
}

export async function requireProjectAccess(req: ProjectRequest, res: Response, next: NextFunction) {
  const projectId = req.params.projectId || req.params.id;
  if (!projectId || !req.user) return res.status(401).json({ error: 'Unauthorized' });

  // Company admin has access to all projects in their company
  if (req.user.role === 'admin') {
    const project = await queryOne('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, req.user.company_id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    req.projectMember = { role: 'admin', project_id: projectId };
    req.projectId = projectId;
    return next();
  }

  const member = await queryOne<ProjectMember>(
    'SELECT role, project_id FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, req.user.id]
  );
  if (!member) return res.status(403).json({ error: 'No access to this project' });
  req.projectMember = member;
  req.projectId = projectId;
  next();
}

export function requireProjectRole(...roles: string[]) {
  return (req: ProjectRequest, res: Response, next: NextFunction) => {
    if (!req.projectMember || !roles.includes(req.projectMember.role)) {
      return res.status(403).json({ error: 'Insufficient project permissions' });
    }
    next();
  };
}
