import assert from 'node:assert/strict';
import test from 'node:test';
import { determineGrade } from './academicCalculations';
import { calculateStudentCommentScores } from './studentCommentCalculations';

test('student comment scores exclude omitted subjects and calculate CA and overall average', () => {
  const result = calculateStudentCommentScores(
    [
      { isIncluded: true, ca1Score: 10, ca2Score: 12, totalScore: 82 },
      { isIncluded: true, ca1Score: 15, ca2Score: 14, totalScore: 94 },
      { isIncluded: false, ca1Score: 15, ca2Score: 15, totalScore: 100 }
    ],
    'SENIOR',
    30
  );

  assert.deepEqual(result, {
    caTotal: 51,
    caMaximum: 60,
    totalAverage: 88,
    totalGrade: determineGrade(88, 'SENIOR').grade
  });
});

test('student comment scores report no average or grade when no subjects are included', () => {
  assert.deepEqual(
    calculateStudentCommentScores(
      [{ isIncluded: false, ca1Score: 0, ca2Score: 0, totalScore: 0 }],
      'JUNIOR',
      40
    ),
    { caTotal: 0, caMaximum: 0, totalAverage: null, totalGrade: '—' }
  );
});
