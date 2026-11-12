/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../types/index';
import {
  ALLOWED_ROLES,
  normalizeUserRole,
  canAccessMasterSettings,
  canAccessClassManagement,
  canAccessDatabaseConfig,
  canPrintOrDownload,
  canManageStaffAuth,
  getAllowedTabsForRole,
  getClassGradingScale,
  parseCsvIncludeFlag,
  buildCsvImportedSubject,
  findCsvSubjectMatch,
  parseBulkCsvWithSubjectInclusion,
  parsePersistedStaffSession,
  serializePersistedStaffSession,
  generateTeacherUsername,
  generateFourDigitPin,
  validateStrictPassword,
  verifyInitialLoginPin,
  INACTIVITY_TIMEOUT_MS,
  createPasswordlessTeacherAccount,
  completeFirstTimePasswordSetup,
  requestPasswordReset,
  approvePasswordResetByAdmin,
  resolveInstitutionLogoUrl,
  DEFAULT_INSTITUTION_LOGO_DATA_URI,
  canFreelySwitchRoles,
  hasAllSubjectsClearance,
  getTeacherAssignedSubjectIdsForSection,
  analyzeCsvEnrollmentRequirements,
  DEFAULT_SUPER_ADMIN_PROFILE,
  isSuperAdminAccount,
  getTeachersCornerTabTitle,
  isYear12GraduationClass,
  validatePromotionSelection,
  generateStudentTestimonialRecord,
  DEFAULT_ACADEMIC_DEPARTMENTS,
  getTeacherHodDesignation,
  getDepartmentForSubject
} from './rbacAndAuth.ts';
import {
  DEFAULT_GRADING_SCALE_PRESETS,
  resolveActiveGradingScaleBands,
  determineGrade
} from './academicCalculations.ts';
import {
  DocumentCacheManager,
  computeDocumentETag,
  formatSortedDocumentDownloadName
} from './documentCacheEngine.ts';
import { AssessmentComponent, Student, Subject, SchoolProfile, GradingScalePreset, TeacherDocumentUpload } from '../types/index.ts';
import { initialAssessmentScores, initialTermSummaries, initialTermSubjectRecords } from '../data/initialScores.ts';
import { initialScoreAuditLogs, initialUsers } from '../data/seedData.ts';

test('Independent Super Admin Profile vs Regular Teacher Separation', () => {
  assert.equal(DEFAULT_SUPER_ADMIN_PROFILE.fullName, 'Administrator');
  assert.equal(DEFAULT_SUPER_ADMIN_PROFILE.username, 'superadmin');
  assert.equal(DEFAULT_SUPER_ADMIN_PROFILE.role, 'SUPER_ADMIN');
  assert.equal(DEFAULT_SUPER_ADMIN_PROFILE.staffId, 'ADMIN-01');

  assert.equal(isSuperAdminAccount('superadmin'), true);
  assert.equal(isSuperAdminAccount('SUPERADMIN'), true);
  assert.equal(isSuperAdminAccount('admin'), true);
  assert.equal(isSuperAdminAccount('class.teacher.9'), false);
  assert.equal(isSuperAdminAccount('subject.teacher.2'), false);

  const superAdminUser = initialUsers.find(u => u.role === 'SUPER_ADMIN');
  assert.ok(superAdminUser);
  assert.equal(superAdminUser.fullName, 'Administrator');
  assert.equal(superAdminUser.username, 'superadmin');
  assert.equal('initialPin' in superAdminUser, false);

  const sampleTeacher = initialUsers.find(u => u.username === 'class.teacher.4');
  assert.ok(sampleTeacher);
  assert.equal(sampleTeacher.fullName, 'Class Teacher 4');
  assert.equal(sampleTeacher.role, 'CLASS_TEACHER');
});

