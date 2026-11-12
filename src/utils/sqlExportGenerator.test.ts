/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeSqlValue,
  getMySqlSchemaDDL,
  generatePhpMyAdminSqlDump,
  normalizeEnrollmentIds,
  FullDatabaseSnapshot
} from './sqlExportGenerator.ts';

test('escapeSqlValue preserves 0 as numeric 0 and null/undefined as SQL NULL', () => {
  assert.equal(escapeSqlValue(0), '0');
  assert.equal(escapeSqlValue(15.5), '15.5');
  assert.equal(escapeSqlValue(null), 'NULL');
  assert.equal(escapeSqlValue(undefined), 'NULL');
  assert.equal(escapeSqlValue(true), '1');
  assert.equal(escapeSqlValue(false), '0');
  assert.equal(escapeSqlValue("Sample O'Name"), "'Sample O\\'Name'");
});

test('getMySqlSchemaDDL returns all 28 relational tables for phpMyAdmin', () => {
  const tables = getMySqlSchemaDDL();
  assert.equal(tables.length, 28);
  const names = tables.map(t => t.tableName);
  assert.ok(names.includes('school_profile'));
  assert.ok(names.includes('students'));
  assert.ok(names.includes('assessment_scores'));
  assert.ok(names.includes('term_subject_records'));
  assert.ok(names.includes('teachers'));
  assert.ok(names.includes('teacher_subject_assignments'));
  assert.ok(names.includes('custom_report_templates'));
  assert.ok(names.includes('academic_session_archives'));
  assert.ok(names.includes('student_promotions_log'));
  assert.ok(names.includes('academic_departments'));
  assert.ok(names.includes('grading_scale_presets'));
  assert.ok(names.includes('teacher_document_uploads'));
  assert.ok(names.includes('student_testimonials'));
  assert.ok(names.includes('system_updates_log'));
  assert.ok(names.includes('offline_commit_archive'));
  const subjectsTable = tables.find(t => t.tableName === 'subjects');
  assert.ok(subjectsTable?.ddl.includes("ENUM('CORE','OPTIONAL','ELECTIVE')"));
  const sectionsTable = tables.find(t => t.tableName === 'class_sections');
  assert.ok(sectionsTable?.ddl.includes('`code` VARCHAR(50) DEFAULT NULL'));
  const documentTable = tables.find(t => t.tableName === 'teacher_document_uploads');
  assert.ok(documentTable?.ddl.includes('`file_storage_path` VARCHAR(500) DEFAULT NULL'));
});

test('normalizeEnrollmentIds preserves distinct enrollments and their score links', () => {
  const snapshot: FullDatabaseSnapshot = {
    schoolProfile: {
      name: 'Test School',
      reportDate: '',
      currentSession: '2026/27',
      currentTerm: 'FIRST'
    },
    sessions: [],
    terms: [],
    classSections: [],
    teachers: [],
    subjects: [],
    students: [],
    assessmentComponents: [
      { id: 1, termId: 1, levelType: 'JUNIOR', name: 'Test', shortCode: 'T', maxScore: 10, weightOrder: 1 }
    ],
    enrollments: [
      { id: 1, studentId: 10, sectionId: 1, subjectId: 1, termId: 1, isIncluded: true },
      { id: 1, studentId: 11, sectionId: 1, subjectId: 1, termId: 1, isIncluded: true }
    ],
    scores: [
      { id: 1, enrollmentId: 1, studentId: 10, subjectId: 1, componentId: 1, score: 8, updatedBy: 1, updatedAt: '2026-10-27' },
      { id: 2, enrollmentId: 1, studentId: 11, subjectId: 1, componentId: 1, score: 7, updatedBy: 1, updatedAt: '2026-10-27' }
    ],
    termSubjectRecords: [],
    termSummaries: [],
    auditLogs: [],
    commentBank: []
  };

  const normalized = normalizeEnrollmentIds(snapshot);
  assert.equal(new Set(normalized.enrollments.map(enrollment => enrollment.id)).size, 2);
  assert.deepEqual(
    normalized.scores.map(score => score.enrollmentId),
    normalized.enrollments.map(enrollment => enrollment.id)
  );
});

