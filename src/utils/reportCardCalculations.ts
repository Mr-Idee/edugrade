import { LevelType, ReportCardSubjectOrder, Subject } from '../types/index';

export function averageAvailableScores(scores: Array<number | null | undefined>): number | null {
  const enteredScores = scores.filter((score): score is number => score !== null && score !== undefined);
  if (enteredScores.length === 0) return null;
  return Number(
    (enteredScores.reduce((total, score) => total + score, 0) / enteredScores.length).toFixed(1)
  );
}

export function sortSubjectsByReportOrder(
  subjects: Subject[],
  level: LevelType,
  order: ReportCardSubjectOrder
): Subject[] {
  const positions = new Map(order[level].map((subjectId, index) => [subjectId, index]));
  return subjects
    .map((subject, originalIndex) => ({ subject, originalIndex }))
    .sort((left, right) => {
      const leftPosition = positions.get(left.subject.id);
      const rightPosition = positions.get(right.subject.id);
      if (leftPosition !== undefined || rightPosition !== undefined) {
        if (leftPosition === undefined) return 1;
        if (rightPosition === undefined) return -1;
        if (leftPosition !== rightPosition) return leftPosition - rightPosition;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(entry => entry.subject);
}

export function moveSubjectInOrder(
  subjectIds: number[],
  draggedSubjectId: number,
  targetSubjectId: number
): number[] {
  const sourceIndex = subjectIds.indexOf(draggedSubjectId);
  const targetIndex = subjectIds.indexOf(targetSubjectId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return subjectIds;
  const reordered = [...subjectIds];
  reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, draggedSubjectId);
  return reordered;
}