test('Strict Role Switching & Subject Clearance Compliance', () => {
  // Only SUPER_ADMIN when logged in can freely switch roles without a password modal
  assert.equal(canFreelySwitchRoles('SUPER_ADMIN', true, 'SUPER_ADMIN'), true);
  assert.equal(canFreelySwitchRoles('SUPER_ADMIN', false, 'SUPER_ADMIN'), false);
  assert.equal(canFreelySwitchRoles('PRINCIPAL', true, 'PRINCIPAL'), false);
  assert.equal(canFreelySwitchRoles('VICE_PRINCIPAL', true, 'VICE_PRINCIPAL'), false);
  assert.equal(canFreelySwitchRoles('CLASS_TEACHER', true, 'CLASS_TEACHER'), false);
  assert.equal(canFreelySwitchRoles('SUBJECT_TEACHER', true, 'SUBJECT_TEACHER'), false);

  // Super Admin, Principal, and Vice Principal have full clearance to view all subjects
  assert.equal(hasAllSubjectsClearance('SUPER_ADMIN'), true);
  assert.equal(hasAllSubjectsClearance('PRINCIPAL'), true);
  assert.equal(hasAllSubjectsClearance('HEAD_OF_SCHOOLS'), true);
  assert.equal(hasAllSubjectsClearance('VICE_PRINCIPAL'), true);

  // Class Teachers and Subject Teachers are restricted to their assigned subjects
  assert.equal(hasAllSubjectsClearance('CLASS_TEACHER'), false);
  assert.equal(hasAllSubjectsClearance('SUBJECT_TEACHER'), false);

  const assignments = [
    { sectionId: 1, subjectId: 2 },
    { sectionId: 1, subjectId: 5 },
    { sectionId: 2, subjectId: 4 }
  ];
  assert.deepEqual(getTeacherAssignedSubjectIdsForSection(assignments, 1), [2, 5]);
  assert.deepEqual(getTeacherAssignedSubjectIdsForSection(assignments, 2), [4]);
  assert.deepEqual(getTeacherAssignedSubjectIdsForSection(assignments, 3), []);
});

test('Roles & RBAC: Head of Schools shares executive permissions but not database configuration access', () => {
  const roleCodes = ALLOWED_ROLES.map(r => r.role);
  assert.deepEqual(roleCodes, [
    'SUPER_ADMIN',
    'PRINCIPAL',
    'HEAD_OF_SCHOOLS',
    'VICE_PRINCIPAL',
    'CLASS_TEACHER',
    'SUBJECT_TEACHER'
  ]);

  // Legacy role normalization (e.g., STUDENT removed -> defaults to PRINCIPAL)
  assert.equal(normalizeUserRole('STUDENT'), 'PRINCIPAL');
  assert.equal(normalizeUserRole('VICE_PRINCIPAL'), 'VICE_PRINCIPAL');

  // Super Admin: All views including Master Settings, Class Management & MySQL/phpMyAdmin
  assert.equal(canAccessMasterSettings('SUPER_ADMIN'), true);
  assert.equal(canAccessClassManagement('SUPER_ADMIN'), true);
  assert.equal(canAccessDatabaseConfig('SUPER_ADMIN'), true);
  assert.equal(canPrintOrDownload('SUPER_ADMIN'), true);
  assert.equal(getAllowedTabsForRole('SUPER_ADMIN').includes('settings'), true);
  assert.equal(getAllowedTabsForRole('SUPER_ADMIN').includes('class_management'), true);

  // Principal, Head of Schools, and Vice Principal share executive permissions.
  for (const execRole of ['PRINCIPAL', 'HEAD_OF_SCHOOLS', 'VICE_PRINCIPAL'] as const) {
    assert.equal(canAccessMasterSettings(execRole), true);
    assert.equal(canAccessClassManagement(execRole), true);
    assert.equal(canAccessDatabaseConfig(execRole), false);
    assert.equal(canPrintOrDownload(execRole), true);
    assert.equal(canManageStaffAuth(execRole), true);
    assert.equal(getAllowedTabsForRole(execRole).includes('settings'), true);
    assert.equal(getAllowedTabsForRole(execRole).includes('class_management'), true);
  }

  // Class Teacher & Subject Teacher: All views EXCEPT Class Management, Master Settings & MySQL/phpMyAdmin; cannot print/download
  for (const teacherRole of ['CLASS_TEACHER', 'SUBJECT_TEACHER'] as const) {
    assert.equal(canAccessMasterSettings(teacherRole), false);
    assert.equal(canAccessClassManagement(teacherRole), false);
    assert.equal(canAccessDatabaseConfig(teacherRole), false);
    assert.equal(canPrintOrDownload(teacherRole), false);
    assert.equal(canManageStaffAuth(teacherRole), false);
    assert.equal(getAllowedTabsForRole(teacherRole).includes('settings'), false);
    assert.equal(getAllowedTabsForRole(teacherRole).includes('class_management'), false);
    assert.equal(getAllowedTabsForRole(teacherRole).includes('report'), true);
    assert.equal(getAllowedTabsForRole(teacherRole).includes('home'), true);
  }
});

