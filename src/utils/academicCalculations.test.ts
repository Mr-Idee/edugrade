/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRawScore,
  calculateCumulativePercentage,
  determineGrade,
  calculateStudentOverallSummary,
  calculateClassRanks,
  formatRankOrdinal,
  calculateTermExamTotal,
  calculateAnnualAverage,
  auditClassStudentCompleteness,
  getTermStructureForLevel,
  formatActiveTermTotalHeader,
  getReportCardGradingScaleDisplay,
  getAutoCommentForGrade,
  evaluateStudentPromotionEligibility,
  divideRawCaByTwo,
  calculateOfficialTermRecord,
  formatColumnSumOverMax,
  detectDuplicateStudents,
  checkDuplicateStudentsOnTransfer,
  sortStudentsForGridAndRegistry,
  resolveExpandedCaComponentScores
} from './academicCalculations';
import {
  DEFAULT_SAMPLE_UPDATE_MANIFEST,
  validateUpdatePackageSafety,
  executeZeroDowntimeUpdateTransaction,
  createUpdatePackageZipBytes,
  extractUpdateManifestFromPackageBytes
} from './softwareUpdateEngine';
import {
  initialStudents,
  initialClassSections,
  initialSubjects,
  initialUsers
} from '../data/seedData';

test('calculateRawScore sums component scores correctly and ignores nulls', () => {
  assert.equal(calculateRawScore([3, 2, 5, 20]), 30);
  assert.equal(calculateRawScore([2.5, null, 4.0, undefined, 18.2]), 24.7);
  assert.equal(calculateRawScore([]), 0);
});

