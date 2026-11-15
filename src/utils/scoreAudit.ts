import type { ScoreAuditLog, Student } from '../types/index';

const getLegacyStudentId = (studentName: string): number | undefined => {
  const match = /^(?:student\s*#\s*)?(\d+)$/i.exec(studentName.trim());
  if (!match) return undefined;

  const studentId = Number(match[1]);
  return Number.isSafeInteger(studentId) ? studentId : undefined;
};

export function resolveScoreAuditStudentName(log: ScoreAuditLog, students: Student[]): string {
  const studentId = log.studentId ?? getLegacyStudentId(log.studentName);
  const student = studentId === undefined
    ? undefined
    : students.find(candidate => candidate.id === studentId);
  if (student) return student.fullName;

  return getLegacyStudentId(log.studentName) === undefined
    ? log.studentName
    : 'Unknown student';
}