test('Bulk CSV Import: Parses include=true/false and identifies unregistered/extra students for enrollment modal', () => {
  assert.deepEqual(parseCsvIncludeFlag('true'), { isExplicitIncludeColumn: true, isIncluded: true });
  assert.deepEqual(parseCsvIncludeFlag('false'), { isExplicitIncludeColumn: true, isIncluded: false });
  assert.deepEqual(parseCsvIncludeFlag('include=true'), { isExplicitIncludeColumn: true, isIncluded: true });
  assert.deepEqual(parseCsvIncludeFlag('include=false'), { isExplicitIncludeColumn: true, isIncluded: false });

  const mockStudents: Student[] = [
    {
      id: 1,
      admissionNumber: 'STU-0101',
      fullName: 'Student One',
      currentSectionId: 7,
      gender: 'FEMALE'
    }
  ];

  const mockSubjects: Subject[] = [
    { id: 1, name: 'ENGLISH LANGUAGE', code: 'ENGL', category: 'CORE', applicableLevel: 'SENIOR' },
    { id: 8, name: 'FURTHER MATHEMATICS', code: 'FURT', category: 'OPTIONAL', applicableLevel: 'SENIOR' }
  ];

  const mockComponents: AssessmentComponent[] = [
    { id: 1, termId: 1, levelType: 'SENIOR', name: 'Quiz', shortCode: 'QZ', maxScore: 3, weightOrder: 1 },
    { id: 2, termId: 1, levelType: 'SENIOR', name: 'Classwork', shortCode: 'CW', maxScore: 2, weightOrder: 2 }
  ];

  const csvContent = [
    'Student Name,Admission Number,Subject,Include,QZ,CW',
    '"Student One","STU-0101","ENGLISH LANGUAGE",true,2.5,2.0',
    '"Student One","STU-0101","FURTHER MATHEMATICS",include=false,0,0',
    '"Student Two","STU-0901","ENGLISH LANGUAGE",true,3.0,2.0',
    '"Student Three","STU-0902","ENGLISH LANGUAGE",true,2.5,1.5'
  ].join('\n');

  const parsed = parseBulkCsvWithSubjectInclusion({
    csvText: csvContent,
    students: mockStudents,
    subjects: mockSubjects,
    defaultSubject: mockSubjects[0],
    components: mockComponents
  });

  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].isExisting, true);
  assert.equal(parsed[0].subjectScores.length, 2);
  assert.equal(parsed[0].subjectScores[0].subjectId, 1);
  assert.equal(parsed[0].subjectScores[0].isIncluded, true);
  assert.equal(parsed[0].subjectScores[0].scores[1], 2.5);
  assert.equal(parsed[0].subjectScores[1].subjectId, 8);
  assert.equal(parsed[0].subjectScores[1].isIncluded, false);

  // Verify analyzeCsvEnrollmentRequirements triggers when CSV has more students than registered in the class
  const enrollmentAnalysis = analyzeCsvEnrollmentRequirements(parsed, mockStudents);
  assert.equal(enrollmentAnalysis.csvStudentCount, 3);
  assert.equal(enrollmentAnalysis.registeredStudentCount, 1);
  assert.equal(enrollmentAnalysis.exceedsRegisteredCount, true);
  assert.equal(enrollmentAnalysis.extraStudentCount, 2);
  assert.equal(enrollmentAnalysis.unregisteredGroups.length, 2);
  assert.equal(enrollmentAnalysis.unregisteredGroups[0].name, 'Student Two');
  assert.equal(enrollmentAnalysis.unregisteredGroups[1].name, 'Student Three');
  assert.equal(enrollmentAnalysis.requiresEnrollmentModal, true);
});

test('Clean Slate Initial Scores: All student scores across all terms start empty for fresh local server publish', () => {
  assert.equal(initialAssessmentScores.length, 0);
  assert.equal(initialTermSummaries.length, 0);
  assert.equal(initialTermSubjectRecords.length, 0);
  assert.equal(initialScoreAuditLogs.length, 0);
});

test('Persisted staff sessions restore across refresh only while authenticated and within the idle timeout', () => {
  const now = 2_000_000;
  const account: User = {
    id: 999,
    fullName: 'Administrator',
    username: 'superadmin',
    email: 'admin@example.test',
    role: 'SUPER_ADMIN',
    isActive: true,
    initialPin: generateFourDigitPin()
  };
  const serialized = serializePersistedStaffSession(account, account.role, now - 1000);
  const restored = parsePersistedStaffSession(serialized, now);

  assert.equal(restored?.user.id, account.id);
  assert.equal(restored?.role, 'SUPER_ADMIN');
  assert.equal('initialPin' in (restored?.user || {}), false);
  assert.equal(parsePersistedStaffSession(serialized, now + INACTIVITY_TIMEOUT_MS), null);
  assert.equal(parsePersistedStaffSession(serialized, now - INACTIVITY_TIMEOUT_MS), null);
  assert.equal(parsePersistedStaffSession('{invalid json', now), null);
  assert.equal(
    parsePersistedStaffSession(
      JSON.stringify({
        user: { ...account, role: 'SUPER_ADMIN' },
        role: 'SUPER_ADMIN',
        lastActivityAt: now + 1
      }),
      now
    ),
    null
  );
});

