import type { LevelType } from '../types/index';
import { determineGrade } from './academicCalculations';

export interface StudentCommentScoreEntry {
  isIncluded: boolean;
  ca1Score: number;
  ca2Score: number;
  totalScore: number;
}

export function calculateStudentCommentScores(
  entries: StudentCommentScoreEntry[],
  levelType: LevelType,
  caMaximumPerSubject: number
): {
  caTotal: number;
  caMaximum: number;
  totalAverage: number | null;
  totalGrade: string;
} {
  const includedEntries = entries.filter(entry => entry.isIncluded);
  const caTotal = Number(
    includedEntries.reduce((total, entry) => total + entry.ca1Score + entry.ca2Score, 0).toFixed(1)
  );
  const totalAverage =
    includedEntries.length > 0
      ? Number(
          (
            includedEntries.reduce((total, entry) => total + entry.totalScore, 0) /
            includedEntries.length
          ).toFixed(1)
        )
      : null;

  return {
    caTotal,
    caMaximum: includedEntries.length * caMaximumPerSubject,
    totalAverage,
    totalGrade:
      totalAverage === null ? '—' : determineGrade(totalAverage, levelType).grade
  };
}
