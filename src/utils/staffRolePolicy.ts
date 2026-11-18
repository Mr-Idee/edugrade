import type { ClassSection, Subject, TeacherSubjectAssignment, UserRole } from '../types/index';

type TeacherAssignmentSnapshot = {
  teachers: readonly {
    id: number;
    assignedSubjects?: readonly TeacherSubjectAssignment[];
  }[];
  classSections: readonly Pick<ClassSection, 'id' | 'levelType'>[];
  subjects: readonly Pick<Subject, 'id' | 'applicableLevel'>[];
};

export interface TeacherSubjectAssignmentIssue {
  teacherId: number;
  sectionId: number;
  subjectId: number;
  reason: 'section-not-found' | 'subject-not-found' | 'level-mismatch';
}

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

export function isSubjectApplicableToSection(
  subject: Pick<Subject, 'applicableLevel'>,
  section: Pick<ClassSection, 'levelType'>
): boolean {
  return subject.applicableLevel === 'BOTH' || subject.applicableLevel === section.levelType;
}

function getInvalidTeacherSubjectAssignments(
  snapshot: TeacherAssignmentSnapshot | undefined
): TeacherSubjectAssignmentIssue[] {
  if (!snapshot) return [];

  const sections = new Map(snapshot.classSections.map(section => [Number(section.id), section]));
  const subjects = new Map(snapshot.subjects.map(subject => [Number(subject.id), subject]));
  const issues: TeacherSubjectAssignmentIssue[] = [];

  for (const teacher of snapshot.teachers) {
    for (const assignment of teacher.assignedSubjects || []) {
      const sectionId = Number(assignment.sectionId);
      const subjectId = Number(assignment.subjectId);
      const section = sections.get(sectionId);
      const subject = subjects.get(subjectId);
      const reason = !Number.isSafeInteger(sectionId) || sectionId <= 0 || !section
        ? 'section-not-found'
        : !Number.isSafeInteger(subjectId) || subjectId <= 0 || !subject
          ? 'subject-not-found'
          : isSubjectApplicableToSection(subject, section)
            ? undefined
            : 'level-mismatch';

      if (reason) issues.push({ teacherId: teacher.id, sectionId, subjectId, reason });
    }
  }

  return issues;
}

function assignmentIssueKey(
  issue: TeacherSubjectAssignmentIssue,
  snapshot: TeacherAssignmentSnapshot | undefined
): string {
  const sectionLevel = snapshot?.classSections.find(
    section => Number(section.id) === issue.sectionId
  )?.levelType || 'UNKNOWN';
  const subjectLevel = snapshot?.subjects.find(
    subject => Number(subject.id) === issue.subjectId
  )?.applicableLevel || 'UNKNOWN';
  return [
    issue.teacherId,
    issue.sectionId,
    issue.subjectId,
    issue.reason,
    sectionLevel,
    subjectLevel
  ].join(':');
}

export function findNewInvalidTeacherSubjectAssignments(
  previous: TeacherAssignmentSnapshot | undefined,
  next: TeacherAssignmentSnapshot
): TeacherSubjectAssignmentIssue[] {
  const previousIssues = new Set(
    getInvalidTeacherSubjectAssignments(previous).map(issue =>
      assignmentIssueKey(issue, previous)
    )
  );
  return getInvalidTeacherSubjectAssignments(next).filter(
    issue => !previousIssues.has(assignmentIssueKey(issue, next))
  );
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
    return isSubjectApplicableToSection(subject, section);
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