test('Junior & Senior CA and Exam official formula and clean column headers (no [30÷2] or [40÷2]) + Active Term Total header', () => {
  const juniorStruct = getTermStructureForLevel('JUNIOR', 'FIRST');
  assert.equal(juniorStruct.rawCaMax, 40);
  assert.equal(juniorStruct.ca1Max, 20);
  assert.equal(juniorStruct.ca2Max, 20);
  assert.equal(juniorStruct.examMax, 60);
  assert.equal(juniorStruct.termTotalMax, 100);
  assert.equal(juniorStruct.ca1Header, 'FIRST CA (20)');
  assert.equal(juniorStruct.ca2Header, 'SECOND CA (20)');
  assert.equal(juniorStruct.examHeader, 'EXAM (60)');
  assert.equal(juniorStruct.termTotalHeader, 'First Term Total');

  const seniorStruct = getTermStructureForLevel('SENIOR', 'SECOND');
  assert.equal(seniorStruct.rawCaMax, 30);
  assert.equal(seniorStruct.ca1Max, 15);
  assert.equal(seniorStruct.ca2Max, 15);
  assert.equal(seniorStruct.examMax, 70);
  assert.equal(seniorStruct.termTotalMax, 100);
  assert.equal(seniorStruct.ca1Header, 'FIRST CA (15)');
  assert.equal(seniorStruct.ca2Header, 'SECOND CA (15)');
  assert.equal(seniorStruct.examHeader, 'EXAM (70)');
  assert.equal(seniorStruct.termTotalHeader, 'Second Term Total');

  assert.equal(formatActiveTermTotalHeader('THIRD'), 'Third Term Total');

  // Senior grading scale display groups B (Very Good) and C (Good)
  const seniorScaleDisplay = getReportCardGradingScaleDisplay('SENIOR');
  assert.equal(seniorScaleDisplay.length, 6);
  assert.equal(seniorScaleDisplay[1].gradeLabel, 'B (B1–B2)');
  assert.equal(seniorScaleDisplay[1].description, 'Very Good');
  assert.equal(seniorScaleDisplay[2].gradeLabel, 'C (C4–C6)');
  assert.equal(seniorScaleDisplay[2].description, 'Good');

  // Auto comment generation and promotion eligibility grouping
  const sampleBank = [
    { id: 1, grade: 'A', remarkType: 'PRINCIPAL' as const, commentText: 'Outstanding academic excellence.' },
    { id: 2, grade: 'B', remarkType: 'PRINCIPAL' as const, commentText: 'Very good academic performance.' },
    { id: 3, grade: 'F', remarkType: 'PRINCIPAL' as const, commentText: 'Needs urgent academic intervention.' }
  ];
  assert.equal(getAutoCommentForGrade('A', 'PRINCIPAL', sampleBank, 1), 'Outstanding academic excellence.');
  assert.equal(getAutoCommentForGrade('B2', 'PRINCIPAL', sampleBank, 1), 'Very good academic performance.');

  const evalPromoted = evaluateStudentPromotionEligibility({
    studentId: 101,
    levelType: 'JUNIOR',
    firstTermPct: 72,
    secondTermPct: 76,
    thirdTermPct: 80
  });
  assert.equal(evalPromoted.group, 'ELIGIBLE');
  assert.equal(evalPromoted.recommendedDecision, 'PROMOTED');

  const evalProbation = evaluateStudentPromotionEligibility({
    studentId: 102,
    levelType: 'JUNIOR',
    firstTermPct: 46,
    secondTermPct: 48,
    thirdTermPct: 47
  });
  assert.equal(evalProbation.finalGrade, 'E');
  assert.equal(evalProbation.group, 'REPEAT_OR_PROBATION');
  assert.equal(evalProbation.recommendedDecision, 'PROBATION');

  const evalBlank = evaluateStudentPromotionEligibility({
    studentId: 103,
    levelType: 'JUNIOR',
    firstTermPct: null,
    secondTermPct: undefined,
    thirdTermPct: 0
  });
  assert.equal(evalBlank.cumulativeAvgPct, 0);
  assert.equal(evalBlank.finalGrade, 'F');
  assert.equal(evalBlank.group, 'REPEAT_OR_PROBATION');

  // Junior: Raw CA1 = 36 (/40) -> 18 (/20); Raw CA2 = 32 (/40) -> 16 (/20); Exam = 50 (/60) -> Total = 18 + 16 + 50 = 84
  assert.equal(divideRawCaByTwo(36, 'JUNIOR'), 18);
  const jrRec = calculateOfficialTermRecord('JUNIOR', 36, 32, 50, { ca1IsRaw: true, ca2IsRaw: true });
  assert.equal(jrRec.ca1Score, 18);
  assert.equal(jrRec.ca2Score, 16);
  assert.equal(jrRec.examScore, 50);
  assert.equal(jrRec.totalScore, 84);

  // Senior: Raw CA1 = 24 (/30) -> 12 (/15); Raw CA2 = 26 (/30) -> 13 (/15); Exam = 60 (/70) -> Total = 12 + 13 + 60 = 85
  assert.equal(divideRawCaByTwo(24, 'SENIOR'), 12);
  const srRec = calculateOfficialTermRecord('SENIOR', 24, 26, 60, { ca1IsRaw: true, ca2IsRaw: true });
  assert.equal(srRec.ca1Score, 12);
  assert.equal(srRec.ca2Score, 13);
  assert.equal(srRec.examScore, 60);
  assert.equal(srRec.totalScore, 85);

  // Column sum over max formatter: (Sum of scores + " over " + number of subjects * columnMax)
  assert.equal(formatColumnSumOverMax(215.5, 13, 20), '215.5 over 260');
  assert.equal(formatColumnSumOverMax(612, 13, 60), '612 over 780');
  assert.equal(formatColumnSumOverMax(980.4, 13, 100), '980.4 over 1300');
});

test('calculateCumulativePercentage scales raw marks to 100 correctly', () => {
  // Senior: 20 out of 30 = 66.7%
  assert.equal(calculateCumulativePercentage(20, 30), 66.7);
  // Junior: 24 out of 40 = 60.0%
  assert.equal(calculateCumulativePercentage(24, 40), 60.0);
  // Edge case: max score 0
  assert.equal(calculateCumulativePercentage(10, 0), 0);
});

test('determineGrade handles senior secondary grading thresholds', () => {
  // Senior: A (>=85), B1 (>=80), B2 (>=75), C4 (>=70), C5 (>=65), C6 (>=60), D (>=55), E (>=50), F (<50)
  assert.equal(determineGrade(88.5, 'SENIOR').grade, 'A');
  assert.equal(determineGrade(82.0, 'SENIOR').grade, 'B1');
  assert.equal(determineGrade(77.5, 'SENIOR').grade, 'B2');
  assert.equal(determineGrade(71.0, 'SENIOR').grade, 'C4');
  assert.equal(determineGrade(66.7, 'SENIOR').grade, 'C5');
  assert.equal(determineGrade(62.0, 'SENIOR').grade, 'C6');
  assert.equal(determineGrade(57.5, 'SENIOR').grade, 'D');
  assert.equal(determineGrade(52.0, 'SENIOR').grade, 'E');
  assert.equal(determineGrade(48.5, 'SENIOR').grade, 'F');
  assert.equal(determineGrade(39.7, 'SENIOR').grade, 'F');
});

