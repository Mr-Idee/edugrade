import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubjectScoresPdfTable } from './subjectScoresPdf.ts';
import { createSubjectScoresPdf } from './pdfGenerator.ts';

const params = {
  schoolName: 'Example School',
  sectionName: 'YEAR 7',
  sessionName: '2026/27',
  termName: 'SECOND',
  subjectName: 'English',
  components: ['Quiz', 'Classwork'],
  rows: [{
    admissionNumber: 'ADM-001',
    fullName: 'Ada Student',
    componentScores: [0, null],
    rawCaTotal: 0,
    ca1Score: 0,
    ca2Score: null,
    examScore: 62,
    totalScore: 62,
    grade: 'B'
  }]
};

test('subject score PDF table includes individual CA scores and running totals', () => {
  const table = buildSubjectScoresPdfTable(params);

  assert.deepEqual(table.headers, [
    'S/N',
    'Admission No.',
    'Student Name',
    'Quiz',
    'Classwork',
    'CA Total',
    'CA1',
    'CA2',
    'Exam',
    'Running Total',
    'Grade'
  ]);
  assert.deepEqual(table.rows[0], [
    '1',
    'ADM-001',
    'Ada Student',
    '0',
    '',
    '0',
    '0',
    '',
    '62',
    '62',
    'B'
  ]);
});

test('subject score PDF is generated as a landscape PDF with a page for the class roster', () => {
  const pdf = createSubjectScoresPdf(params);
  const output = pdf.output();

  assert.equal(pdf.internal.pageSize.getWidth() > pdf.internal.pageSize.getHeight(), true);
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.equal(output.startsWith('%PDF-'), true);
});

test('subject score PDF repeats its table on additional roster pages', () => {
  const pdf = createSubjectScoresPdf({
    ...params,
    rows: Array.from({ length: 60 }, (_, index) => ({
      ...params.rows[0],
      admissionNumber: `ADM-${index + 1}`,
      fullName: `Student ${index + 1}`
    }))
  });

  assert.ok(pdf.getNumberOfPages() > 1);
});
