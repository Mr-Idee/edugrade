import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCustomReportSectionIds,
  getCustomReportTemplatesForAvailableSections,
  getCustomReportTemplatesForSection,
  mergeScopedCustomReportScores,
  resolveCustomReportColumnEntryValue,
  resolveCustomReportColumnScore
} from './customReportEngine.ts';

test('custom report classes are restricted to explicitly configured sections', () => {
  const template = { sectionId: 2, sectionIds: [2, 4] };
  assert.deepEqual(getCustomReportSectionIds(template, [2, 3, 4]), [2, 4]);
  assert.deepEqual(getCustomReportSectionIds(template, [3]), []);
  assert.deepEqual(getCustomReportSectionIds({ sectionId: 5, sectionIds: [] }), [5]);
});

test('custom report templates are scoped to their configured class', () => {
  const templates = [
    { id: 'report-a', sectionId: 2, sectionIds: [2, 4] },
    { id: 'report-b', sectionId: 3, sectionIds: [3] }
  ];
  assert.deepEqual(
    getCustomReportTemplatesForSection(templates, 4).map(template => template.id),
    ['report-a']
  );
  assert.deepEqual(
    getCustomReportTemplatesForSection(templates, 3).map(template => template.id),
    ['report-b']
  );
});

test('score-entry report selector can choose any saved sheet with an existing assigned class', () => {
  const templates = [
    { id: 'report-a', sectionId: 2, sectionIds: [2, 4] },
    { id: 'report-b', sectionId: 3, sectionIds: [3] },
    { id: 'stale-report', sectionId: 9, sectionIds: [9] }
  ];
  assert.deepEqual(
    getCustomReportTemplatesForAvailableSections(templates, [2, 3, 4])
      .map(template => template.id),
    ['report-a', 'report-b']
  );
});

test('custom report score uses a saved override before its configured source', () => {
  const column = { id: 'exam', header: 'Exam', maxScore: 60, sourceKey: 'exam' as const };
  assert.equal(
    resolveCustomReportColumnScore(column, { exam: 42 }, { examScore: 55 }),
    42
  );
});

test('custom report score falls back to the configured term source and clamps to the column maximum', () => {
  const column = { id: 'ca1', header: 'First CA', maxScore: 20, sourceKey: 'ca1' as const };
  assert.equal(resolveCustomReportColumnScore(column, undefined, { ca1Score: 25 }), 20);
});

test('custom report score uses the configured default when no override or source exists', () => {
  const column = { id: 'project', header: 'Project', maxScore: 10, sourceKey: 'custom' as const, defaultValue: 3 };
  assert.equal(resolveCustomReportColumnScore(column, undefined, undefined), 3);
  assert.equal(resolveCustomReportColumnScore({ ...column, defaultValue: undefined }, undefined, undefined), 0);
});

test('custom report custom-entry columns stay blank until a score is entered', () => {
  const column = {
    id: 'project',
    header: 'Project',
    maxScore: 10,
    sourceKey: 'custom' as const,
    defaultValue: 0
  };
  assert.equal(resolveCustomReportColumnEntryValue(column, undefined, undefined), '');
  assert.equal(resolveCustomReportColumnEntryValue(column, { project: 0 }, undefined), 0);
  assert.equal(
    resolveCustomReportColumnEntryValue(
      { ...column, sourceKey: 'ca1' },
      undefined,
      { ca1Score: 12 }
    ),
    10
  );
});

test('scoped custom report score updates preserve and reject out-of-scope records', () => {
  const merged = mergeScopedCustomReportScores(
    {
      '10_3': { colA: 5 },
      '20_3': { colA: 6 },
      '10_4': { colA: 14 },
      malformed: { colA: 9 }
    },
    {
      '10_3': { colA: 8 },
      '20_3': { colA: 10 },
      '30_3': { colA: 12 },
      '10_4': { colA: 14 }
    },
    (studentId, subjectId) => studentId === 10 && subjectId === 3
  );
  assert.deepEqual(merged, {
    '10_3': { colA: 8 },
    '20_3': { colA: 6 },
    '10_4': { colA: 14 },
    malformed: { colA: 9 }
  });
});