test('determineGrade handles junior secondary grading thresholds', () => {
  // Junior: A (>=80), B (>=70), C (>=60), D (>=50), E (>=45), F (<45)
  assert.equal(determineGrade(82.5, 'JUNIOR').grade, 'A');
  assert.equal(determineGrade(74.0, 'JUNIOR').grade, 'B');
  assert.equal(determineGrade(65.0, 'JUNIOR').grade, 'C');
  assert.equal(determineGrade(55.0, 'JUNIOR').grade, 'D');
  assert.equal(determineGrade(47.0, 'JUNIOR').grade, 'E');
  assert.equal(determineGrade(42.0, 'JUNIOR').grade, 'F');
});

test('calculateStudentOverallSummary ignores excluded subjects and accurately calculates overall stats', () => {
  const entries = [
    { subjectId: 1, subjectName: 'English', isIncluded: true, rawTotal: 20, maxScore: 30, cumulativePercentage: 66.7, grade: 'C5' },
    { subjectId: 2, subjectName: 'Maths', isIncluded: true, rawTotal: 15, maxScore: 30, cumulativePercentage: 50.0, grade: 'E' },
    { subjectId: 3, subjectName: 'Economics', isIncluded: true, rawTotal: 12, maxScore: 30, cumulativePercentage: 40.0, grade: 'F' },
    // Excluded optional subjects (must NOT be counted in total obtained or total possible!)
    { subjectId: 4, subjectName: 'Visual Art', isIncluded: false, rawTotal: 0, maxScore: 30, cumulativePercentage: 0, grade: 'F' },
    { subjectId: 5, subjectName: 'Physics', isIncluded: false, rawTotal: 25, maxScore: 30, cumulativePercentage: 83.3, grade: 'B1' },
    { subjectId: 6, subjectName: 'Accounting', isIncluded: true, rawTotal: 10, maxScore: 30, cumulativePercentage: 33.3, grade: 'F' }
  ];

  const summary = calculateStudentOverallSummary(entries, 'SENIOR');
  // Included subjects: English (20), Maths (15), Economics (12), Accounting (10) => total = 57
  // Total possible: 4 included * 30 = 120
  // Pct = (57 / 120) * 100 = 47.5% => F in Senior
  assert.equal(summary.totalObtained, 57);
  assert.equal(summary.totalPossible, 120);
  assert.equal(summary.cumulativePercentage, 47.5);
  assert.equal(summary.overallGrade, 'F');
  assert.equal(summary.includedCount, 4);
  assert.equal(summary.excludedCount, 2);
});

test('calculateClassRanks orders descending and handles ties', () => {
  const students = [
    { studentId: 101, cumulativePercentage: 75.5 },
    { studentId: 102, cumulativePercentage: 88.0 },
    { studentId: 103, cumulativePercentage: 75.5 }, // tie with 101
    { studentId: 104, cumulativePercentage: 62.0 }
  ];

  const ranks = calculateClassRanks(students);
  assert.equal(ranks.get(102), 1); // 88.0% -> 1st
  assert.equal(ranks.get(101), 2); // 75.5% -> 2nd
  assert.equal(ranks.get(103), 2); // 75.5% -> 2nd
  assert.equal(ranks.get(104), 4); // 62.0% -> 4th (after 2 tied second-place)
});

test('formatRankOrdinal adds appropriate suffix', () => {
  assert.equal(formatRankOrdinal(1), '1st');
  assert.equal(formatRankOrdinal(2), '2nd');
  assert.equal(formatRankOrdinal(3), '3rd');
  assert.equal(formatRankOrdinal(4), '4th');
  assert.equal(formatRankOrdinal(11), '11th');
  assert.equal(formatRankOrdinal(12), '12th');
  assert.equal(formatRankOrdinal(21), '21st');
  assert.equal(formatRankOrdinal(32), '32nd');
});