test('generatePhpMyAdminSqlDump creates valid phpMyAdmin SQL script with 0 and NULL scores distinct', () => {
  const snapshot: FullDatabaseSnapshot = {
    schoolProfile: {
      name: 'Sample School',
      motto: 'CHARACTER AND KNOWLEDGE',
      address: 'School Street',
      principalName: 'Principal',
      formTeacherName: 'Class Teacher 4',
      reportDate: '27/10/2026',
      currentSession: '2026/27',
      currentTerm: 'FIRST'
    },
    sessions: [{ id: 1, name: '2026/27', isCurrent: true }],
    terms: [{ id: 1, sessionId: 1, name: 'FIRST', isActive: true, startDate: '10/01/2027' }],
    classSections: [
      { id: 4, classLevelId: 1, name: 'Year 8 Resilience', code: 'Y8R', levelType: 'JUNIOR', classTeacherName: 'Class Teacher 4', capacity: 30 }
    ],
    teachers: [
      { id: 1, staffId: 'STAFF-001', fullName: 'Class Teacher 4', email: 'teacher@example.invalid', phone: '', assignedSectionId: 4, role: 'FORM_TUTOR' }
    ],
    subjects: [
      { id: 1, name: 'Mathematics', code: 'MTH', applicableLevel: 'BOTH', category: 'CORE' }
    ],
    students: [
      { id: 100, admissionNumber: 'STU-001', fullName: "Sample O'Name", gender: 'FEMALE', currentSectionId: 4, attendanceDays: 62 }
    ],
    assessmentComponents: [
      { id: 1, termId: 1, name: 'Classwork', shortCode: 'CW', maxScore: 5, weightOrder: 1, levelType: 'JUNIOR' },
      { id: 2, termId: 1, name: 'Quiz', shortCode: 'QZ', maxScore: 5, weightOrder: 2, levelType: 'JUNIOR' }
    ],
    reportCardSubjectOrder: { JUNIOR: [1], SENIOR: [] },
    enrollments: [
      { id: 500, studentId: 100, sectionId: 4, subjectId: 1, termId: 1, isIncluded: true }
    ],
    scores: [
      { id: 1001, enrollmentId: 500, studentId: 100, subjectId: 1, componentId: 1, score: 0, updatedBy: 1, updatedAt: '2026-10-27' },
      { id: 1002, enrollmentId: 500, studentId: 100, subjectId: 1, componentId: 2, score: null, updatedBy: 1, updatedAt: '2026-10-27' }
    ],
    teacherDocumentUploads: [
      {
        id: 'doc-123',
        teacherId: 1,
        teacherName: 'Class Teacher 4',
        sectionId: 4,
        sectionName: 'Year 8 Resilience',
        subjectId: 1,
        subjectName: 'Mathematics',
        termName: 'FIRST',
        weekNumber: 3,
        documentTitle: 'Week 3 Lesson Notes',
        category: 'LESSON_NOTES',
        fileName: 'lesson-notes.pdf',
        fileExtension: 'PDF',
        fileSizeKb: 12,
        fileStoragePath: 'teacher_uploads/doc-123.pdf',
        status: 'PENDING_REVIEW',
        executiveRemarks: [],
        uploadedAt: '2026-10-27'
      }
    ],
    termSubjectRecords: [],
    termSummaries: [],
    auditLogs: [],
    commentBank: []
  };

  const sql = generatePhpMyAdminSqlDump(snapshot, 'edugrade_db');
  assert.ok(sql.includes('CREATE DATABASE IF NOT EXISTS `edugrade_db`'));
  assert.ok(sql.includes("REPLACE INTO `students`"));
  assert.ok(sql.includes("'Sample O\\'Name'"));
  // Score 1001 has 0, Score 1002 has NULL
  assert.ok(sql.includes('(1001, 500, 100, 1, 1, 0, 1, \'2026-10-27\')'));
  assert.ok(sql.includes('(1002, 500, 100, 1, 2, NULL, 1, \'2026-10-27\')'));
  assert.ok(sql.includes('`file_storage_path`'));
  assert.ok(sql.includes("'teacher_uploads/doc-123.pdf'"));
});
