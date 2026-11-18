import type { StudentTermSummary, UserRole } from '../types/index';

const SCHOOLWIDE_COMMENT_ROLES: UserRole[] = [
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'HEAD_OF_SCHOOLS'
];

export function canAccessStudentComments(role: UserRole, hasAssignedFormClass: boolean): boolean {
  return SCHOOLWIDE_COMMENT_ROLES.includes(role) ||
    (role === 'CLASS_TEACHER' && hasAssignedFormClass);
}

export function preserveTeacherRemarksForSuperAdmin(
  currentSummaries: StudentTermSummary[],
  submittedSummaries: StudentTermSummary[]
): StudentTermSummary[] {
  const keyFor = (summary: StudentTermSummary) =>
    `${summary.studentId}:${summary.sectionId}:${summary.termId}`;
  const existingRemarks = new Map(
    currentSummaries.map(summary => [keyFor(summary), summary.teacherRemark])
  );

  return submittedSummaries.map(summary => ({
    ...summary,
    teacherRemark: existingRemarks.get(keyFor(summary)) || ''
  }));
}

export function preserveStudentCommentsForSubjectTeacher(
  currentSummaries: StudentTermSummary[],
  submittedSummaries: StudentTermSummary[]
): StudentTermSummary[] {
  const keyFor = (summary: StudentTermSummary) =>
    `${summary.studentId}:${summary.sectionId}:${summary.termId}`;
  const existingComments = new Map(
    currentSummaries.map(summary => [
      keyFor(summary),
      { principalRemark: summary.principalRemark, teacherRemark: summary.teacherRemark }
    ])
  );

  return submittedSummaries.map(summary => {
    const comments = existingComments.get(keyFor(summary));
    return {
      ...summary,
      principalRemark: comments?.principalRemark || '',
      teacherRemark: comments?.teacherRemark || ''
    };
  });
}