test('calculateTermExamTotal sums CA1 + CA2 + EXAM and scales to 100%', () => {
  // CA1 (out of 20) = 15, CA2 (out of 20) = 17, Exam (out of 60) = 48 -> Total 80 / 100 = 80.0%
  const res = calculateTermExamTotal(15, 20, 17, 20, 48, 60);
  assert.equal(res.totalObtained, 80);
  assert.equal(res.totalPossible, 100);
  assert.equal(res.scaledPercentage, 80.0);
});

test('calculateAnnualAverage computes average across included terms with inclusion toggle', () => {
  // First Term: 70%, Second Term: 80%, Third Term: 90% -> Average = (70+80+90)/3 = 80.0%
  const termsAll = [
    { termId: 1, percentage: 70.0, isIncluded: true },
    { termId: 2, percentage: 80.0, isIncluded: true },
    { termId: 3, percentage: 90.0, isIncluded: true }
  ];
  const resAll = calculateAnnualAverage(termsAll);
  assert.equal(resAll.yearlyAverage, 80.0);
  assert.equal(resAll.includedTermsCount, 3);

  // If Third term is excluded: average = (70 + 80) / 2 = 75.0%
  const termsPartial = [
    { termId: 1, percentage: 70.0, isIncluded: true },
    { termId: 2, percentage: 80.0, isIncluded: true },
    { termId: 3, percentage: 90.0, isIncluded: false }
  ];
  const resPartial = calculateAnnualAverage(termsPartial);
  assert.equal(resPartial.yearlyAverage, 75.0);
  assert.equal(resPartial.includedTermsCount, 2);
});

test('auditClassStudentCompleteness treats 0 as a valid entered score and only flags empty (null/unentered) cells as missing', () => {
  const students = [
    { id: 1, admissionNumber: 'STU-001', fullName: 'Student One (With Zero Score)', gender: 'FEMALE' as const },
    { id: 2, admissionNumber: 'STU-002', fullName: 'Student Two (Empty Cells)', gender: 'MALE' as const }
  ];

  const applicableSubjects = [
    { id: 10, name: 'Mathematics', code: 'MTH' },
    { id: 11, name: 'English', code: 'ENG' },
    { id: 12, name: 'Physics', code: 'PHY' }
  ];

  const components = [
    { id: 1, shortCode: 'QZ', name: 'Quiz', maxScore: 5 },
    { id: 2, shortCode: 'TEST', name: 'Test', maxScore: 25 }
  ];

  // Senior level: Bob excludes Physics (subject 12), Alice includes all 3
  const enrollments = [
    { studentId: 1, subjectId: 10, sectionId: 1, isIncluded: true },
    { studentId: 1, subjectId: 11, sectionId: 1, isIncluded: true },
    { studentId: 1, subjectId: 12, sectionId: 1, isIncluded: true },
    { studentId: 2, subjectId: 10, sectionId: 1, isIncluded: true },
    { studentId: 2, subjectId: 11, sectionId: 1, isIncluded: true },
    { studentId: 2, subjectId: 12, sectionId: 1, isIncluded: false }
  ];

  const scores = [
    // Alice has scores entered for all 3 subjects, including 0 on English Quiz and 0 on both Physics components!
    // Because 0 is an entered score (not empty/null), Alice is 100% COMPLETE.
    { studentId: 1, subjectId: 10, componentId: 1, score: 4 },
    { studentId: 1, subjectId: 10, componentId: 2, score: 20 },
    { studentId: 1, subjectId: 11, componentId: 1, score: 0 },
    { studentId: 1, subjectId: 11, componentId: 2, score: 18 },
    { studentId: 1, subjectId: 12, componentId: 1, score: 0 },
    { studentId: 1, subjectId: 12, componentId: 2, score: 0 },
    // Bob has Quiz (0) for Maths, but Test is null (empty cell -> missing!), and no scores entered at all for English
    { studentId: 2, subjectId: 10, componentId: 1, score: 0 },
    { studentId: 2, subjectId: 10, componentId: 2, score: null }
  ];

  const audit = auditClassStudentCompleteness({
    students,
    levelType: 'SENIOR',
    applicableSubjects,
    components,
    enrollments,
    scores,
    sectionId: 1
  });

  assert.equal(audit.length, 2);

  // Alice: 3 included, 3 completed, 0 missing (even though she scored 0 in Quiz and 0 in Physics!)
  assert.equal(audit[0].includedSubjectsCount, 3);
  assert.equal(audit[0].completedSubjectsCount, 3);
  assert.equal(audit[0].missingSubjectsCount, 0);
  assert.equal(audit[0].isComplete, true);

  // Bob: 2 included (Physics excluded), 0 completed, 2 missing (Maths missing TEST only since QZ=0 is entered; English missing QZ & TEST)
  assert.equal(audit[1].includedSubjectsCount, 2);
  assert.equal(audit[1].completedSubjectsCount, 0);
  assert.equal(audit[1].missingSubjectsCount, 2);
  assert.equal(audit[1].isComplete, false);
  assert.equal(audit[1].missingSubjects[0].subjectName, 'Mathematics');
  assert.equal(audit[1].missingSubjects[0].status, 'INCOMPLETE_COMPONENTS');
  assert.deepEqual(audit[1].missingSubjects[0].missingComponents, ['TEST']);
  assert.equal(audit[1].missingSubjects[1].subjectName, 'English');
  assert.equal(audit[1].missingSubjects[1].status, 'NO_GRADE');
});

