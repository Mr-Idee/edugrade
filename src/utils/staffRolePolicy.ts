import type { ClassSection, Subject, TeacherSubjectAssignment, UserRole } from '../types/index';

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

export function resolveTeacherScoreSelection(
  assignments: readonly TeacherSubjectAssignment[] | undefined,
  sections: readonly Pick<ClassSection, 'id' | 'levelType'>[],
  subjects: readonly Subject[],
  currentSectionId: number,
  currentSubjectId: number
): TeacherSubjectAssignment | undefined {
  const validAssignments = (assignments || []).filter(assignment => {
    const section = sections.find(item => Number(item.id) === Number(assignment.sectionId));
    const subject = subjects.find(item => Number(item.id) === Number(assignment.subjectId));
    if (!section || !subject) return false;
    return subject.applicableLevel === 'BOTH' || subject.applicableLevel === section.levelType;
  });

  return validAssignments.find(
    assignment =>
      Number(assignment.sectionId) === Number(currentSectionId) &&
      Number(assignment.subjectId) === Number(currentSubjectId)
  ) || validAssignments[0];
}

export function getStaffVisibleToUser<T extends { id: number; username?: string }>(
  teachers: readonly T[],
  user: { id: number; username?: string },
  hasFullStaffAccess: boolean
): T[] {
  if (hasFullStaffAccess) return [...teachers];
  const teacher = findTeacherForUser(teachers, user);
  return teacher ? [teacher] : [];
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
