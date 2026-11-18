import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cloud, Database, RefreshCw, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  areOfflineValuesEqual,
  OfflineConflict,
  OfflineConflictResolution,
  PendingOfflineSnapshot
} from '../utils/offlineSyncEngine';
import { FullDatabaseSnapshot } from '../utils/sqlExportGenerator';

function describeCollection(collection: string): string {
  return collection.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
}

type SnapshotRecord = Record<string, unknown>;

interface OfflineStudentGroup {
  studentId: number;
  studentName: string;
  subjects: Map<number, { subjectName: string; entries: string[] }>;
}

function asRecord(value: unknown): SnapshotRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as SnapshotRecord
    : null;
}

function findChangedRecord(
  snapshot: FullDatabaseSnapshot,
  collection: string,
  recordId: string
): SnapshotRecord | undefined {
  const records = (snapshot as unknown as SnapshotRecord)[collection];
  if (!Array.isArray(records)) return undefined;
  return records.find(record => {
    const item = asRecord(record);
    return item && String(item.id ?? item.studentId ?? item.name) === recordId;
  }) as SnapshotRecord | undefined;
}

function formatScore(value: unknown): string {
  if (value === undefined) return 'not set';
  if (value === null) return 'blank';
  return String(value);
}

function describeConflictValue(
  conflict: OfflineConflict,
  value: unknown,
  lookups: {
    studentsById: Map<number, string>;
    subjectsById: Map<number, string>;
    componentsById: Map<number, string>;
    teachersById: Map<number, string>;
    templatesById: Map<string, { title: string; columns: Map<string, string> }>;
  }
): string {
  if (value === undefined) return 'Record removed';
  const record = asRecord(value);
  if (!record) return String(value);
  if (conflict.collection === 'scores') {
    const studentName = lookups.studentsById.get(Number(record.studentId)) || 'Student name unavailable';
    const subjectName = lookups.subjectsById.get(Number(record.subjectId)) || 'Subject name unavailable';
    const componentName = lookups.componentsById.get(Number(record.componentId)) || 'Assessment item';
    const teacherName = lookups.teachersById.get(Number(record.updatedBy)) || 'Staff member';
    return `${studentName} · ${subjectName} · ${componentName}: ${formatScore(record.score)} · entered by ${teacherName}`;
  }
  if (conflict.collection === 'termSubjectRecords') {
    const studentName = lookups.studentsById.get(Number(record.studentId)) || 'Student name unavailable';
    const subjectName = lookups.subjectsById.get(Number(record.subjectId)) || 'Subject name unavailable';
    return `${studentName} · ${subjectName}: CA1 ${formatScore(record.ca1Score)}, CA2 ${formatScore(record.ca2Score)}, Exam ${formatScore(record.examScore)}, Total ${formatScore(record.totalScore)}`;
  }
  if (conflict.collection === 'customReportTemplates') {
    const template = lookups.templatesById.get(String(record.id));
    return `${template?.title || 'Custom report sheet'} settings or score records changed`;
  }
  const usefulFields = ['fullName', 'name', 'title', 'score', 'isIncluded']
    .filter(key => record[key] !== undefined)
    .map(key => `${describeCollection(key)}: ${String(record[key])}`);
  return usefulFields.length ? usefulFields.join(' · ') : `${describeCollection(conflict.collection)} record changed`;
}