import { canAccessSystemBackup } from './rbacAndAuth';
import {
  createSystemBackupRecord,
  validateAndParseBackupFile,
  formatBackupTimestamp,
  formatByteSize
} from './backupRestoreEngine';

test('canAccessSystemBackup strictly grants access only to SUPER_ADMIN', () => {
  assert.equal(canAccessSystemBackup('SUPER_ADMIN'), true);
  assert.equal(canAccessSystemBackup('PRINCIPAL'), false);
  assert.equal(canAccessSystemBackup('VICE_PRINCIPAL'), false);
  assert.equal(canAccessSystemBackup('CLASS_TEACHER'), false);
  assert.equal(canAccessSystemBackup('SUBJECT_TEACHER'), false);
});

test('createSystemBackupRecord and validateAndParseBackupFile round-trip full software state including settings, files, students, and scores', () => {
  const samplePayload = {
    schoolProfile: {
      name: 'Sample School',
      motto: 'Academic Excellence & Moral Integrity',
      address: 'School address',
      phone: '',
      email: 'info@example.invalid',
      logoUrl: 'data:image/svg+xml;utf8,<svg></svg>',
      principalName: 'Principal',
      formTeacherName: 'Class Teacher 9',
      reportDate: '2026-04-10',
      currentSession: '2025/2026',
      currentTerm: 'FIRST' as const
    },
    sessions: [{ id: 1, name: '2025/2026', isCurrent: true, institutionName: 'Sample School' }],
    currentSessionId: 1,
    terms: [{ id: 1, sessionId: 1, name: 'FIRST' as const, isActive: true }],
    currentTermId: 1,
    classSections: [
      { id: 1, classLevelId: 1, name: 'Year 7 Excellence', code: 'Y7-EXC', levelType: 'JUNIOR' as const, classTeacherName: 'Class Teacher 9', capacity: 35 }
    ],
    teachers: [
      {
        id: 1,
        fullName: 'Class Teacher 9',
        username: 'class.teacher.9',
        staffId: 'STAFF-001',
        email: 'teacher@example.invalid',
        phone: '',
        assignedSectionId: 1,
        role: 'BOTH' as const
      }
    ],
    subjects: [
      { id: 1, name: 'Mathematics', code: 'MTH', applicableLevel: 'BOTH' as const, category: 'CORE' as const }
    ],
    students: [
      { id: 100, admissionNumber: 'STU-100', fullName: 'Student One', currentSectionId: 1, gender: 'FEMALE' as const, attendanceDays: 62 }
    ],
    assessmentComponents: [
      { id: 1, termId: 1, name: 'Quiz', shortCode: 'QZ', maxScore: 5, weightOrder: 1, levelType: 'JUNIOR' as const }
    ],
    reportCardSubjectOrder: { JUNIOR: [1], SENIOR: [] },
    enrollments: [
      { id: 1, studentId: 100, sectionId: 1, subjectId: 1, termId: 1, isIncluded: true }
    ],
    scores: [
      { id: 1, enrollmentId: 1, studentId: 100, subjectId: 1, componentId: 1, score: 4.5, updatedBy: 1, updatedAt: '2026-10-01T10:00:00Z' }
    ],
    termSubjectRecords: [
      { id: 1, studentId: 100, subjectId: 1, termId: 1, ca1Score: 18, ca2Score: 17, examScore: 52, totalScore: 87, grade: 'A', remark: 'Excellent' }
    ],
    termSummaries: [
      {
        id: 1,
        studentId: 100,
        sectionId: 1,
        termId: 1,
        totalScoreObtained: 87,
        totalPossibleScore: 100,
        cumulativePercentage: 87,
        cumulativeGrade: 'A',
        classRank: 1,
        totalStudentsInSection: 1,
        principalRemark: 'Excellent',
        teacherRemark: 'Well done',
        isPublished: true,
        updatedAt: '2026-10-01T10:00:00Z'
      }
    ],
    customReportTemplates: [],
    commentBank: [{ id: 1, grade: 'A', remarkType: 'PRINCIPAL' as const, commentText: 'Outstanding work.' }],
    teacherDocumentUploads: [
      {
        id: 'doc-101',
        documentTitle: 'Week 1 Mathematics Lesson Plan',
        category: 'LESSON_PLAN' as const,
        weekNumber: 1,
        termId: 1,
        termName: 'FIRST' as const,
        subjectId: 1,
        subjectName: 'Mathematics',
        sectionId: 1,
        sectionName: 'Year 7 Excellence',
        teacherId: 1,
        teacherName: 'Class Teacher 9',
        fileName: 'Week1_Maths_Plan.pdf',
        fileExtension: 'PDF' as const,
        fileSizeKb: 245,
        fileDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        uploadedAt: '2026-10-01T08:30:00.000Z',
        status: 'APPROVED' as const,
        executiveRemarks: []
      }
    ],
    sessionArchives: [],
    promotionLogs: [],
    auditLogs: []
  };

  const backupRecord = createSystemBackupRecord({
    payload: samplePayload,
    createdBy: 'superadmin',
    label: 'Pre-Upgrade Full Backup',
    createdAt: '2026-11-01T09:15:30.000Z'
  });

  assert.equal(backupRecord.createdBy, 'superadmin');
  assert.equal(backupRecord.label, 'Pre-Upgrade Full Backup');
  assert.equal(backupRecord.summary.studentsCount, 1);
  assert.equal(backupRecord.summary.scoresCount, 1);
  assert.equal(backupRecord.summary.documentsCount, 1);
  assert.ok(backupRecord.fileName.endsWith('.ebkp.json'));
  assert.ok(backupRecord.sizeBytes > 100);
  assert.ok(formatBackupTimestamp(backupRecord.createdAt).includes('2026-11-01'));
  assert.ok(formatByteSize(backupRecord.sizeBytes).includes('KB'));

  const serialized = JSON.stringify(backupRecord, null, 2);
  const parsedResult = validateAndParseBackupFile(serialized);
  assert.equal(parsedResult.valid, true);
  assert.ok(parsedResult.backup);
  assert.equal(parsedResult.backup?.payload.students[0].fullName, 'Student One');
  assert.equal(parsedResult.backup?.payload.scores[0].score, 4.5);
  assert.deepEqual(parsedResult.backup?.payload.reportCardSubjectOrder, { JUNIOR: [1], SENIOR: [] });
  assert.equal(parsedResult.backup?.payload.teacherDocumentUploads?.[0].fileName, 'Week1_Maths_Plan.pdf');
  assert.equal(
    parsedResult.backup?.payload.teacherDocumentUploads?.[0].fileDataUrl,
    'data:application/pdf;base64,JVBERi0xLjQK'
  );

  const invalidResult = validateAndParseBackupFile('{"invalid": true}');
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.error);
});