test('4-Digit Initial PIN, Strict Password Policy (>8 chars, 1 uppercase, 1 number/special) & 30-Min Inactivity Timeout', () => {
  assert.equal(INACTIVITY_TIMEOUT_MS, 30 * 60 * 1000);
  assert.equal(generateTeacherUsername('Sample Teacher'), 'sample.teacher');

  const pin = generateFourDigitPin();
  assert.match(pin, /^\d{4}$/);

  // Strict password validation rules:
  // 1) 8 chars is NOT longer than 8 chars -> must fail
  assert.equal(validateStrictPassword('Abcdef1!').valid, false);
  assert.equal(validateStrictPassword('Abcdef1!').hasMinLength, false);

  // 2) 9 chars but no uppercase -> must fail
  assert.equal(validateStrictPassword('abcdefg1!').valid, false);
  assert.equal(validateStrictPassword('abcdefg1!').hasUppercase, false);

  // 3) 9 chars with uppercase but no number or special char -> must fail
  assert.equal(validateStrictPassword('Abcdefghi').valid, false);
  assert.equal(validateStrictPassword('Abcdefghi').hasNumberOrSpecial, false);

  // 4) 9+ chars with uppercase and number or special character -> must pass
  assert.equal(validateStrictPassword('Abcdefgh1').valid, true);
  assert.equal(validateStrictPassword('BlueHorizon!').valid, true);

  // Create teacher with 4-digit PIN
  const created = createPasswordlessTeacherAccount({
    fullName: 'Sample Principal',
    username: 'ibrahim.musa',
    role: 'SUBJECT_TEACHER'
  });
  assert.match(created.initialPin, /^\d{4}$/);
  assert.equal(created.mustSetPassword, true);
  assert.equal(created.hasPasswordSet, false);
  assert.equal(created.passwordResetRequested, false);

  // Wrong 4-digit PIN fails verification
  const wrongPinCheck = verifyInitialLoginPin(created, '0000');
  if (created.initialPin !== '0000') {
    assert.equal(wrongPinCheck.ok, false);
  }
  assert.equal(verifyInitialLoginPin(created, created.initialPin).ok, true);

  // Reject weak password on first login (even with valid PIN)
  const weakAttempt = completeFirstTimePasswordSetup(created, 'Short1!', created.initialPin);
  assert.equal(weakAttempt.ok, false);
  assert.equal(weakAttempt.updatedAccount.mustSetPassword, true);

  // Complete first-time password setup with valid PIN and strict password (>8 chars, 1 uppercase, 1 number/special)
  const setupDone = completeFirstTimePasswordSetup(created, 'SecurePass#2026', created.initialPin);
  assert.equal(setupDone.ok, true);
  assert.equal(setupDone.updatedAccount.mustSetPassword, false);
  assert.equal(setupDone.updatedAccount.hasPasswordSet, true);

  // Forgotten password -> user requests reset
  const requested = requestPasswordReset(setupDone.updatedAccount);
  assert.equal(requested.passwordResetRequested, true);

  // Class teacher cannot approve reset
  const unauthorizedReset = approvePasswordResetByAdmin(requested, 'CLASS_TEACHER');
  assert.equal(unauthorizedReset.ok, false);

  // Vice Principal approves reset -> generates new 4-digit PIN and requires new password on next login
  const approvedByVp = approvePasswordResetByAdmin(requested, 'VICE_PRINCIPAL', '5829');
  assert.equal(approvedByVp.ok, true);
  assert.equal(approvedByVp.updatedAccount.initialPin, '5829');
  assert.equal(approvedByVp.updatedAccount.mustSetPassword, true);
  assert.equal(approvedByVp.updatedAccount.passwordResetRequested, false);
  assert.equal(approvedByVp.updatedAccount.hasPasswordSet, false);
});

test('Grading Scale & Institutional Logo Resolution', () => {
  const juniorScale = getClassGradingScale('JUNIOR');
  const seniorScale = getClassGradingScale('SENIOR');
  assert.equal(juniorScale.length, 6);
  assert.equal(seniorScale.length, 9);
  assert.equal(seniorScale[1].grade, 'B1');
  assert.equal(juniorScale[1].grade, 'B');

  // Broken legacy logo path automatically resolves to embedded SVG data URI
  assert.equal(
    resolveInstitutionLogoUrl('/assets/aistudio/cellImage_1151144331_0_d9161c7f.jpg'),
    DEFAULT_INSTITUTION_LOGO_DATA_URI
  );
  // Uploaded PNG data URL is preserved
  const customPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal(resolveInstitutionLogoUrl(customPng), customPng);
});