export const OfflineChangesNotice: React.FC = () => {
  const {
    isOnline,
    pendingOfflineSnapshot,
    pendingOfflineDocumentCount,
    offlineConflicts,
    offlineSyncMessage,
    backendStatus,
    commitOfflineChanges,
    openAuthModal,
    currentUser,
    teachers,
    students,
    subjects,
    assessmentComponents,
    customReportTemplates
  } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, OfflineConflictResolution>>({});
  const [autoCommitMessage, setAutoCommitMessage] = useState<string | null>(null);
  const autoAttemptedAt = React.useRef<string | null>(null);
  const hasPendingChanges = Boolean(pendingOfflineSnapshot);
  const queueOwnerMismatch = Boolean(
    pendingOfflineSnapshot?.actorUsername &&
    currentUser.username &&
    pendingOfflineSnapshot.actorUsername.toLowerCase() !== currentUser.username.toLowerCase()
  );
  const canCommit = isOnline &&
    backendStatus.databaseConnected &&
    !pendingOfflineSnapshot?.blockedReason &&
    !queueOwnerMismatch;

  const changeEntries = useMemo(
    () => Object.entries(pendingOfflineSnapshot?.changedAt || {}),
    [pendingOfflineSnapshot]
  );
  const lookups = useMemo(() => ({
    studentsById: new Map(students.map(student => [student.id, student.fullName])),
    subjectsById: new Map(subjects.map(subject => [subject.id, subject.name])),
    componentsById: new Map(assessmentComponents.map(component => [component.id, component.name])),
    teachersById: new Map(teachers.map(teacher => [teacher.id, teacher.fullName])),
    templatesById: new Map(customReportTemplates.map(template => [
      template.id,
      {
        title: template.title,
        columns: new Map(template.columns.map(column => [column.id, column.header]))
      }
    ]))
  }), [assessmentComponents, customReportTemplates, students, subjects, teachers]);

  const groupedChanges = useMemo(() => {
    const queue = pendingOfflineSnapshot as PendingOfflineSnapshot<FullDatabaseSnapshot> | null;
    if (!queue) return { students: [] as OfflineStudentGroup[], other: [] as string[] };
    const groups = new Map<number, OfflineStudentGroup>();
    const other: string[] = [];
    const addStudentChange = (
      studentId: number,
      subjectId: number,
      entry: string,
      actorId?: number
    ) => {
      let group = groups.get(studentId);
      if (!group) {
        group = {
          studentId,
          studentName: lookups.studentsById.get(studentId) || 'Student name unavailable',
          subjects: new Map()
        };
        groups.set(studentId, group);
      }
      let subject = group.subjects.get(subjectId);
      if (!subject) {
        subject = {
          subjectName: lookups.subjectsById.get(subjectId) || 'Subject name unavailable',
          entries: []
        };
        group.subjects.set(subjectId, subject);
      }
      const actor = actorId === undefined
        ? ''
        : ` · recorded by ${lookups.teachersById.get(actorId) || (actorId === currentUser.id ? currentUser.fullName : 'Staff member')}`;
      subject.entries.push(`${entry}${actor}`);
    };

    for (const [key] of changeEntries) {
      const separator = key.lastIndexOf(':');
      const collection = separator < 0 ? key : key.slice(0, separator);
      const recordId = separator < 0 ? key : key.slice(separator + 1);
      const localCollection = (queue.snapshot as unknown as SnapshotRecord)[collection];
      const baseCollection = (queue.baseSnapshot as unknown as SnapshotRecord)[collection];
      const localRecord = findChangedRecord(queue.snapshot, collection, recordId);
      const baseRecord = findChangedRecord(queue.baseSnapshot, collection, recordId);
      const record = localRecord || baseRecord;
      if (collection === 'scores' || collection === 'termSubjectRecords') {
        if (!record) continue;
        const studentId = Number(record.studentId);
        const subjectId = Number(record.subjectId);
        if (!Number.isFinite(studentId) || !Number.isFinite(subjectId)) continue;
        const actorId = typeof record.updatedBy === 'number' ? record.updatedBy : undefined;
        if (collection === 'scores') {
          const componentName = lookups.componentsById.get(Number(record.componentId)) || 'Assessment score';
          const before = baseRecord ? formatScore(baseRecord.score) : 'not set';
          const after = localRecord ? formatScore(localRecord.score) : 'removed';
          addStudentChange(studentId, subjectId, `${componentName}: ${before} → ${after}`, actorId);
        } else {
          const labels: Array<[string, string]> = [
            ['CA1', 'ca1Score'],
            ['CA2', 'ca2Score'],
            ['Exam', 'examScore'],
            ['Total', 'totalScore']
          ];
          const values = labels
            .filter(([, field]) => !areOfflineValuesEqual(baseRecord?.[field], localRecord?.[field]))
            .map(([label, field]) =>
              `${label}: ${baseRecord ? formatScore(baseRecord[field]) : 'not set'} → ${localRecord ? formatScore(localRecord[field]) : 'removed'}`
            );
          if (values.length) addStudentChange(studentId, subjectId, values.join(' · '));
        }
        continue;
      }

      if (collection === 'customReportTemplates' && localRecord && baseRecord) {
        const baseScores = asRecord(baseRecord.studentCustomScores) || {};
        const localScores = asRecord(localRecord.studentCustomScores) || {};
        const columns = lookups.templatesById.get(String(localRecord.id))?.columns;
        let scoreChanges = 0;
        for (const scoreKey of new Set([...Object.keys(baseScores), ...Object.keys(localScores)])) {
          const match = /^(\d+)_(\d+)$/.exec(scoreKey);
          if (!match || areOfflineValuesEqual(baseScores[scoreKey], localScores[scoreKey])) continue;
          const studentId = Number(match[1]);
          const subjectId = Number(match[2]);
          const baseColumns = asRecord(baseScores[scoreKey]) || {};
          const localColumns = asRecord(localScores[scoreKey]) || {};
          for (const columnId of new Set([...Object.keys(baseColumns), ...Object.keys(localColumns)])) {
            if (areOfflineValuesEqual(baseColumns[columnId], localColumns[columnId])) continue;
            const columnName = columns?.get(columnId) || 'Custom field';
            addStudentChange(
              studentId,
              subjectId,
              `${localRecord.title || 'Custom report'} · ${columnName}: ${formatScore(baseColumns[columnId])} → ${formatScore(localColumns[columnId])}`
            );
            scoreChanges += 1;
          }
        }
        if (scoreChanges) continue;
      }

      if (!Array.isArray(localCollection) && !Array.isArray(baseCollection)) {
        other.push(`${describeCollection(collection)} updated`);
        continue;
      }
      const entityName = record
        ? String(record.fullName || record.name || record.title || record.admissionNumber || 'Unnamed record')
        : localRecord
          ? 'Record details unavailable'
          : 'Record removed';
      other.push(`${describeCollection(collection)} · ${entityName}`);
    }

    return {
      students: [...groups.values()].sort((left, right) => left.studentName.localeCompare(right.studentName)),
      other
    };
  }, [changeEntries, currentUser.fullName, currentUser.id, lookups, pendingOfflineSnapshot]);

  useEffect(() => {
    if (!hasPendingChanges) {
      setIsOpen(false);
      setResolutions({});
      autoAttemptedAt.current = null;
      return;
    }
    setAutoCommitMessage(null);
    if (pendingOfflineSnapshot?.requiresUserConfirmation || offlineConflicts.length) setIsOpen(true);
  }, [hasPendingChanges, offlineConflicts, pendingOfflineSnapshot?.requiresUserConfirmation]);

  const handleCommit = useCallback(async () => {
    setIsCommitting(true);
    try {
      const result = await commitOfflineChanges(resolutions);
      if (result.ok) {
        setResolutions({});
        setIsOpen(false);
        setAutoCommitMessage(result.message);
      } else if (result.conflicts?.length) {
        setResolutions({});
        setIsOpen(true);
        setAutoCommitMessage(null);
      } else {
        setAutoCommitMessage(result.message);
      }
    } finally {
      setIsCommitting(false);
    }
  }, [commitOfflineChanges, resolutions]);

  useEffect(() => {
    const updatedAt = pendingOfflineSnapshot?.updatedAt;
    if (
      !updatedAt ||
      !canCommit ||
      isCommitting ||
      offlineConflicts.length ||
      pendingOfflineSnapshot?.requiresUserConfirmation ||
      autoAttemptedAt.current === updatedAt
    ) return;
    autoAttemptedAt.current = updatedAt;
    void handleCommit();
  }, [
    canCommit,
    handleCommit,
    isCommitting,
    offlineConflicts.length,
    pendingOfflineSnapshot?.requiresUserConfirmation,
    pendingOfflineSnapshot?.updatedAt
  ]);

  if (!pendingOfflineSnapshot) {
    return autoCommitMessage
      ? <div role="status" className="fixed bottom-4 right-[calc(5rem_+_env(safe-area-inset-right))] z-[105] max-w-[calc(100vw_-_6.5rem)] rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900 shadow-xl sm:max-w-sm">{autoCommitMessage}</div>
      : null;
  }

  if (queueOwnerMismatch) {
    return (
      <div
        role="status"
        className="fixed bottom-4 right-[calc(5rem_+_env(safe-area-inset-right))] z-[105] max-w-[calc(100vw_-_6.5rem)] rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950 shadow-xl sm:max-w-sm"
      >
        Unsaved changes from another staff account remain on this device. Sign in as the account that recorded them to review or upload.
      </div>
    );
  }

  const allConflictsResolved = offlineConflicts.every(conflict => resolutions[conflict.key]);
  const blockedReason = pendingOfflineSnapshot.blockedReason;
  const queuedActor = teachers.find(
    teacher => teacher.username?.toLowerCase() === pendingOfflineSnapshot.actorUsername?.toLowerCase()
  )?.fullName || (
    currentUser.username?.toLowerCase() === pendingOfflineSnapshot.actorUsername?.toLowerCase()
      ? currentUser.fullName
      : pendingOfflineSnapshot.actorUsername
  );

  return (
    <>
      {!isOpen && (
        <div className="fixed bottom-4 right-[calc(5rem_+_env(safe-area-inset-right))] z-[105] flex max-w-[calc(100vw_-_6.5rem)] items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 shadow-xl sm:right-[calc(6rem_+_env(safe-area-inset-right))] sm:max-w-sm sm:gap-3 sm:p-3">
          <Cloud className="h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-black text-amber-950 sm:text-xs">
              {isCommitting
                ? 'Syncing offline changes…'
                : canCommit
                  ? 'Offline changes need review'
                  : 'Changes saved on this device'}
            </div>
            <div className="text-[10px] text-amber-800 sm:text-[11px]">
              {changeEntries.length + pendingOfflineDocumentCount} pending changes
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="shrink-0 rounded-lg bg-amber-700 px-2 py-1.5 text-[10px] font-bold text-white sm:px-3 sm:text-xs"
          >
            Review
          </button>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="offline-changes-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 bg-slate-900 p-5 text-white">
              <div className="flex gap-3">
                <div className="rounded-xl bg-amber-400/20 p-2 text-amber-300">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="offline-changes-title" className="text-lg font-black">
                    {blockedReason === 'AUTH'
                      ? 'Autosave failed — sign-in required'
                      : blockedReason === 'VALIDATION'
                        ? 'Autosave failed — review rejected records'
                        : queueOwnerMismatch
                          ? 'Sign in as the staff member who made these changes'
                        : pendingOfflineSnapshot.requiresUserConfirmation
                          ? 'Autosave failed — review unsaved changes'
                          : canCommit
                            ? 'Review offline changes'
                            : 'Offline changes are saved locally'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-300">
                    {blockedReason === 'AUTH'
                      ? 'Your changes are stored on this device. Sign in again before uploading them.'
                      : blockedReason === 'VALIDATION'
                        ? 'Your changes are stored on this device. Correct the rejected data before uploading.'
                        : queueOwnerMismatch
                          ? 'These changes remain stored on this device and can only be uploaded by the staff account that recorded them.'
                        : pendingOfflineSnapshot.requiresUserConfirmation
                          ? 'Your changes were not autosaved. Review the named records and explicitly upload them after the latest database state is checked.'
                          : canCommit
                            ? 'Matching values sync automatically. Choose only when offline and database values are genuinely different.'
                            : 'Your entries are stored on this device. The app will offer them for database commit after Supabase availability is confirmed.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close offline changes"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">First offline change</div>
                  <div className="mt-1 text-xs font-bold text-slate-900">
                    {new Date(pendingOfflineSnapshot.startedAt).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">Last saved locally</div>
                  <div className="mt-1 text-xs font-bold text-slate-900">
                    {new Date(pendingOfflineSnapshot.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">Database</div>
                  <div className="mt-1 text-xs font-bold text-slate-900">
                    {backendStatus.databaseConnected ? 'Connected' : 'Not confirmed connected'}
                  </div>
                </div>
              </div>

              {offlineSyncMessage && (
                <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                  {offlineSyncMessage}
                </p>
              )}
              {queuedActor && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  Changes recorded by <strong>{queuedActor}</strong>
                  {pendingOfflineSnapshot.actorUsername && (
                    <span className="text-slate-500"> (@{pendingOfflineSnapshot.actorUsername})</span>
                  )}
                </p>
              )}

              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">
                  Unsaved changes grouped by student ({groupedChanges.students.length})
                </h3>
                {groupedChanges.students.length === 0 && groupedChanges.other.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                    No changed school records. If the database already has the same values, they will be cleared without rewriting them.
                  </p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {groupedChanges.students.map(student => (
                      <article key={student.studentId} className="rounded-xl border border-slate-200 p-3">
                        <h4 className="text-xs font-black text-slate-900">
                          {student.studentName}
                        </h4>
                        <div className="mt-2 space-y-2">
                          {[...student.subjects.entries()].map(([subjectId, subject]) => (
                            <div key={subjectId} className="rounded-lg bg-slate-50 p-2">
                              <div className="text-[11px] font-black text-indigo-900">{subject.subjectName}</div>
                              <ul className="mt-1 space-y-1">
                                {subject.entries.map((entry, index) => (
                                  <li key={`${subjectId}-${index}`} className="text-[10px] leading-relaxed text-slate-700">
                                    {entry}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                    {groupedChanges.other.length > 0 && (
                      <section className="rounded-xl border border-slate-200 p-3">
                        <h4 className="text-xs font-black text-slate-900">Other school records</h4>
                        <ul className="mt-2 space-y-1">
                          {groupedChanges.other.map((entry, index) => (
                            <li key={`${entry}-${index}`} className="text-[11px] text-slate-700">{entry}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                )}
              </div>

              {pendingOfflineDocumentCount > 0 && (
                <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs font-semibold text-indigo-900">
                  {pendingOfflineDocumentCount} document upload or deletion operation(s) will be replayed with the data commit.
                </p>
              )}

              {offlineConflicts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-wide text-rose-700">
                    Different offline and database values need your choice
                  </h3>
                  {offlineConflicts.map(conflict => (
                    <article key={conflict.key} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <div className="flex items-center gap-2 text-xs font-black text-rose-900">
                        <AlertTriangle className="h-4 w-4" />
                        {describeCollection(conflict.collection)}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-white p-2 text-[10px]">
                          <div className="font-black uppercase text-indigo-700">Offline value · {conflict.localTimestamp || 'time unknown'}</div>
                          <div className="mt-1 text-slate-700">{describeConflictValue(conflict, conflict.localValue, lookups)}</div>
                          <button
                            type="button"
                            onClick={() => setResolutions(previous => ({ ...previous, [conflict.key]: 'LOCAL' }))}
                            aria-pressed={resolutions[conflict.key] === 'LOCAL'}
                            className={`mt-2 rounded px-2 py-1 font-bold ${
                              resolutions[conflict.key] === 'LOCAL' ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-900'
                            }`}
                          >
                            Use offline value
                          </button>
                        </div>
                        <div className="rounded-lg bg-white p-2 text-[10px]">
                          <div className="font-black uppercase text-emerald-700">Database value · {conflict.serverTimestamp || 'time unknown'}</div>
                          <div className="mt-1 text-slate-700">{describeConflictValue(conflict, conflict.serverValue, lookups)}</div>
                          <button
                            type="button"
                            onClick={() => setResolutions(previous => ({ ...previous, [conflict.key]: 'SERVER' }))}
                            aria-pressed={resolutions[conflict.key] === 'SERVER'}
                            className={`mt-2 rounded px-2 py-1 font-bold ${
                              resolutions[conflict.key] === 'SERVER' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            Keep database value
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
                >
                  Review later
                </button>
                {blockedReason === 'AUTH' && (
                  <button
                    type="button"
                    onClick={() => openAuthModal()}
                    className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-black text-white"
                  >
                    Sign in to upload
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={!canCommit || isCommitting || !allConflictsResolved || Boolean(blockedReason)}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCommitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  {isCommitting
                    ? 'Uploading…'
                    : blockedReason === 'VALIDATION'
                      ? 'Correct rejected data to continue'
                    : pendingOfflineSnapshot.requiresUserConfirmation
                      ? 'Upload unsaved changes'
                      : 'Confirm and commit changes'}
                </button>
              </footer>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