test('Seed data cleanup: preserves classes, subjects, and all seeded staff roles', () => {
  assert.equal(initialStudents.length, 0);
  assert.ok(initialClassSections.length > 0);
  assert.ok(initialSubjects.length > 0);
  assert.equal(initialUsers.length, 10);
  assert.equal(new Set(initialUsers.map(user => user.id)).size, initialUsers.length);

  const roles = initialUsers.map(u => u.role);
  assert.ok(roles.includes('SUPER_ADMIN'));
  assert.ok(roles.includes('PRINCIPAL'));
  assert.ok(roles.includes('HEAD_OF_SCHOOLS'));
  assert.ok(roles.includes('VICE_PRINCIPAL'));
  assert.ok(roles.includes('CLASS_TEACHER') || roles.includes('SUBJECT_TEACHER'));
});

test('Duplicate Students Audit & Parallel Transfer Warning: detects identical name + scores in same class and warns on transfer', () => {
  const sections = [
    { id: 1, name: 'YEAR 7 EXCELLENCE' },
    { id: 2, name: 'YEAR 7 RESILIENCE' }
  ];

  const students = [
    { id: 101, admissionNumber: 'STU-001', fullName: 'Student Alpha', currentSectionId: 1, gender: 'MALE' as const },
    { id: 102, admissionNumber: 'STU-002', fullName: 'STUDENT ALPHA', currentSectionId: 1, gender: 'MALE' as const },
    { id: 103, admissionNumber: 'STU-003', fullName: 'Student Alpha', currentSectionId: 1, gender: 'MALE' as const }, // different scores
    { id: 201, admissionNumber: 'STU-004', fullName: 'Student Beta', currentSectionId: 1, gender: 'FEMALE' as const },
    { id: 202, admissionNumber: 'STU-005', fullName: 'Student Beta', currentSectionId: 2, gender: 'FEMALE' as const }
  ];

  const scores = [
    { studentId: 101, subjectId: 1, componentId: 1, score: 4 },
    { studentId: 101, subjectId: 1, componentId: 5, score: 16 },
    { studentId: 102, subjectId: 1, componentId: 1, score: 4 },
    { studentId: 102, subjectId: 1, componentId: 5, score: 16 },
    { studentId: 103, subjectId: 1, componentId: 1, score: 2 },
    { studentId: 103, subjectId: 1, componentId: 5, score: 10 },
    { studentId: 201, subjectId: 1, componentId: 1, score: 5 },
    { studentId: 202, subjectId: 1, componentId: 1, score: 5 }
  ];

  const groups = detectDuplicateStudents({
    students,
    classSections: sections,
    scores,
    termSubjectRecords: []
  });

  // Only students 101 and 102 have the exact same name AND exact same scores in the same class (section 1)
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sectionId, 1);
  assert.equal(groups[0].students.length, 2);
  assert.deepEqual(groups[0].students.map(s => s.id), [101, 102]);

  // Moving Student Beta (id 201) from Section 1 to Section 2 where Student Beta (id 202) already exists
  const transferCheck = checkDuplicateStudentsOnTransfer({
    studentIdsToTransfer: [201],
    destinationSectionId: 2,
    students,
    scores,
    termSubjectRecords: []
  });

  assert.equal(transferCheck.hasDuplicates, true);
  assert.equal(transferCheck.conflicts.length, 1);
  assert.equal(transferCheck.conflicts[0].sourceStudent.id, 201);
  assert.equal(transferCheck.conflicts[0].existingDestinationStudent.id, 202);
  assert.equal(transferCheck.conflicts[0].hasIdenticalScores, true);
});