test("Teacher's Corner & Executive Office Role-Specific Titles, Promotion Validation & Year 12 Graduation Testimonial", () => {
  // 1. Role-specific Office / Teacher's Corner titles
  assert.equal(getTeachersCornerTabTitle('SUPER_ADMIN'), "Super User's Office");
  assert.equal(getTeachersCornerTabTitle('PRINCIPAL'), "Principal's Office");
  assert.equal(getTeachersCornerTabTitle('HEAD_OF_SCHOOLS'), "Head of Schools' Office");
  assert.equal(getTeachersCornerTabTitle('VICE_PRINCIPAL'), "Vice Principal's Office");
  assert.equal(getTeachersCornerTabTitle('CLASS_TEACHER'), "Teacher's Corner");
  assert.equal(getTeachersCornerTabTitle('SUBJECT_TEACHER'), "Teacher's Corner");

  // 2. Year 12 final class detection
  assert.equal(isYear12GraduationClass('YEAR 12 EXCELLENCE'), true);
  assert.equal(isYear12GraduationClass('SS 3 SCIENCE'), true);
  assert.equal(isYear12GraduationClass('YEAR 11 EXCELLENCE'), false);
  assert.equal(isYear12GraduationClass('YEAR 7 RESILIENCE'), false);

  // 3. Promotion Validation: blocks when next session is not created/selected or next class is missing
  const missingNextSession = validatePromotionSelection({
    sourceSectionName: 'YEAR 7 EXCELLENCE',
    sourceSectionId: 1,
    destinationSectionId: 3,
    currentSessionId: 1,
    destinationSessionId: 1, // same as current session -> must block
    availableSessionsCount: 1
  });
  assert.equal(missingNextSession.valid, false);
  assert.equal(missingNextSession.isGraduation, false);
  assert.ok(missingNextSession.errorTitle?.includes('Next Academic Session'));

  const missingNextClass = validatePromotionSelection({
    sourceSectionName: 'YEAR 7 EXCELLENCE',
    sourceSectionId: 1,
    destinationSectionId: 0, // no destination class selected -> must block
    currentSessionId: 1,
    destinationSessionId: 2,
    availableSessionsCount: 2
  });
  assert.equal(missingNextClass.valid, false);
  assert.ok(missingNextClass.errorTitle?.includes('Destination Class'));

  const validRegularPromotion = validatePromotionSelection({
    sourceSectionName: 'YEAR 7 EXCELLENCE',
    sourceSectionId: 1,
    destinationSectionId: 3,
    currentSessionId: 1,
    destinationSessionId: 2,
    availableSessionsCount: 2
  });
  assert.equal(validRegularPromotion.valid, true);
  assert.equal(validRegularPromotion.isGraduation, false);

  // Year 12 Graduation is valid without needing a next class
  const validYear12Graduation = validatePromotionSelection({
    sourceSectionName: 'YEAR 12 EXCELLENCE',
    sourceSectionId: 11,
    destinationSectionId: 11,
    currentSessionId: 1,
    destinationSessionId: 1,
    availableSessionsCount: 1
  });
  assert.equal(validYear12Graduation.valid, true);
  assert.equal(validYear12Graduation.isGraduation, true);

  // 4. Auto-generated School Testimonial record for Year 12 Graduate
  const mockStudent: Student = {
    id: 1201,
    admissionNumber: 'STU-1201',
    fullName: 'Student Graduate',
    currentSectionId: 11,
    gender: 'FEMALE'
  };
  const mockSchool: SchoolProfile = {
    name: 'Sample School',
    motto: 'CHARACTER AND KNOWLEDGE',
    address: 'School Street',
    phone: '',
    email: 'info@example.invalid',
    logoUrl: DEFAULT_INSTITUTION_LOGO_DATA_URI,
    principalName: 'Principal',
    formTeacherName: 'Class Teacher 9',
    reportDate: '27/10/2026',
    currentSession: '2026/27',
    currentTerm: 'THIRD'
  };

  const testimonial = generateStudentTestimonialRecord({
    student: mockStudent,
    schoolProfile: mockSchool,
    sectionName: 'YEAR 12 EXCELLENCE',
    sessionName: '2026/27',
    subjectsStudied: ['Mathematics', 'English Language', 'Biology', 'Economics', 'Government'],
    cumulativeAvgPct: 78.5,
    finalGrade: 'A1'
  });

  assert.equal(testimonial.studentName, 'Student Graduate');
  assert.equal(testimonial.recordSignature, 'GRADUATED');
  assert.equal(testimonial.academicAbility, 'EXCELLENT');
  assert.equal(testimonial.subjectsStudied.length, 5);
});

