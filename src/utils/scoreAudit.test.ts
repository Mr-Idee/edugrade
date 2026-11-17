import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAuditLog, Student } from '../types/index.ts';
import { mergeScopedScoreAuditLogs, resolveScoreAuditStudentName } from './scoreAudit.ts';

const students: Student[] = [
  {
    id: 42,
    admissionNumber: 'STU-0042',
    fullName: 'Ada Student',
    currentSectionId: 1,
    gender: 'FEMALE'
  }
];

const createLog = (overrides: Partial<ScoreAuditLog> = {}): ScoreAuditLog => ({
  id: 1,
  studentName: 'Ada Student',
  subjectName: 'Mathematics',
  componentName: 'Quiz',
  previousScore: 2,
  newScore: 3,
  changedBy: 'Teacher',
  changedByRole: 'SUBJECT_TEACHER',
  changeReason: 'Correction',
  createdAt: '2026-11-15T00:00:00.000Z',
  ...overrides
});

test('score audit resolves legacy student IDs to names', () => {
  assert.equal(
    resolveScoreAuditStudentName(createLog({ studentName: 'Student #42' }), students),
    'Ada Student'
  );
  assert.equal(
    resolveScoreAuditStudentName(createLog({ studentName: '42' }), students),
    'Ada Student'
  );
});

test('score audit prefers the linked student record and hides unresolved numeric IDs', () => {
  assert.equal(
    resolveScoreAuditStudentName(createLog({ studentId: 42, studentName: '999' }), students),
    'Ada Student'
  );
  assert.equal(
    resolveScoreAuditStudentName(createLog({ studentName: '999' }), students),
    'Unknown student'
  );
});

test('score audit preserves a stored student name when no ID is present', () => {
  assert.equal(resolveScoreAuditStudentName(createLog(), students), 'Ada Student');
});

test('scoped score-audit merge keeps existing logs and accepts only authorized new entries', () => {
  const existing = createLog({ id: 1 });
  const allowed = createLog({
    id: 2,
    studentId: 42,
    subjectId: 7,
    createdAt: '2026-11-16T00:00:00.000Z'
  });
  const unauthorized = createLog({
    id: 3,
    studentId: 99,
    subjectId: 7,
    createdAt: '2026-11-17T00:00:00.000Z'
  });

  const merged = mergeScopedScoreAuditLogs(
    [existing],
    [allowed, unauthorized],
    log => log.studentId === 42 && log.subjectId === 7
  );

  assert.deepEqual(merged.map(log => log.id), [2, 1]);
});