test('Zero-Downtime Software Update Engine: builds & extracts ZIP package, validates SQL safety, and auto-reverts on failure', async () => {
  const zipBytes = createUpdatePackageZipBytes(DEFAULT_SAMPLE_UPDATE_MANIFEST);
  assert.ok(zipBytes.length > 200);
  // PKZIP signature
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);

  const extracted = await extractUpdateManifestFromPackageBytes(
    zipBytes,
    'EduGrade_Update_v6.7.0_CA_Component_Scores.zip'
  );
  assert.equal(extracted.ok, true);
  assert.equal(extracted.manifest?.version, '6.7.0');
  assert.ok(extracted.extractedFiles.includes('update-manifest.json'));

  // Destructive SQL should be blocked by validateUpdatePackageSafety
  const unsafeCheck = validateUpdatePackageSafety({
    ...DEFAULT_SAMPLE_UPDATE_MANIFEST,
    databaseSchemaMigrations: [
      {
        id: 'bad_mig',
        description: 'Unsafe drop',
        sqlStatement: 'DROP DATABASE edugrade_db;',
        isNonDestructive: false
      }
    ]
  });
  assert.equal(unsafeCheck.valid, false);

  // Successful zero-downtime update
  let currentVersion = '6.6.0';
  const successTx = await executeZeroDowntimeUpdateTransaction({
    manifest: DEFAULT_SAMPLE_UPDATE_MANIFEST,
    currentVersion,
    currentStateSnapshot: { version: currentVersion },
    actorName: 'superadmin',
    applyDatabaseMigrations: async () => ({ ok: true }),
    applyStateUpdate: manifest => {
      currentVersion = manifest.version;
      return { version: currentVersion };
    },
    restoreStateOnRollback: snapshot => {
      currentVersion = snapshot.version;
    }
  });
  assert.equal(successTx.ok, true);
  assert.equal(successTx.rolledBack, false);
  assert.equal(currentVersion, '6.7.0');

  // Failed update must automatically revert to previous version
  const failedTx = await executeZeroDowntimeUpdateTransaction({
    manifest: { ...DEFAULT_SAMPLE_UPDATE_MANIFEST, version: '6.8.0', simulateFailure: true },
    currentVersion,
    currentStateSnapshot: { version: currentVersion },
    actorName: 'superadmin',
    applyStateUpdate: manifest => {
      currentVersion = manifest.version;
      return { version: currentVersion };
    },
    restoreStateOnRollback: snapshot => {
      currentVersion = snapshot.version;
    }
  });
  assert.equal(failedTx.ok, false);
  assert.equal(failedTx.rolledBack, true);
  assert.equal(currentVersion, '6.7.0');
});