test('Heads of Department (HOD) System: Department Creation, Subject Mapping & Teacher Office Designation', () => {
  assert.equal(DEFAULT_ACADEMIC_DEPARTMENTS.length, 3);

  // Class Teacher 9 (id: 11) is HOD of Department of Sciences & Mathematics
  const sarahHod = getTeacherHodDesignation(
    11,
    DEFAULT_ACADEMIC_DEPARTMENTS,
    'class.teacher.9',
    'Class Teacher 9'
  );
  assert.equal(sarahHod.isHod, true);
  assert.ok(sarahHod.designationBadge?.includes('Head of Department (Department of Sciences & Mathematics)'));
  assert.ok(sarahHod.officeTitle?.includes("HOD's Office"));
  assert.ok(sarahHod.hodSubjectIds.includes(1)); // Mathematics

  // Subject 1 (Mathematics) maps to Department of Sciences & Mathematics
  const mathDept = getDepartmentForSubject(1, DEFAULT_ACADEMIC_DEPARTMENTS);
  assert.ok(mathDept);
  assert.equal(mathDept?.code, 'DEPT-SCI');
  assert.equal(mathDept?.hodTeacherName, 'Class Teacher 9');

  // Regular teacher who is not an HOD returns isHod = false
  const nonHod = getTeacherHodDesignation(
    9,
    DEFAULT_ACADEMIC_DEPARTMENTS,
    'kemi.adeleke',
    'Miss Kemi Adeleke'
  );
  assert.equal(nonHod.isHod, false);
  assert.equal(nonHod.designationBadge, null);
});

test('Customizable Grading Scale System (Comments and Grading) for Junior, Senior & Custom Report Templates', () => {
  assert.equal(DEFAULT_GRADING_SCALE_PRESETS.length, 3);

  // Default Senior scale resolves 85+ to A (Excellent) and 80-84 to B1
  const defaultSeniorBands = resolveActiveGradingScaleBands('SENIOR', DEFAULT_GRADING_SCALE_PRESETS);
  assert.equal(defaultSeniorBands[0].grade, 'A');
  assert.equal(determineGrade(88, 'SENIOR', defaultSeniorBands).grade, 'A');
  assert.equal(determineGrade(82, 'SENIOR', defaultSeniorBands).grade, 'B1');

  // Create and enable a custom Senior grading scale where A* is 85–100 and A is 70–84
  const customSeniorPreset: GradingScalePreset = {
    id: 'SCALE-SENIOR-HONORS',
    name: 'Honors Senior Grading Scale',
    targetScope: 'SENIOR',
    isDefault: false,
    isEnabledForReports: true,
    updatedAt: new Date().toISOString(),
    bands: [
      { minScore: 85, maxScore: 100, grade: 'A*', remark: 'Distinction Honors' },
      { minScore: 70, maxScore: 84, grade: 'A', remark: 'First Class Credit' },
      { minScore: 50, maxScore: 69, grade: 'B', remark: 'Upper Credit' },
      { minScore: 0, maxScore: 49, grade: 'F', remark: 'Needs Remediation' }
    ]
  };

  const presetsWithCustomSenior = [
    ...DEFAULT_GRADING_SCALE_PRESETS.map(p =>
      p.targetScope === 'SENIOR' ? { ...p, isEnabledForReports: false } : p
    ),
    customSeniorPreset
  ];

  const activeSeniorBands = resolveActiveGradingScaleBands('SENIOR', presetsWithCustomSenior);
  assert.equal(activeSeniorBands.length, 4);
  assert.equal(determineGrade(88, 'SENIOR', activeSeniorBands).grade, 'A*');
  assert.equal(determineGrade(78, 'SENIOR', activeSeniorBands).grade, 'A');
  assert.equal(determineGrade(78, 'SENIOR', activeSeniorBands).description, 'First Class Credit');
});

test('Redis / Write-Through LRU Document Cache & Sorted Bulk Download Naming Engine', () => {
  const sampleDoc: TeacherDocumentUpload = {
    id: 'DOC-TEST-1',
    documentTitle: 'Week 1 Linear Equations Lesson Plan',
    category: 'LESSON_PLAN',
    fileName: 'Week1_Linear_Equations.pdf',
    fileExtension: 'PDF',
    fileSizeKb: 420,
    teacherId: 11,
    teacherName: 'Class Teacher 9',
    sectionId: 11,
    sectionName: 'YEAR 12 EXCELLENCE',
    subjectId: 1,
    subjectName: 'Mathematics',
    departmentId: 'DEPT-SCI',
    departmentName: 'Department of Sciences & Mathematics',
    termName: 'FIRST',
    sessionName: '2026/27',
    weekNumber: 1,
    uploadedAt: '2026-10-20T09:00:00.000Z',
    status: 'APPROVED',
    hodReviewStatus: 'HOD_APPROVED',
    hodReviewedBy: 'Class Teacher 9',
    executiveRemarks: []
  };

  // Verify deterministic sorted filename generation across all sort modes
  const byWeekName = formatSortedDocumentDownloadName(sampleDoc, 'WEEK', 0);
  assert.ok(byWeekName.startsWith('01_Week_01_'));
  assert.ok(byWeekName.endsWith(`.${sampleDoc.fileExtension.toLowerCase()}`));

  const bySubjectName = formatSortedDocumentDownloadName(sampleDoc, 'SUBJECT', 1);
  assert.ok(bySubjectName.startsWith('02_Mathematics_'));

  const byDeptName = formatSortedDocumentDownloadName(sampleDoc, 'DEPARTMENT', 2);
  assert.ok(byDeptName.startsWith('03_Department_of_Sciences_Mathematics_'));

  // Verify DocumentCacheManager write-through & zero-DB-bottleneck read hits
  const cacheManager = new DocumentCacheManager({ maxEntries: 128, defaultTtlSeconds: 60 });
  const stored = cacheManager.set(`doc:${sampleDoc.id}`, sampleDoc);
  assert.ok(stored.etag.startsWith('"doc-'));

  const firstRead = cacheManager.get<TeacherDocumentUpload>(`doc:${sampleDoc.id}`);
  assert.ok(firstRead);
  assert.equal(firstRead?.value.documentTitle, sampleDoc.documentTitle);

  const secondRead = cacheManager.get<TeacherDocumentUpload>(`doc:${sampleDoc.id}`);
  assert.ok(secondRead);

  const telemetry = cacheManager.getTelemetry();
  assert.equal(telemetry.cacheHits, 2);
  assert.equal(telemetry.cachedDocumentCount, 1);
  assert.equal(telemetry.dbQueriesSaved, 2);
});

