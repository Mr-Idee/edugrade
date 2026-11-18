import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudentTermSummary } from '../types/index';
import {
  canAccessStudentComments,
  preserveStudentCommentsForSubjectTeacher,
  preserveTeacherRemarksForSuperAdmin
} from './studentCommentPolicy';

const summary = (overrides: Partial<StudentTermSummary> = {}): StudentTermSummary => ({
  id: 1,
  studentId: 7,
  sectionId: 3,
  termId: 2,
  totalScoreObtained: 0,
  totalPossibleScore: 0,
  cumulativePercentage: 0,
  cumulativeGrade: '',
  classRank: 1,
  totalStudentsInSection: 1,
  principalRemark: '',
  teacherRemark: '',
  isPublished: false,
  updatedAt: '',
  ...overrides
});

test('student comments are limited to form tutors and the three schoolwide executive roles', () => {
  assert.equal(canAccessStudentComments('CLASS_TEACHER', true), true);
  assert.equal(canAccessStudentComments('CLASS_TEACHER', false), false);
  assert.equal(canAccessStudentComments('PRINCIPAL', false), true);
  assert.equal(canAccessStudentComments('VICE_PRINCIPAL', false), true);
  assert.equal(canAccessStudentComments('HEAD_OF_SCHOOLS', false), true);
  assert.equal(canAccessStudentComments('SUPER_ADMIN', true), false);
  assert.equal(canAccessStudentComments('SUBJECT_TEACHER', true), false);
});

test('super-admin snapshot saves cannot replace or create teacher comments', () => {
  const current = [summary({ teacherRemark: 'Saved form tutor comment' })];
  const submitted = [
    summary({ teacherRemark: 'Attempted replacement' }),
    summary({ id: 2, studentId: 8, teacherRemark: 'Attempted new comment' })
  ];

  const protectedSummaries = preserveTeacherRemarksForSuperAdmin(current, submitted);

  assert.equal(protectedSummaries[0].teacherRemark, 'Saved form tutor comment');
  assert.equal(protectedSummaries[1].teacherRemark, '');
});

test('subject-teacher snapshot saves cannot change or create student comments', () => {
  const current = [summary({
    principalRemark: 'Saved principal comment',
    teacherRemark: 'Saved form tutor comment'
  })];
  const submitted = [
    summary({
      principalRemark: 'Attempted principal comment',
      teacherRemark: 'Attempted teacher comment'
    }),
    summary({
      id: 2,
      studentId: 8,
      principalRemark: 'Attempted new principal comment',
      teacherRemark: 'Attempted new teacher comment'
    })
  ];

  const protectedSummaries = preserveStudentCommentsForSubjectTeacher(current, submitted);

  assert.equal(protectedSummaries[0].principalRemark, 'Saved principal comment');
  assert.equal(protectedSummaries[0].teacherRemark, 'Saved form tutor comment');
  assert.equal(protectedSummaries[1].principalRemark, '');
  assert.equal(protectedSummaries[1].teacherRemark, '');
});
