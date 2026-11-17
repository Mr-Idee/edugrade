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

export interface ScoreStateDelta {
  upserts: ScoreStateRecordChange[];
  deletes: ScoreStateRecordDelete[];
}

function recordKey(parts: Array<number | string>): string {
  return parts.join(':');
}

function getSnapshotRecord(
  snapshot: FullDatabaseSnapshot,
  type: ScoreStateRecordType,
  key: string
): object | undefined {
  switch (type) {
    case 'scores':
      return snapshot.scores.find(
        record => recordKey([record.studentId, record.subjectId, record.componentId]) === key
      );
    case 'termSubjectRecords':
      return snapshot.termSubjectRecords.find(
        record => recordKey([record.studentId, record.subjectId, record.termId]) === key
      );
    case 'termSummaries':
      return snapshot.termSummaries.find(
        record => recordKey([record.studentId, record.sectionId, record.termId]) === key
      );
  }
}

function recordsEqual(left: object | undefined, right: object | undefined): boolean {
  return left === undefined || right === undefined
    ? left === right
    : areOfflineValuesEqual(left, right);
}

export function rebaseScoreStateChanges(
  base: FullDatabaseSnapshot,
  latest: FullDatabaseSnapshot,
  submitted: FullDatabaseSnapshot,
  changes: ScoreStateDelta
): FullDatabaseSnapshot | null {
  const upsertKeys = new Map<string, Set<string>>();
  const deleteKeys = new Map<string, Set<string>>();
  const touched = new Map<ScoreStateRecordType, Set<string>>();

  for (const change of changes.upserts) {
    const typeKey = upsertKeys.get(change.recordType) || new Set<string>();
    typeKey.add(change.recordKey);
    upsertKeys.set(change.recordType, typeKey);
    const touchedKeys = touched.get(change.recordType) || new Set<string>();
    touchedKeys.add(change.recordKey);
    touched.set(change.recordType, touchedKeys);
    if (
      !recordsEqual(
        getSnapshotRecord(latest, change.recordType, change.recordKey),
        getSnapshotRecord(base, change.recordType, change.recordKey)
      ) &&
      !recordsEqual(
        getSnapshotRecord(latest, change.recordType, change.recordKey),
        getSnapshotRecord(submitted, change.recordType, change.recordKey)
      )
    ) {
      return null;
    }
  }

  for (const deletion of changes.deletes) {
    const typeKey = deleteKeys.get(deletion.recordType) || new Set<string>();
    typeKey.add(deletion.recordKey);
    deleteKeys.set(deletion.recordType, typeKey);
    const touchedKeys = touched.get(deletion.recordType) || new Set<string>();
    touchedKeys.add(deletion.recordKey);
    touched.set(deletion.recordType, touchedKeys);
    if (
      !recordsEqual(
        getSnapshotRecord(latest, deletion.recordType, deletion.recordKey),
        getSnapshotRecord(base, deletion.recordType, deletion.recordKey)
      ) &&
      getSnapshotRecord(latest, deletion.recordType, deletion.recordKey) !== undefined
    ) {
      return null;
    }
  }

  const mergeRecords = <T extends object>(
    type: ScoreStateRecordType,
    latestRecords: T[],
    submittedRecords: T[],
    keyForRecord: (record: T) => string
  ): T[] => {
    const keys = touched.get(type) || new Set<string>();
    const deleted = deleteKeys.get(type) || new Set<string>();
    const updated = upsertKeys.get(type) || new Set<string>();
    return [
      ...latestRecords.filter(record => !keys.has(keyForRecord(record))),
      ...submittedRecords.filter(record => {
        const key = keyForRecord(record);
        return updated.has(key) && !deleted.has(key);
      })
    ];
  };

  return {
    ...latest,
    scores: mergeRecords(
      'scores',
      latest.scores,
      submitted.scores,
      record => recordKey([record.studentId, record.subjectId, record.componentId])
    ),
    termSubjectRecords: mergeRecords(
      'termSubjectRecords',
      latest.termSubjectRecords,
      submitted.termSubjectRecords,
      record => recordKey([record.studentId, record.subjectId, record.termId])
    ),
    termSummaries: mergeRecords(
      'termSummaries',
      latest.termSummaries,
      submitted.termSummaries,
      record => recordKey([record.studentId, record.sectionId, record.termId])
    ),
    auditLogs: [
      ...latest.auditLogs,
      ...(submitted.auditLogs || []).filter(
        entry => !latest.auditLogs.some(existing => existing.id === entry.id)
      )
    ]
  };
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