test('parseBulkCsvWithSubjectInclusion leaves unentered component scores blank instead of adding 0', () => {
  const components = [
    { id: 1, termId: 1, name: 'Classwork', shortCode: 'CW', maxScore: 5, weightOrder: 1, levelType: 'JUNIOR' as const },
    { id: 2, termId: 1, name: 'Assignment', shortCode: 'ASS', maxScore: 5, weightOrder: 2, levelType: 'JUNIOR' as const },
    { id: 3, termId: 1, name: 'Quiz', shortCode: 'QZ', maxScore: 5, weightOrder: 3, levelType: 'JUNIOR' as const },
    { id: 4, termId: 1, name: 'Project', shortCode: 'PJ', maxScore: 5, weightOrder: 4, levelType: 'JUNIOR' as const },
    { id: 5, termId: 1, name: 'Test', shortCode: 'TEST', maxScore: 20, weightOrder: 5, levelType: 'JUNIOR' as const }
  ];
  const subjects = [
    { id: 1, name: 'Mathematics', code: 'MTH', applicableLevel: 'BOTH' as const, category: 'CORE' as const }
  ];

  // ASS (col 2) and PJ (col 4) are blank ("", "-") — they must NOT be 0
  const csvText = [
    'Student Name,Admission Number,Subject,Include,CW,ASS,QZ,PJ,TEST',
    '"Student One","STU-2026-001","Mathematics",include=true,4,,3.5,-,17'
  ].join('\n');

  const parsed = parseBulkCsvWithSubjectInclusion({
    csvText,
    students: [],
    subjects,
    defaultSubject: subjects[0],
    components
  });

  assert.equal(parsed.length, 1);
  const scores = parsed[0].subjectScores[0].scores;
  assert.equal(scores[1], 4);
  assert.equal(scores[2], undefined); // left blank, NOT 0
  assert.equal(scores[3], 3.5);
  assert.equal(scores[4], undefined); // left blank, NOT 0
  assert.equal(scores[5], 17);
});

