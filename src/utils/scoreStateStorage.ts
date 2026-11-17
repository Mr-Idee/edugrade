import type { FullDatabaseSnapshot } from './sqlExportGenerator.ts';
import { areOfflineValuesEqual } from './offlineSyncEngine.ts';

export type ScoreStateRecordType = 'scores' | 'termSubjectRecords' | 'termSummaries';

export interface ScoreStateRecordChange {
  recordType: ScoreStateRecordType;
  recordKey: string;
  recordJson: object;
}

export interface ScoreStateRecordDelete {
  recordType: ScoreStateRecordType;
  recordKey: string;
}

function recordKey(parts: Array<number | string>): string {
  return parts.join(':');
}

export function collectRecordChanges<T extends object>(
  recordType: ScoreStateRecordType,
  previous: T[],
  current: T[],
  getKey: (record: T) => string
): { upserts: ScoreStateRecordChange[]; deletes: ScoreStateRecordDelete[] } {
  const previousByKey = new Map(previous.map(record => [getKey(record), record]));
  const currentByKey = new Map(current.map(record => [getKey(record), record]));
  const upserts = current
    .filter(record => {
      const previousRecord = previousByKey.get(getKey(record));
      return !previousRecord || !areOfflineValuesEqual(previousRecord, record);
    })
    .map(record => ({
      recordType,
      recordKey: getKey(record),
      recordJson: record
    }));
  const deletes = previous
    .filter(record => !currentByKey.has(getKey(record)))
    .map(record => ({ recordType, recordKey: getKey(record) }));
  return { upserts, deletes };
}

export function collectScoreStateChanges(
  previous: FullDatabaseSnapshot,
  current: FullDatabaseSnapshot
): { upserts: ScoreStateRecordChange[]; deletes: ScoreStateRecordDelete[] } {
  const scores = collectRecordChanges(
    'scores',
    previous.scores,
    current.scores,
    score => recordKey([score.studentId, score.subjectId, score.componentId])
  );
  const termSubjectRecords = collectRecordChanges(
    'termSubjectRecords',
    previous.termSubjectRecords,
    current.termSubjectRecords,
    record => recordKey([record.studentId, record.subjectId, record.termId])
  );
  const termSummaries = collectRecordChanges(
    'termSummaries',
    previous.termSummaries,
    current.termSummaries,
    summary => recordKey([summary.studentId, summary.sectionId, summary.termId])
  );
  return {
    upserts: [...scores.upserts, ...termSubjectRecords.upserts, ...termSummaries.upserts],
    deletes: [...scores.deletes, ...termSubjectRecords.deletes, ...termSummaries.deletes]
  };
}

export function areNonScoreSnapshotValuesEqual(
  previous: FullDatabaseSnapshot,
  current: FullDatabaseSnapshot
): boolean {
  const {
    scores: _previousScores,
    termSubjectRecords: _previousTermSubjectRecords,
    termSummaries: _previousTermSummaries,
    auditLogs: _previousAuditLogs,
    ...previousOtherValues
  } = previous;
  const {
    scores: _currentScores,
    termSubjectRecords: _currentTermSubjectRecords,
    termSummaries: _currentTermSummaries,
    auditLogs: _currentAuditLogs,
    ...currentOtherValues
  } = current;
  return areOfflineValuesEqual(previousOtherValues, currentOtherValues);
}
