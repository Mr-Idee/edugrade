import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  AcademicDepartment,
  Teacher,
  TeacherDocumentExecutiveRemark,
  TeacherDocumentUpload
} from '../types/index.ts';
import {
  isDocumentInHodScope,
  mergeDocumentReviewUpdate,
  resolveDocumentRemarkAuthorName
} from './teacherDocumentReview.ts';

const department: AcademicDepartment = {
  id: 'science',
  name: 'Department of Science',
  code: 'SCI',
  hodTeacherId: 2,
  hodTeacherName: 'New HOD',
  subjectIds: [1],
  createdByRole: 'SUPER_ADMIN',
  createdByName: 'Admin',
  createdAt: '2026-01-01T00:00:00.000Z'
};

const teachers: Teacher[] = [
  { id: 2, fullName: 'New HOD', email: '', role: 'BOTH', systemRole: 'CLASS_TEACHER' },
  { id: 3, fullName: 'New Principal', email: '', role: 'BOTH', systemRole: 'PRINCIPAL' }
];

const createRemark = (
  overrides: Partial<TeacherDocumentExecutiveRemark> = {}
): TeacherDocumentExecutiveRemark => ({
  id: 'remark-1',
  authorName: 'Former Staff Name',
  authorRole: 'CLASS_TEACHER',
  authorDesignation: 'Head of Department (Department of Science)',
  departmentId: 'science',
  remark: 'Please update this document.',
  createdAt: '2026-11-15T00:00:00.000Z',
  ...overrides
});

const createDocument = (overrides: Partial<TeacherDocumentUpload> = {}): TeacherDocumentUpload => ({
  id: 'doc-1',
  teacherId: 1,
  teacherName: 'Uploader',
  sectionId: 10,
  sectionName: 'Year 7',
  subjectId: 1,
  subjectName: 'Science',
  termName: 'FIRST',
  weekNumber: 1,
  documentTitle: 'Lesson plan',
  category: 'LESSON_PLAN',
  fileName: 'lesson.pdf',
  fileExtension: 'PDF',
  fileSizeKb: 10,
  status: 'PENDING_REVIEW',
  executiveRemarks: [],
  uploadedAt: '2026-11-15T00:00:00.000Z',
  ...overrides
});

test('existing HOD comments resolve to the current department assignee', () => {
  assert.equal(
    resolveDocumentRemarkAuthorName(createRemark(), teachers, [department]),
    'New HOD'
  );
});

test('HOD access follows department assignment and subject mapping, not uploader identity', () => {
  assert.equal(isDocumentInHodScope(createDocument({ departmentId: 'science' }), [department]), true);
  assert.equal(isDocumentInHodScope(createDocument({ departmentId: undefined, subjectId: 1 }), [department]), true);
  assert.equal(isDocumentInHodScope(createDocument({ departmentId: undefined, subjectId: 2 }), [department]), false);
});

test('HOD review updates preserve uploaded file metadata and existing comments', () => {
  const existing = createDocument({
    fileStoragePath: 'school/documents/lesson.pdf',
    executiveRemarks: [createRemark()]
  });
  const update = createDocument({
    status: 'APPROVED',
    hodReviewStatus: 'HOD_APPROVED',
    executiveRemarks: [
      createRemark(),
      createRemark({ id: 'remark-2', authorName: 'New HOD', remark: 'Approved.' })
    ]
  });
  const merged = mergeDocumentReviewUpdate(existing, update);

  assert.equal(merged.fileStoragePath, existing.fileStoragePath);
  assert.equal(merged.teacherId, existing.teacherId);
  assert.equal(merged.executiveRemarks.length, 2);
  assert.equal(merged.executiveRemarks[0].remark, existing.executiveRemarks[0].remark);
  assert.equal(merged.hodReviewStatus, 'HOD_APPROVED');
});

test('existing executive comments resolve to the current office holder', () => {
  assert.equal(
    resolveDocumentRemarkAuthorName(
      createRemark({ authorRole: 'PRINCIPAL', authorDesignation: "Principal's Office" }),
      teachers,
      [department]
    ),
    'New Principal'
  );
});
