import test from 'node:test';
import assert from 'node:assert/strict';
import { createMasterDirectoriesPdf } from './pdfGenerator.ts';

test('master directory PDF includes alphabetized class rosters and all assignment directories', () => {
  const pdf = createMasterDirectoriesPdf({
    schoolName: 'Example School',
    sessionName: '2026/27',
    classes: [
      {
        section: {
          id: 1,
          classLevelId: 1,
          name: 'YEAR 7 DILIGENCE',
          levelType: 'JUNIOR',
          classTeacherName: 'Form Tutor'
        },
        formTutor: 'Form Tutor',
        students: [
          ...Array.from({ length: 80 }, (_, index) => ({
            fullName: `Student ${String(index + 1).padStart(3, '0')}`,
            admissionNumber: `ADM-${String(index + 3).padStart(3, '0')}`,
            gender: 'MALE'
          })),
          { fullName: 'Zoe Student', admissionNumber: 'ADM-02', gender: 'FEMALE' },
          { fullName: 'Amy Student', admissionNumber: 'ADM-01', gender: 'FEMALE' }
        ],
        subjects: [
          {
            name: 'Mathematics',
            code: 'MTH',
            category: 'CORE',
            teachers: ['Ada Teacher']
          }
        ]
      }
    ],
    teachers: [
      {
        fullName: 'Ada Teacher',
        staffId: 'STAFF-01',
        subjects: ['YEAR 7 DILIGENCE — Mathematics']
      }
    ]
  });

  const output = pdf.output();
  assert.ok(output.startsWith('%PDF-'));
  assert.ok(pdf.getNumberOfPages() > 4);
  assert.ok(output.indexOf('STUDENT CLASS DIRECTORY') < output.lastIndexOf('STUDENT CLASS DIRECTORY'));
  assert.ok(output.includes('YEAR 7 DILIGENCE'));
  assert.ok(output.includes('Amy Student'));
  assert.ok(output.includes('Zoe Student'));
  assert.ok(output.indexOf('Amy Student') < output.indexOf('Zoe Student'));
  assert.ok(output.includes('Student 080'));
  assert.ok(output.includes('SUBJECTS ASSIGNED BY CLASS'));
  assert.ok(output.includes('CLASS & FORM TUTOR DIRECTORY'));
  assert.ok(output.includes('TEACHER SUBJECT ASSIGNMENT DIRECTORY'));
  assert.ok(output.includes('Ada Teacher'));
});
