import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudentTermSummary } from '../types/index';
import {
  canAccessStudentComments,
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