test('sortStudentsForGridAndRegistry sorts students alphabetically (AZ / ZA) and by admission number', () => {
  const sampleStudents = [
    { id: 1, fullName: 'Student Beta', admissionNumber: 'STU-003' },
    { id: 2, fullName: 'Student Gamma', admissionNumber: 'STU-010' },
    { id: 3, fullName: 'Student Alpha', admissionNumber: 'STU-001' }
  ];

  const sortedAZ = sortStudentsForGridAndRegistry(sampleStudents, 'AZ');
  assert.deepEqual(sortedAZ.map(s => s.fullName), [
    'Student Alpha',
    'Student Beta',
    'Student Gamma'
  ]);

  const sortedZA = sortStudentsForGridAndRegistry(sampleStudents, 'ZA');
  assert.deepEqual(sortedZA.map(s => s.fullName), [
    'Student Gamma',
    'Student Beta',
    'Student Alpha'
  ]);

  const sortedAdmAsc = sortStudentsForGridAndRegistry(sampleStudents, 'ADM_ASC');
  assert.deepEqual(sortedAdmAsc.map(s => s.admissionNumber), [
    'STU-001',
    'STU-003',
    'STU-010'
  ]);

  const sortedDefault = sortStudentsForGridAndRegistry(sampleStudents, 'DEFAULT');
  assert.deepEqual(sortedDefault.map(s => s.id), [1, 2, 3]);
});

test('resolveExpandedCaComponentScores resolves stored sub-scores, grid scores, and proportional breakdown without showing dashes', () => {
  // 1. Grid scores entered for CA1 (e.g. from CA grid or CSV)
  const fromGrid = resolveExpandedCaComponentScores({
    caType: 'ca1',
    levelType: 'JUNIOR',
    gridScoresByCode: {
      CW: 4.5,
      QZ: 3.5,
      ASS: 5.0,
      PJ: 4.0,
      TEST: 18.0
    }
  });
  assert.equal(fromGrid.cw, 4.5);
  assert.equal(fromGrid.qz, 3.5);
  assert.equal(fromGrid.ass, 5.0);
  assert.equal(fromGrid.pj, 4.0);
  assert.equal(fromGrid.test, 18.0);

  // 2. Stored details with explicit 0 are preserved (0 is not replaced by null or -)
  const withZero = resolveExpandedCaComponentScores({
    caType: 'ca1',
    levelType: 'SENIOR',
    storedDetails: {
      cw: 0,
      qz: 2,
      ass: 4,
      test: 15
    }
  });
  assert.equal(withZero.cw, 0);
  assert.equal(withZero.qz, 2);
  assert.equal(withZero.ass, 4);
  assert.equal(withZero.test, 15);

  // 3. CA2 with scaledCaScore only (e.g. 15.0 / 15.0 max in Senior) derives proportional sub-scores
  const seniorCa2 = resolveExpandedCaComponentScores({
    caType: 'ca2',
    levelType: 'SENIOR',
    scaledCaScore: 15.0 // raw is 30.0 (2 + 5 + 3 + 20)
  });
  assert.equal(seniorCa2.cw, 2.0);
  assert.equal(seniorCa2.ass, 5.0);
  assert.equal(seniorCa2.qz, 3.0);
  assert.equal(seniorCa2.test, 20.0);
});
