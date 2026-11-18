import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FormTutorEnrollmentError,
  prepareFormTutorStudentAdditions
} from './formTutorEnrollment';

const current = {
  students: [{ id: 1, admissionNumber: 'EXISTING-1' }],
  enrollments: [{ id: 10 }],
  classSections: [{ id: 7, levelType: 'SENIOR' as const }],
  subjects: [
    { id: 20, applicableLevel: 'SENIOR' as const, category: 'CORE' as const },
    { id: 21, applicableLevel: 'BOTH' as const, category: 'OPTIONAL' as const },
    { id: 22, applicableLevel: 'JUNIOR' as const, category: 'CORE' as const }
  ],
  sessions: [{ id: 3, name: '2026/27', isCurrent: true }],
  terms: [{ id: 4, sessionId: 3, name: 'FIRST' as const }],
  schoolProfile: { currentSession: '2026/27', currentTerm: 'FIRST' as const }
};

const student = {
  id: 2,
  fullName: 'New Student',
  admissionNumber: 'new-2',
  currentSectionId: 7,
  gender: 'FEMALE' as const
};

test('form tutor additions enroll every applicable subject and preserve senior optional choices', () => {
  const result = prepareFormTutorStudentAdditions(
    current,
    {
      students: [student],
      enrollments: [
        {
          id: 11,
          studentId: student.id,
          sectionId: 7,
          subjectId: 20,
          termId: 4,
          isIncluded: true
        },
        {
          id: 12,
          studentId: student.id,
          sectionId: 7,
          subjectId: 21,
          termId: 4,
          isIncluded: false
        }
      ]
    },
    { isFormTutor: true, formSectionId: 7 }
  );

  assert.deepEqual(result.students, [{
    ...student,
    admissionNumber: 'NEW-2',
    promotionStatus: 'ENROLLED'
  }]);
  assert.deepEqual(
    result.enrollments.map(enrollment => [enrollment.subjectId, enrollment.isIncluded]),
    [[20, true], [21, false]]
  );
  assert.equal(new Set(result.enrollments.map(enrollment => enrollment.id)).size, 2);
});

test('non-form tutors cannot add students', () => {
  assert.throws(
    () => prepareFormTutorStudentAdditions(
      current,
      { students: [student], enrollments: [] },
      { isFormTutor: false, formSectionId: 7 }
    ),
    (error: unknown) =>
      error instanceof FormTutorEnrollmentError &&
      error.status === 403 &&
      /Only the form tutor/.test(error.message)
  );
});

test('duplicate admission numbers are rejected case-insensitively', () => {
  assert.throws(
    () => prepareFormTutorStudentAdditions(
      current,
      { students: [{ ...student, admissionNumber: 'existing-1' }], enrollments: [] },
      { isFormTutor: true, formSectionId: 7 }
    ),
    (error: unknown) => error instanceof FormTutorEnrollmentError && error.status === 409
  );
});
