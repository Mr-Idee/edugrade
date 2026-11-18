import type { UserRole } from '../types/index';

export function findTeacherForUser<T extends { id: number; username?: string }>(
  teachers: readonly T[],
  user: { id: number; username?: string }
): T | undefined {
  const username = user.username?.trim().toLowerCase();
  if (username) {
    return teachers.find(teacher => teacher.username?.trim().toLowerCase() === username);
  }
  return teachers.find(teacher => Number(teacher.id) === Number(user.id));
}

export function getAssignableStaffRoles(actorRole: UserRole): UserRole[] {
  const teachingRoles: UserRole[] = ['CLASS_TEACHER', 'SUBJECT_TEACHER'];
  if (actorRole === 'SUPER_ADMIN') {
    return ['HEAD_OF_SCHOOLS', 'PRINCIPAL', 'VICE_PRINCIPAL', ...teachingRoles];
  }
  if (actorRole === 'HEAD_OF_SCHOOLS') {
    return ['PRINCIPAL', 'VICE_PRINCIPAL', ...teachingRoles];
  }
  if (actorRole === 'PRINCIPAL') {
    return ['VICE_PRINCIPAL', ...teachingRoles];
  }
  if (actorRole === 'VICE_PRINCIPAL') return teachingRoles;
  return [];
}

export function canAssignStaffRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return getAssignableStaffRoles(actorRole).includes(targetRole);
}