test('parseBulkCsvWithSubjectInclusion preserves quoted commas and maps Junior and Senior headers by component', () => {
  const subject: Subject = {
    id: 1,
    name: 'Language, Arts',
    code: 'LANG',
    category: 'CORE',
    applicableLevel: 'BOTH'
  };
  const seniorComponents: AssessmentComponent[] = [
    { id: 1, termId: 1, levelType: 'SENIOR', name: 'Quiz', shortCode: 'QZ', maxScore: 3, weightOrder: 1 },
    { id: 2, termId: 1, levelType: 'SENIOR', name: 'Classwork', shortCode: 'CW', maxScore: 2, weightOrder: 2 },
    { id: 3, termId: 1, levelType: 'SENIOR', name: 'Assignment', shortCode: 'ASS', maxScore: 5, weightOrder: 3 },
    { id: 4, termId: 1, levelType: 'SENIOR', name: 'Test', shortCode: 'TEST', maxScore: 20, weightOrder: 4 }
  ];
  const juniorComponents: AssessmentComponent[] = [
    { id: 5, termId: 1, levelType: 'JUNIOR', name: 'Quiz', shortCode: 'QZ', maxScore: 5, weightOrder: 1 },
    { id: 6, termId: 1, levelType: 'JUNIOR', name: 'Classwork', shortCode: 'CW', maxScore: 5, weightOrder: 2 },
    { id: 7, termId: 1, levelType: 'JUNIOR', name: 'Assignment', shortCode: 'ASS', maxScore: 5, weightOrder: 3 },
    { id: 8, termId: 1, levelType: 'JUNIOR', name: 'Project', shortCode: 'PJ', maxScore: 5, weightOrder: 4 },
    { id: 9, termId: 1, levelType: 'JUNIOR', name: 'Test', shortCode: 'TEST', maxScore: 20, weightOrder: 5 }
  ];

  const seniorImport = parseBulkCsvWithSubjectInclusion({
    csvText: [
      'Student Name,Admission Number,Subject,Include,TEST (Max 20),CW (Max 2),QZ (Max 3),ASS (Max 5)',
      '"Student, One","STU-2026-001","Language, Arts",true,18,1.5,2.5,4'
    ].join('\r\n'),
    students: [],
    subjects: [subject],
    defaultSubject: subject,
    components: seniorComponents
  });
  const juniorImport = parseBulkCsvWithSubjectInclusion({
    csvText: [
      'Student Name,Admission Number,Subject,Include,ASS,PJ,TEST,QZ,CW',
      '"Sample ""Student""","STU-2026-002","Language, Arts",include=true,4,3.5,17,4.5,5'
    ].join('\n'),
    students: [],
    subjects: [subject],
    defaultSubject: subject,
    components: juniorComponents
  });

  assert.equal(seniorImport[0].name, 'Student, One');
  assert.equal(seniorImport[0].subjectScores[0].subjectId, subject.id);
  assert.deepEqual(seniorImport[0].subjectScores[0].scores, {
    1: 2.5,
    2: 1.5,
    3: 4,
    4: 18
  });
  assert.equal(juniorImport[0].name, 'Sample "Student"');
  assert.deepEqual(juniorImport[0].subjectScores[0].scores, {
    5: 4.5,
    6: 5,
    7: 4,
    8: 3.5,
    9: 17
  });
});

test('CSV subject matching is case-insensitive, level-aware, and retains unknown subject names for creation', () => {
  const juniorSubject: Subject = {
    id: 21,
    name: 'Mathematics',
    code: 'MTH',
    category: 'CORE',
    applicableLevel: 'JUNIOR'
  };
  const seniorSubject: Subject = {
    id: 22,
    name: 'Mathematics',
    code: 'MATH',
    category: 'CORE',
    applicableLevel: 'SENIOR'
  };
  const components: AssessmentComponent[] = [
    { id: 1, termId: 1, levelType: 'JUNIOR', name: 'Quiz', shortCode: 'QZ', maxScore: 5, weightOrder: 1 }
  ];
  const parsed = parseBulkCsvWithSubjectInclusion({
    csvText: [
      'Student Name,Admission Number,Subject,Include,QZ',
      'Student One,,mAtHeMaTiCs,false,4',
      'Student One,,New Life Skills,false,3'
    ].join('\n'),
    students: [],
    subjects: [seniorSubject, juniorSubject],
    defaultSubject: juniorSubject,
    components,
    levelType: 'JUNIOR'
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].subjectScores[0].subjectId, juniorSubject.id);
  assert.equal(parsed[0].subjectScores[0].isIncluded, true);
  assert.equal(parsed[0].subjectScores[1].subjectId, 0);
  assert.equal(parsed[0].subjectScores[1].subjectName, 'New Life Skills');
  assert.equal(parsed[0].subjectScores[1].isIncluded, true);
});

test('CSV subject matching normalizes punctuation and safely corrects a one-character typo', () => {
  const subjects: Subject[] = [
    { id: 1, name: 'C.R.S', code: 'CR', category: 'OPTIONAL', applicableLevel: 'SENIOR' },
    { id: 2, name: 'Digital Technologies', code: 'DIGI', category: 'CORE', applicableLevel: 'JUNIOR' }
  ];

  assert.equal(findCsvSubjectMatch('C R S', subjects, 'SENIOR')?.id, 1);
  assert.equal(findCsvSubjectMatch('Digital Technologie', subjects, 'JUNIOR')?.id, 2);
});

test('CSV-created Junior subjects are Core and receive a unique code', () => {
  const existingSubjects: Subject[] = [
    { id: 1, name: 'Local Studies', code: 'LS', category: 'CORE', applicableLevel: 'JUNIOR' }
  ];
  const definition = buildCsvImportedSubject('Life Skills', 'JUNIOR', existingSubjects);
  const nextDefinition = buildCsvImportedSubject(
    'Learning Support',
    'JUNIOR',
    [...existingSubjects, { ...definition, id: 2 }]
  );

  assert.deepEqual(definition, {
    name: 'LIFE SKILLS',
    code: 'LS2',
    category: 'CORE',
    applicableLevel: 'JUNIOR'
  });
  assert.equal(nextDefinition.code, 'LS3');
});
