import test from 'node:test';
import assert from 'node:assert/strict';
import {
  averageAvailableScores,
  moveSubjectInOrder,
  sortSubjectsByReportOrder
} from './reportCardCalculations.ts';

test('averageAvailableScores ignores terms with no scores but includes entered zero scores', () => {
  assert.equal(averageAvailableScores([80, null, undefined]), 80);
  assert.equal(averageAvailableScores([0, null]), 0);
  assert.equal(averageAvailableScores([null, undefined]), null);
});

test('sortSubjectsByReportOrder applies level order and leaves newly added subjects after ordered entries', () => {
  const subjects = [
    { id: 1, name: 'Math', code: 'MTH', category: 'CORE' as const, applicableLevel: 'BOTH' as const },
    { id: 2, name: 'English', code: 'ENG', category: 'CORE' as const, applicableLevel: 'JUNIOR' as const },
    { id: 3, name: 'Physics', code: 'PHY', category: 'CORE' as const, applicableLevel: 'SENIOR' as const }
  ];
  const order = { JUNIOR: [2, 1], SENIOR: [3] };

  assert.deepEqual(
    sortSubjectsByReportOrder(subjects.filter(subject => subject.applicableLevel !== 'SENIOR'), 'JUNIOR', order)
      .map(subject => subject.id),
    [2, 1]
  );
  assert.deepEqual(sortSubjectsByReportOrder(subjects, 'SENIOR', order).map(subject => subject.id), [3, 1, 2]);
});

test('moveSubjectInOrder moves a dragged item to the drop target without losing other subjects', () => {
  assert.deepEqual(moveSubjectInOrder([1, 2, 3, 4], 1, 3), [2, 3, 1, 4]);
  assert.deepEqual(moveSubjectInOrder([1, 2, 3, 4], 3, 1), [3, 1, 2, 4]);
  assert.deepEqual(moveSubjectInOrder([1, 2], 9, 2), [1, 2]);
});
