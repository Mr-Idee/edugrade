import {
  AssessmentScore,
  Student,
  StudentSubjectEnrollment
} from '../types/index';
import { FullDatabaseSnapshot } from './sqlExportGenerator';

export interface RelationalStudentData {
  students: Student[];
  enrollments: StudentSubjectEnrollment[];
  scores: AssessmentScore[];
}

function preferDatabaseRows<T extends { id: number }>(storedRows: T[], databaseRows: T[]): T[] {
  if (databaseRows.length === 0) return storedRows;
  const storedById = new Map(storedRows.map(row => [row.id, row]));
  return databaseRows.map(row => ({ ...storedById.get(row.id), ...row }));
}

export function reconcileNormalizedStudentData(
  snapshot: FullDatabaseSnapshot,
  relationalData: RelationalStudentData
): FullDatabaseSnapshot {
  return {
    ...snapshot,
    students: preferDatabaseRows(snapshot.students, relationalData.students),
    enrollments: preferDatabaseRows(snapshot.enrollments, relationalData.enrollments),
    scores: preferDatabaseRows(snapshot.scores, relationalData.scores)
  };
}
