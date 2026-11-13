/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  User,
  UserRole,
  AcademicSession,
  Term,
  ClassLevel,
  ClassSection,
  Student,
  Subject,
  AssessmentComponent,
  StudentSubjectEnrollment,
  AssessmentScore,
  StudentTermSummary,
  TermSubjectRecord,
  StudentAnnualSummary,
  ScoreAuditLog,
  CommentBankItem,
  GradingScale,
  OldSheetData,
  SchoolProfile,
  ReportType,
  Teacher,
  TeacherSubjectAssignment,
  CustomReportTemplate,
  AcademicSessionArchive,
  StudentPromotionRecord,
  TermName,
  OfficeMessage,
  RequiredDocumentSlot,
  TeacherDocumentUpload,
  StudentTestimonial,
  PromotionDecision,
  AcademicDepartment,
  GradingScalePreset,
  GradingScaleBand,
  LevelType,
  ReportCardSubjectOrder,
  DEFAULT_REPORT_CARD_SUBJECT_ORDER
} from '../types/index';
import {
  initialSessions,
  initialTerms,
  initialClassLevels,
  initialClassSections,
  initialUsers,
  initialSubjects,
  initialAssessmentComponents,
  initialStudents,
  initialCommentBank,
  initialScoreAuditLogs,
  initialOldSheets
} from '../data/seedData';
import {
  initialEnrollments,
  initialAssessmentScores,
  initialTermSummaries,
  initialTermSubjectRecords
} from '../data/initialScores';
import {
  calculateCumulativePercentage,
  determineGrade,
  calculateStudentOverallSummary,
  calculateClassRanks,
  calculateAnnualAverage,
  SENIOR_GRADING_SCALES,
  JUNIOR_GRADING_SCALES,
  DEFAULT_GRADING_SCALE_PRESETS,
  resolveActiveGradingScaleBands
} from '../utils/academicCalculations';
import {
  generatePhpMyAdminSqlDump,
  FullDatabaseSnapshot
} from '../utils/sqlExportGenerator';
import {
  DEFAULT_INSTITUTION_LOGO_DATA_URI,
  resolveInstitutionLogoUrl,
  normalizeUserRole,
  generateTeacherUsername,
  generateFourDigitPin,
  validateStrictPassword,
  INACTIVITY_TIMEOUT_MS,
  parsePersistedStaffSession,
  serializePersistedStaffSession,
  purgeSensitiveBrowserStorage,
  generateStudentTestimonialRecord,
  DEFAULT_ACADEMIC_DEPARTMENTS,
  getDepartmentForSubject,
  getTeacherHodDesignation,
  canAccessSystemBackup,
  canManageStaffAuth
} from '../utils/rbacAndAuth';
import {
  SystemBackupRecord,
  SystemStateSnapshot,
  createSystemBackupRecord,
  validateAndParseBackupFile
} from '../utils/backupRestoreEngine';
import {
  clearPendingOfflineSnapshot,
  clearPendingOfflineSnapshotIfMatches,
  createPendingOfflineSnapshot,
  encodeJsonRequestBody,
  fetchOfflineCommitWithRetry,
  loadPendingOfflineDocuments,
  loadPendingOfflineSnapshot,
  mergePendingOfflineSnapshot,
  omitSessionArchives,
  OfflineConflict,
  OfflineConflictResolution,
  PendingOfflineDocument,
  PendingOfflineSnapshot,
  removePendingOfflineDocument,
  readJsonResponse,
  savePendingOfflineDocument,
  savePendingOfflineSnapshot,
  shouldQueueOfflineChanges
} from '../utils/offlineSyncEngine';
import { uploadDocumentToCloud } from '../utils/cloudDocumentStorage';

export interface BackendDatabaseStatus {
  nodeConnected: boolean;
  databaseConnected: boolean;
  storageMode: 'MYSQL_LIVE' | 'SUPABASE_LIVE' | 'LOCAL_NODE_FALLBACK' | 'BROWSER_ONLY';
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  hasPassword: boolean;
  nodeVersion: string;
  lastSyncedAt: string | null;
  sqlDumpSizeKb: number;
  isSyncing: boolean;
  statusMessage: string | null;
}

interface AppContextType {
  // School profile & Academic Calendar
  schoolProfile: SchoolProfile;
  updateSchoolProfile: (profile: Partial<SchoolProfile>) => void;
  sessions: AcademicSession[];
  currentSession: AcademicSession;
  updateSessionName: (id: number, name: string) => void;
  createAcademicSession: (name: string, options?: { copyStudents?: boolean; makeActive?: boolean }) => AcademicSession;
  selectActiveSession: (sessionId: number) => void;
  sessionArchives: AcademicSessionArchive[];
  promotionLogs: StudentPromotionRecord[];
  transferStudentsBetweenClasses: (
    studentIds: number[],
    destinationSectionId: number
  ) => { movedCount: number; destinationSectionName: string; formTutorName: string };
  promoteStudentsToDestinationClass: (params: {
    decisions: Array<{
      studentId: number;
      decision: PromotionDecision;
      destinationSectionId: number;
      firstTermPct: number;
      secondTermPct: number;
      thirdTermPct: number;
      cumulativeAvgPct: number;
      finalGrade: string;
    }>;
    destinationSessionId: number;
    destinationTermName?: TermName;
    switchActiveSession?: boolean;
  }) => { promotedCount: number; probationCount: number; repeatedCount: number; graduatedCount: number };
  terms: Term[];
  currentTerm: Term;
  setCurrentTerm: (term: Term) => void;
  updateTermName: (id: number, name: string) => void;

  // Active Role & User
  currentUser: User;
  setCurrentUser: (user: User) => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;

  // Class Levels & Sections (CRUD)
  classLevels: ClassLevel[];
  classSections: ClassSection[];
  selectedSectionId: number;
  setSelectedSectionId: (id: number) => void;
  currentSection: ClassSection;
  addClassSection: (section: Omit<ClassSection, 'id'>) => ClassSection;
  updateClassSection: (id: number, data: Partial<ClassSection>) => void;
  deleteClassSection: (id: number) => void;

  // Teachers, Form Tutor & Subject Assignments + Passwordless Creation / First-Login / Reset Flow
  teachers: Teacher[];
  addTeacher: (teacher: Omit<Teacher, 'id'>) => Teacher;
  updateTeacher: (id: number, data: Partial<Teacher>) => void;
  updateTeacherCredentials: (input: {
    teacherId: number;
    username: string;
    fullName: string;
    newPassword?: string;
    actorUsername: string;
    actorCredential: string;
  }) => Promise<{ ok: boolean; message: string }>;
  deleteTeacher: (id: number) => void;
  assignFormTutor: (sectionId: number, teacherName: string, teacherId?: number) => void;
  assignSubjectToTeacher: (sectionId: number, subjectId: number, teacherId: number) => void;
  removeSubjectFromTeacher: (sectionId: number, subjectId: number, teacherId: number) => void;
  getAssignedTeacherForSubject: (sectionId: number, subjectId: number) => Teacher | undefined;
  completeTeacherPasswordSetup: (username: string, newPassword: string, initialPin: string) => Promise<{ ok: boolean; message: string }>;
  requestPasswordResetForUsername: (username: string) => Promise<{ ok: boolean; message: string }>;
  approveTeacherPasswordReset: (teacherId: number) => Promise<{ ok: boolean; message: string }>;

  // Subjects (CRUD)
  subjects: Subject[];
  selectedSubjectId: number;
  setSelectedSubjectId: (id: number) => void;
  addSubject: (subject: Omit<Subject, 'id'>) => Subject;
  updateSubject: (id: number, data: Partial<Subject>) => void;
  deleteSubject: (id: number) => void;

  // Students (CRUD)
  students: Student[];
  selectedStudentId: number;
  setSelectedStudentId: (id: number) => void;
  currentStudent: Student | undefined;
  addStudent: (
    student: Omit<Student, 'id'>,
    onEnrollmentsCreated?: (enrollments: StudentSubjectEnrollment[]) => void
  ) => Student;
  updateStudent: (id: number, data: Partial<Student>) => void;
  deleteStudent: (id: number) => void;

  // CA Component Headers & Max Values (Apply to All)
  assessmentComponents: AssessmentComponent[];
  updateAssessmentComponent: (id: number, data: Partial<AssessmentComponent>) => void;
  addAssessmentComponent: (comp: Omit<AssessmentComponent, 'id'>) => void;
  deleteAssessmentComponent: (id: number) => void;
  reportCardSubjectOrder: ReportCardSubjectOrder;
  updateReportCardSubjectOrder: (level: LevelType, subjectIds: number[]) => void;

  // Custom Report Sheets (per Class & Individual Student Cards)
  customReportTemplates: CustomReportTemplate[];
  saveCustomReportTemplate: (template: CustomReportTemplate) => void;
  deleteCustomReportTemplate: (id: string) => void;
  activeReportCardTemplateId: string;
  setActiveReportCardTemplateId: (templateId: string) => void;
  toggleCustomReportInReportTab: (templateId: string, enabled: boolean) => void;
  updateStudentCustomReportScore: (
    templateId: string,
    studentId: number,
    subjectId: number,
    columnId: string,
    score: number | null
  ) => void;

  // Teacher's Corner, Heads of Department (HODs) & Executive Office (Messages, Required Document Slots, 14-Week Uploads)
  academicDepartments: AcademicDepartment[];
  saveAcademicDepartment: (dept: Omit<AcademicDepartment, 'id' | 'createdAt'> & { id?: string }) => AcademicDepartment;
  deleteAcademicDepartment: (deptId: string) => void;
  officeMessages: OfficeMessage[];
  sendOfficeMessage: (msg: Omit<OfficeMessage, 'id' | 'createdAt' | 'readByTeacherIds'>) => OfficeMessage;
  markOfficeMessageAsRead: (messageId: string, teacherId: number) => void;
  deleteOfficeMessage: (messageId: string) => void;
  requiredDocumentSlots: RequiredDocumentSlot[];
  createRequiredDocumentSlot: (slot: Omit<RequiredDocumentSlot, 'id' | 'createdAt'>) => RequiredDocumentSlot;
  deleteRequiredDocumentSlot: (slotId: string) => void;
  teacherDocumentUploads: TeacherDocumentUpload[];
  uploadTeacherDocument: (
    doc: Omit<TeacherDocumentUpload, 'id' | 'uploadedAt' | 'status' | 'executiveRemarks'> & { id?: string }
  ) => TeacherDocumentUpload;
  queueOfflineDocumentUpload: (
    file: File,
    doc: Omit<TeacherDocumentUpload, 'id' | 'uploadedAt' | 'status' | 'executiveRemarks'> & { id?: string }
  ) => Promise<{ ok: boolean; message: string }>;
  addExecutiveRemarkToDocument: (
    uploadId: string,
    remarkText: string,
    status?: 'PENDING_REVIEW' | 'APPROVED' | 'NEEDS_REVISION',
    hodReviewOrStatus?:
      | {
          hodStatus?: 'HOD_PENDING' | 'HOD_REVIEWED' | 'HOD_APPROVED' | 'HOD_REVISION';
          authorName?: string;
          authorDesignation?: string;
          actionType?: 'COMMENT' | 'REVIEWED' | 'APPROVED' | 'NEEDS_REVISION';
        }
      | 'HOD_PENDING'
      | 'HOD_REVIEWED'
      | 'HOD_APPROVED'
      | 'HOD_REVISION',
    authorDesignationOverride?: string
  ) => void;
  deleteTeacherDocument: (uploadId: string) => Promise<void>;

  // Official Year 12 Graduation Testimonials
  studentTestimonials: StudentTestimonial[];
  updateStudentTestimonial: (studentId: number, updates: Partial<StudentTestimonial>) => void;

  // Assessment Scores (Auto-save)
  enrollments: StudentSubjectEnrollment[];
  scores: AssessmentScore[];
  termSummaries: StudentTermSummary[];
  termSubjectRecords: TermSubjectRecord[];
  lastAutoSavedTime: string | null;
  updateScore: (
    studentId: number,
    subjectId: number,
    componentId: number,
    score: number | null,
    reason?: string,
    enrollmentId?: number
  ) => { success: boolean; error?: string };
  updateTermSubjectScore: (
    studentId: number,
    subjectId: number,
    termId: number,
    data: {
      ca1Score?: number;
      ca2Score?: number;
      examScore?: number;
      ca1Details?: import('../types/index').CaSubScoreDetails;
      ca2Details?: import('../types/index').CaSubScoreDetails;
    }
  ) => void;
  toggleSubjectInclusion: (
    studentId: number,
    subjectId: number,
    isIncluded: boolean,
    enrollmentIdOverride?: number
  ) => number;

  // Multi-term & Annual Cumulative
  includedTermsForAnnual: number[];
  toggleAnnualTermInclusion: (termId: number) => void;
  getStudentAnnualSummary: (studentId: number) => StudentAnnualSummary;

  // Report Type
  activeReportType: ReportType;
  setActiveReportType: (type: ReportType) => void;

  // Remarks & Comments Repository
  commentBank: CommentBankItem[];
  addCommentBankItem: (item: Omit<CommentBankItem, 'id'>) => void;
  updateCommentBankItem: (id: number, data: Partial<CommentBankItem>) => void;
  deleteCommentBankItem: (id: number) => void;
  updateRemarks: (studentId: number, principalRemark?: string, teacherRemark?: string) => void;

  // Audit Logs, Custom Grading Scale Presets, Staff Authentication & Security Lock
  auditLogs: ScoreAuditLog[];
  gradingScales: Array<GradingScale | GradingScaleBand>;
  gradingScalePresets: GradingScalePreset[];
  saveGradingScalePreset: (preset: Omit<GradingScalePreset, 'id' | 'updatedAt'> & { id?: string }) => GradingScalePreset;
  enableGradingScalePresetForReports: (presetId: string) => void;
  deleteGradingScalePreset: (presetId: string) => void;
  resetDefaultGradingScales: () => void;
  oldSheets: OldSheetData[];
  isStaffLoggedIn: boolean;
  isSecurityUnlocked: boolean;
  welcomeNotification: string | null;
  dismissWelcomeNotification: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: (onSuccess?: () => void) => void;
  closeAuthModal: () => void;
  completeStaffLogin: (user: User, role: UserRole, sectionId?: number) => void;
  unlockSecurity: (pin: string) => boolean;
  lockSecurity: () => void;
  publishReportCards: (sectionId: number, publish: boolean) => void;

  // Full System Backup & Restore (Super Admin Only)
  systemBackups: SystemBackupRecord[];
  createSystemBackup: (label?: string) => Promise<{ ok: boolean; message: string; backup?: SystemBackupRecord }>;
  restoreSystemBackup: (backupOrId: string | SystemBackupRecord) => Promise<{ ok: boolean; message: string }>;
  importSystemBackupFile: (
    rawJson: string,
    restoreImmediately?: boolean
  ) => Promise<{ ok: boolean; message: string; backup?: SystemBackupRecord }>;
  deleteSystemBackup: (backupId: string) => Promise<void>;

  // Node.js + MySQL (phpMyAdmin) Backend Sync & Publishing
  backendStatus: BackendDatabaseStatus;
  isOnline: boolean;
  pendingOfflineSnapshot: PendingOfflineSnapshot<FullDatabaseSnapshot> | null;
  pendingOfflineDocumentCount: number;
  offlineConflicts: OfflineConflict[];
  offlineSyncMessage: string | null;
  commitOfflineChanges: (
    resolutions?: Record<string, OfflineConflictResolution>
  ) => Promise<{ ok: boolean; message: string; conflicts?: OfflineConflict[] }>;
  syncToBackend: () => Promise<{
    savedToDatabase: boolean;
    savedToNodeDisk: boolean;
    message: string;
  }>;
  initializeMysqlDatabase: () => Promise<{ ok: boolean; message: string; tablesCount?: number }>;
  updateMysqlConfig: (config: {
    host: string;
    port: number;
    user: string;
    password: string;
    emptyPassword: boolean;
    database: string;
  }) => Promise<{ ok: boolean; message: string }>;
  downloadPhpMyAdminSql: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

const STAFF_SESSION_STORAGE_KEY = 'edugrade_staff_session_v1';

function loadPersistedStaffSession() {
  if (typeof window === 'undefined') return null;
  try {
    if (window.localStorage.getItem('edugrade_security_locked_v2') === 'true') {
      window.sessionStorage.removeItem(STAFF_SESSION_STORAGE_KEY);
      return null;
    }
    const session = parsePersistedStaffSession(
      window.sessionStorage.getItem(STAFF_SESSION_STORAGE_KEY)
    );
    if (!session) window.sessionStorage.removeItem(STAFF_SESSION_STORAGE_KEY);
    return session;
  } catch {
    return null;
  }
}

const STORAGE_KEYS = {
  SCHOOL: 'edugrade_school_profile',
  ROLE: 'edugrade_role',
  SECTION_ID: 'edugrade_section_id',
  SUBJECT_ID: 'edugrade_subject_id',
  STUDENT_ID: 'edugrade_student_id',
  SECTIONS: 'edugrade_sections',
  SUBJECTS: 'edugrade_subjects',
  STUDENTS: 'edugrade_students_pioneer_v6',
  COMPONENTS: 'edugrade_components',
  REPORT_CARD_SUBJECT_ORDER: 'edugrade_report_card_subject_order_v1',
  ENROLLMENTS: 'edugrade_enrollments_pioneer_v6',
  SCORES: 'edugrade_scores_pioneer_v6',
  TERM_SUBJECT_RECORDS: 'edugrade_term_subject_records_pioneer_v6',
  SUMMARIES: 'edugrade_summaries_pioneer_v6',
  AUDIT_LOGS: 'edugrade_audit_logs_pioneer_v6',
  COMMENTS: 'edugrade_comments',
  ANNUAL_TERMS: 'edugrade_annual_terms',
  REPORT_TYPE: 'edugrade_report_type',
  TEACHERS: 'edugrade_teachers_v3',
  CUSTOM_REPORTS: 'edugrade_custom_report_templates_v2',
  ACTIVE_REPORT_CARD_TEMPLATE_ID: 'edugrade_active_report_template_id_v1',
  OFFICE_MESSAGES: 'edugrade_office_messages_v1',
  REQUIRED_DOC_SLOTS: 'edugrade_required_doc_slots_v1',
  TEACHER_DOC_UPLOADS: 'edugrade_teacher_doc_uploads_v1',
  STUDENT_TESTIMONIALS: 'edugrade_student_testimonials_v1',
  ACADEMIC_DEPARTMENTS: 'edugrade_academic_departments_v1',
  GRADING_SCALE_PRESETS: 'edugrade_grading_scale_presets_v1',
  SESSIONS: 'edugrade_sessions_v2',
  SESSION_ARCHIVES: 'edugrade_session_archives_pioneer_v6',
  PROMOTION_LOGS: 'edugrade_promotion_logs_pioneer_v6',
  SYSTEM_BACKUPS: 'edugrade_system_backups_pioneer_v6'
};

function createOfflineId(): string {
  const cryptoApi = globalThis.crypto;
  return cryptoApi && typeof cryptoApi.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let nextStudentIdSeq = 5000;

/**
 * Generates deterministic initial subject assignments across the 11 classes so:
 * - Every Class Teacher (Form Tutor) is also a Subject Teacher with assigned subjects in their form class and across classes.
 * - Subject Teachers (Paul Obinna, Joy Eze) have assigned subjects across multiple classes.
 */
function buildDefaultTeacherSubjectAssignments(): Record<number, TeacherSubjectAssignment[]> {
  const map: Record<number, TeacherSubjectAssignment[]> = {};
  for (let tId = 1; tId <= 14; tId++) {
    map[tId] = [];
  }

  // Assign each (sectionId, subjectId) deterministically so every class subject has an assigned subject teacher
  initialClassSections.forEach(sec => {
    const applicableSubjects = initialSubjects.filter(sub =>
      sec.levelType === 'SENIOR'
        ? sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
        : sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH'
    );
    applicableSubjects.forEach((sub, idx) => {
      // First 5 subjects in each class go to that class's Form Tutor (teacherId == sec.id),
      // while remaining subjects are distributed among Subject Teachers (12, 13) and cross-class Form Tutors
      let targetTeacherId = sec.id;
      if (idx % 4 === 2) {
        targetTeacherId = 12; // Subject Teacher 1
      } else if (idx % 4 === 3) {
        targetTeacherId = 13; // Subject Teacher 2
      }
      if (!map[targetTeacherId]) map[targetTeacherId] = [];
      map[targetTeacherId].push({ sectionId: sec.id, subjectId: sub.id });
    });
  });

  return map;
}

const defaultTeacherSubjectMap = buildDefaultTeacherSubjectAssignments();

const initialTeachers: Teacher[] = [
  { id: 1, fullName: 'Class Teacher 1', username: 'class.teacher.1', initialPin: generateFourDigitPin(), email: 'teacher1@example.invalid', staffId: 'STAFF-01', assignedSectionId: 1, assignedSubjects: defaultTeacherSubjectMap[1], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 2, fullName: 'Class Teacher 2', username: 'class.teacher.2', initialPin: generateFourDigitPin(), email: 'teacher2@example.invalid', staffId: 'STAFF-02', assignedSectionId: 2, assignedSubjects: defaultTeacherSubjectMap[2], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 3, fullName: 'Class Teacher 3', username: 'class.teacher.3', initialPin: generateFourDigitPin(), email: 'teacher3@example.invalid', staffId: 'STAFF-03', assignedSectionId: 3, assignedSubjects: defaultTeacherSubjectMap[3], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 4, fullName: 'Class Teacher 4', username: 'class.teacher.4', initialPin: generateFourDigitPin(), email: 'teacher4@example.invalid', staffId: 'STAFF-04', assignedSectionId: 4, assignedSubjects: defaultTeacherSubjectMap[4], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 5, fullName: 'Principal', username: 'principal', initialPin: generateFourDigitPin(), email: 'principal@example.invalid', staffId: 'STAFF-05', assignedSectionId: 5, assignedSubjects: defaultTeacherSubjectMap[5], role: 'BOTH', systemRole: 'PRINCIPAL', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 6, fullName: 'Vice Principal', username: 'vice.principal', initialPin: generateFourDigitPin(), email: 'viceprincipal@example.invalid', staffId: 'STAFF-06', assignedSectionId: 6, assignedSubjects: defaultTeacherSubjectMap[6], role: 'BOTH', systemRole: 'VICE_PRINCIPAL', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 7, fullName: 'Class Teacher 5', username: 'class.teacher.5', initialPin: generateFourDigitPin(), email: 'teacher5@example.invalid', staffId: 'STAFF-07', assignedSectionId: 7, assignedSubjects: defaultTeacherSubjectMap[7], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 8, fullName: 'Class Teacher 6', username: 'class.teacher.6', initialPin: generateFourDigitPin(), email: 'teacher6@example.invalid', staffId: 'STAFF-08', assignedSectionId: 8, assignedSubjects: defaultTeacherSubjectMap[8], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 9, fullName: 'Class Teacher 7', username: 'class.teacher.7', initialPin: generateFourDigitPin(), email: 'teacher7@example.invalid', staffId: 'STAFF-09', assignedSectionId: 9, assignedSubjects: defaultTeacherSubjectMap[9], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 10, fullName: 'Class Teacher 8', username: 'class.teacher.8', initialPin: generateFourDigitPin(), email: 'teacher8@example.invalid', staffId: 'STAFF-10', assignedSectionId: 10, assignedSubjects: defaultTeacherSubjectMap[10], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 11, fullName: 'Class Teacher 9', username: 'class.teacher.9', initialPin: generateFourDigitPin(), email: 'teacher9@example.invalid', staffId: 'STAFF-11', assignedSectionId: 11, assignedSubjects: defaultTeacherSubjectMap[11], role: 'BOTH', systemRole: 'CLASS_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 12, fullName: 'Subject Teacher 1', username: 'subject.teacher.1', initialPin: generateFourDigitPin(), email: 'subject1@example.invalid', staffId: 'STAFF-12', assignedSubjects: defaultTeacherSubjectMap[12], role: 'SUBJECT_TEACHER', systemRole: 'SUBJECT_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 13, fullName: 'Subject Teacher 2', username: 'subject.teacher.2', initialPin: generateFourDigitPin(), email: 'subject2@example.invalid', staffId: 'STAFF-13', assignedSubjects: defaultTeacherSubjectMap[13], role: 'SUBJECT_TEACHER', systemRole: 'SUBJECT_TEACHER', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false },
  { id: 14, fullName: 'Head of Schools', username: 'head.of.schools', initialPin: generateFourDigitPin(), email: 'head@example.invalid', staffId: 'STAFF-14', assignedSubjects: defaultTeacherSubjectMap[14], role: 'BOTH', systemRole: 'HEAD_OF_SCHOOLS', mustSetPassword: true, hasPasswordSet: false, passwordResetRequested: false }
];

function reconcileExecutiveStaffSnapshot(snapshot: FullDatabaseSnapshot): FullDatabaseSnapshot {
  const teachers = [...snapshot.teachers];
  if (!teachers.some(teacher => teacher.systemRole === 'HEAD_OF_SCHOOLS')) {
    const headOfSchools = initialTeachers.find(teacher => teacher.systemRole === 'HEAD_OF_SCHOOLS');
    if (headOfSchools) {
      const newId = Math.max(0, ...teachers.map(teacher => teacher.id)) + 1;
      teachers.push({
        ...headOfSchools,
        id: newId,
        staffId: `STAFF-${String(newId).padStart(2, '0')}`,
        assignedSubjects: []
      });
    }
  }

  return { ...snapshot, teachers };
}

const initialCustomReportTemplates: CustomReportTemplate[] = initialClassSections.map(sec => {
  const isJunior = sec.levelType === 'JUNIOR';
  const defaultSubjects = initialSubjects
    .filter(sub =>
      isJunior
        ? sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH'
        : sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
    )
    .map(s => s.id);
  return {
    id: `custom-report-sec-${sec.id}`,
    sectionId: sec.id,
    sectionIds: [sec.id],
    title: `${sec.name} Custom Report Card`,
    subtitle: `INDIVIDUAL STUDENT CUSTOM ASSESSMENT BREAKDOWN (${sec.levelType} SECONDARY)`,
    reportMode: 'INDIVIDUAL_STUDENT',
    enabledInReportTab: false,
    colorBarTheme: isJunior ? 'EMERALD' : 'INDIGO',
    columns: isJunior
      ? [
          { id: 'col-ca1', header: 'FIRST CA (20)', maxScore: 20, sourceKey: 'ca1' },
          { id: 'col-ca2', header: 'SECOND CA (20)', maxScore: 20, sourceKey: 'ca2' },
          { id: 'col-exam', header: 'EXAM (60)', maxScore: 60, sourceKey: 'exam' }
        ]
      : [
          { id: 'col-ca1', header: 'FIRST CA (15)', maxScore: 15, sourceKey: 'ca1' },
          { id: 'col-ca2', header: 'SECOND CA (15)', maxScore: 15, sourceKey: 'ca2' },
          { id: 'col-exam', header: 'EXAM (70)', maxScore: 70, sourceKey: 'exam' }
        ],
    selectedSubjectIds: defaultSubjects,
    studentCustomScores: {},
    updatedAt: '2026-10-27T12:00:00Z'
  };
});

const initialOfficeMessages: OfficeMessage[] = [
  {
    id: 'msg-welcome-1',
    senderName: 'Dr. Tunde Bakare',
    senderRole: 'PRINCIPAL',
    recipientTeacherId: 'ALL',
    recipientTeacherName: 'All Teaching Staff',
    subject: 'Submission of Termly Scheme of Work & Weekly Lesson Notes (Weeks 1–14)',
    body: 'Dear Colleagues, please ensure your Scheme of Work, Lesson Plans, Lesson Notes, and Examination Questions are uploaded along the 14-week timeline in Teacher’s Corner for executive inspection and remarks.',
    priority: 'IMPORTANT',
    createdAt: '2026-10-27T08:30:00Z',
    readByTeacherIds: []
  },
  {
    id: 'msg-vp-2',
    senderName: 'Mr. Emmanuel Peters',
    senderRole: 'VICE_PRINCIPAL',
    recipientTeacherId: 'ALL',
    recipientTeacherName: 'All Teaching Staff',
    subject: 'Continuous Assessment Score Verification & Student Summary Review',
    body: 'Please verify all 1st CA, 2nd CA, and Exam scores for your assigned subjects directly from your Teacher’s Corner student cards before the mid-term review closes.',
    priority: 'NORMAL',
    createdAt: '2026-10-27T10:15:00Z',
    readByTeacherIds: []
  }
];

const initialRequiredDocSlots: RequiredDocumentSlot[] = [
  {
    id: 'slot-scheme-1',
    name: 'Termly Scheme of Work (Weeks 1–14 Breakdown)',
    category: 'SCHEME_OF_WORK',
    targetTermName: 'ALL',
    targetWeek: 'ALL',
    instructions: 'Upload complete 14-week scheme of work in PDF or DOCX format.',
    createdBy: 'Dr. Tunde Bakare',
    createdByRole: 'PRINCIPAL',
    createdAt: '2026-10-27T08:00:00Z'
  },
  {
    id: 'slot-lesson-plan-2',
    name: 'Weekly Lesson Plan',
    category: 'LESSON_PLAN',
    targetTermName: 'ALL',
    targetWeek: 'ALL',
    instructions: 'Upload structured weekly lesson plan for your assigned subject and class.',
    createdBy: 'Mr. Emmanuel Peters',
    createdByRole: 'VICE_PRINCIPAL',
    createdAt: '2026-10-27T08:05:00Z'
  },
  {
    id: 'slot-lesson-notes-3',
    name: 'Weekly Lesson Notes & Presentation Slides',
    category: 'LESSON_NOTES',
    targetTermName: 'ALL',
    targetWeek: 'ALL',
    instructions: 'Upload student-facing lesson notes or classroom slides (PDF, DOCX, or PPTX).',
    createdBy: 'Mr. Emmanuel Peters',
    createdByRole: 'VICE_PRINCIPAL',
    createdAt: '2026-10-27T08:10:00Z'
  },
  {
    id: 'slot-exam-questions-4',
    name: 'Term Examination Questions & Marking Guide',
    category: 'EXAM_QUESTIONS',
    targetTermName: 'ALL',
    targetWeek: 12,
    instructions: 'Upload moderated examination questions and marking scheme.',
    createdBy: 'Dr. Tunde Bakare',
    createdByRole: 'PRINCIPAL',
    createdAt: '2026-10-27T08:15:00Z'
  }
];

const initialTeacherDocUploads: TeacherDocumentUpload[] = [
  {
    id: 'doc-seed-1',
    slotId: 'slot-scheme-1',
    documentTitle: 'Year 7 Excellence Mathematics Scheme of Work (First Term)',
    category: 'SCHEME_OF_WORK',
    fileName: 'Y7_Mathematics_Scheme_Of_Work_Term1.pdf',
    fileExtension: 'PDF',
    fileSizeKb: 420,
    teacherId: 11,
    teacherName: 'Class Teacher 9',
    sectionId: 11,
    sectionName: 'YEAR 12 EXCELLENCE',
    subjectId: 1,
    subjectName: 'Mathematics',
    departmentId: 'dept-sciences-math',
    departmentName: 'Department of Sciences & Mathematics',
    termName: 'FIRST',
    weekNumber: 1,
    uploadedAt: '2026-10-27T09:00:00Z',
    status: 'APPROVED',
    hodReviewStatus: 'HOD_APPROVED',
    hodReviewedBy: 'Class Teacher 9 (HOD — Department of Sciences & Mathematics)',
    hodReviewedAt: '2026-10-27T10:15:00Z',
    executiveRemarks: [
      {
        id: 'rem-seed-hod-1',
        authorName: 'Class Teacher 9',
        authorRole: 'CLASS_TEACHER',
        authorDesignation: 'HOD — Department of Sciences & Mathematics',
        actionType: 'APPROVED',
        remark: 'Departmental moderation completed: weekly topics and WAEC/NECO objectives verified.',
        createdAt: '2026-10-27T10:15:00Z'
      },
      {
        id: 'rem-seed-1',
        authorName: 'Dr. Tunde Bakare',
        authorRole: 'PRINCIPAL',
        authorDesignation: "Principal's Office",
        actionType: 'APPROVED',
        remark: 'Well-structured 14-week progression aligned with the Senior Secondary curriculum.',
        createdAt: '2026-10-27T11:00:00Z'
      }
    ]
  },
  {
    id: 'doc-seed-2',
    slotId: 'slot-lesson-notes-3',
    documentTitle: 'Week 2 Calculus & Differentiation Lesson Notes & Slides',
    category: 'LESSON_NOTES',
    fileName: 'Y12_Calculus_Differentiation_Week2.pptx',
    fileExtension: 'PPTX',
    fileSizeKb: 1180,
    teacherId: 11,
    teacherName: 'Class Teacher 9',
    sectionId: 11,
    sectionName: 'YEAR 12 EXCELLENCE',
    subjectId: 1,
    subjectName: 'Mathematics',
    departmentId: 'dept-sciences-math',
    departmentName: 'Department of Sciences & Mathematics',
    termName: 'FIRST',
    weekNumber: 2,
    uploadedAt: '2026-10-27T09:30:00Z',
    status: 'PENDING_REVIEW',
    hodReviewStatus: 'HOD_PENDING',
    executiveRemarks: []
  }
];

const defaultSchoolProfile: SchoolProfile = {
  name: 'Sample School',
  motto: 'CHARACTER AND KNOWLEDGE',
  address: '',
  phone: '',
  email: '',
  logoUrl: DEFAULT_INSTITUTION_LOGO_DATA_URI,
  principalName: 'Principal',
  formTeacherName: 'Class Teacher 4',
  reportDate: '27/10/2026',
  currentSession: '2026/27',
  currentTerm: 'FIRST'
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Immediately purge any legacy passwords/secrets/tokens from browser storage
  useEffect(() => {
    purgeSensitiveBrowserStorage();
  }, []);

  // School Profile & Config
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SCHOOL);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultSchoolProfile,
          ...parsed,
          motto: parsed.motto || defaultSchoolProfile.motto,
          address: parsed.address || defaultSchoolProfile.address,
          phone: parsed.phone || defaultSchoolProfile.phone,
          logoUrl: resolveInstitutionLogoUrl(parsed.logoUrl)
        };
      } catch (e) { /* ignore */ }
    }
    return defaultSchoolProfile;
  });

  // Sessions & Terms
  const [sessions, setSessions] = useState<AcademicSession[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (saved) {
      try {
        const parsed: AcademicSession[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { /* ignore */ }
    }
    return initialSessions.map(s => ({
      ...s,
      institutionName: s.institutionName || defaultSchoolProfile.name
    }));
  });
  const currentSession = useMemo(() => {
    return sessions.find(s => s.isCurrent) || sessions[0];
  }, [sessions]);

  const [terms, setTerms] = useState<Term[]>(initialTerms);
  const [currentTerm, setCurrentTermState] = useState<Term>(initialTerms[0]);
  const setCurrentTerm = useCallback((term: Term) => {
    setCurrentTermState(term);
    setSchoolProfile(prev => ({ ...prev, currentTerm: term.name }));
  }, []);

  const [restoredStaffSession] = useState(loadPersistedStaffSession);
  const signedOutUser: User = {
    id: 0,
    fullName: 'Signed Out',
    username: '',
    email: '',
    role: 'CLASS_TEACHER',
    isActive: false
  };

  // Active role and user are restored only from a valid, unexpired tab session.
  const [currentUser, setCurrentUser] = useState<User>(() => restoredStaffSession?.user || signedOutUser);
  const [currentRole, setCurrentRoleState] = useState<UserRole>(() => {
    return restoredStaffSession?.role || 'CLASS_TEACHER';
  });

  const setCurrentRole = useCallback((role: UserRole) => {
    const normalized = normalizeUserRole(role);
    setCurrentRoleState(normalized);
    try {
      const session = parsePersistedStaffSession(
        window.sessionStorage.getItem(STAFF_SESSION_STORAGE_KEY)
      );
      if (session) {
        window.sessionStorage.setItem(
          STAFF_SESSION_STORAGE_KEY,
          serializePersistedStaffSession(
            { ...session.user, role: normalized },
            normalized,
            session.lastActivityAt
          )
        );
      }
    } catch {
      // The current tab remains authenticated; a refresh will require sign-in if storage is unavailable.
    }
  }, []);

  // Master Data with CRUD
  const [classLevels] = useState<ClassLevel[]>(initialClassLevels);
  const [classSections, setClassSections] = useState<ClassSection[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SECTIONS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialClassSections;
  });

  // Teachers state (with normalized usernames, 4-digit initial PINs & assignedSubjects)
  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TEACHERS);
    if (saved) {
      try {
        const parsed: Teacher[] = JSON.parse(saved);
        const migratedTeachers = parsed.map((t, idx) => ({
          ...t,
          fullName:
            t.username?.toLowerCase() === 'principal'
              ? 'Principal'
              : t.username?.toLowerCase() === 'vice.principal'
              ? 'Vice Principal'
              : t.fullName,
          username: t.username || generateTeacherUsername(t.fullName),
          initialPin: t.initialPin || initialTeachers[idx]?.initialPin || generateFourDigitPin(),
          assignedSubjects:
            t.assignedSubjects && t.assignedSubjects.length > 0
              ? t.assignedSubjects
              : defaultTeacherSubjectMap[t.id] || [],
          mustSetPassword: t.mustSetPassword ?? false,
          passwordResetRequested: t.passwordResetRequested ?? false,
          hasPasswordSet: t.hasPasswordSet ?? !t.mustSetPassword
        }));
        if (!migratedTeachers.some(teacher => teacher.systemRole === 'HEAD_OF_SCHOOLS')) {
          const seededHead = initialTeachers.find(teacher => teacher.systemRole === 'HEAD_OF_SCHOOLS');
          if (seededHead) {
            const newId = Math.max(0, ...migratedTeachers.map(teacher => teacher.id)) + 1;
            migratedTeachers.push({
              ...seededHead,
              id: newId,
              username: seededHead.username || 'head.of.schools',
              initialPin: seededHead.initialPin || generateFourDigitPin(),
              staffId: `STAFF-${String(newId).padStart(2, '0')}`,
              mustSetPassword: true,
              hasPasswordSet: false,
              passwordResetRequested: false,
              assignedSubjects: []
            });
          }
        }
        return migratedTeachers;
      } catch (e) { /* ignore */ }
    }
    return initialTeachers;
  });

  const [subjects, setSubjects] = useState<Subject[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialSubjects;
  });

  const [students, setStudents] = useState<Student[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialStudents;
  });

  const [assessmentComponents, setAssessmentComponents] = useState<AssessmentComponent[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.COMPONENTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialAssessmentComponents;
  });

  const [reportCardSubjectOrder, setReportCardSubjectOrder] =
    useState<ReportCardSubjectOrder>(() => {
      const saved = localStorage.getItem(STORAGE_KEYS.REPORT_CARD_SUBJECT_ORDER);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<ReportCardSubjectOrder>;
          return {
            JUNIOR: Array.isArray(parsed.JUNIOR) ? parsed.JUNIOR : [],
            SENIOR: Array.isArray(parsed.SENIOR) ? parsed.SENIOR : []
          };
        } catch {
          // Use the source subject order when persisted ordering is malformed.
        }
      }
      return DEFAULT_REPORT_CARD_SUBJECT_ORDER;
    });

  const [customReportTemplates, setCustomReportTemplates] = useState<CustomReportTemplate[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CUSTOM_REPORTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialCustomReportTemplates;
  });

  // Scores & Registry initialized from saved enrollments/scores or authentic sheet seed data
  const [enrollments, setEnrollments] = useState<StudentSubjectEnrollment[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ENROLLMENTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialEnrollments;
  });
  const [scores, setScores] = useState<AssessmentScore[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SCORES);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialAssessmentScores;
  });

  const [termSubjectRecords, setTermSubjectRecords] = useState<TermSubjectRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TERM_SUBJECT_RECORDS);
    if (saved) {
      try {
        const parsed: TermSubjectRecord[] = JSON.parse(saved);
        return parsed;
      } catch (e) { /* ignore */ }
    }
    return initialTermSubjectRecords;
  });

  const [termSummaries, setTermSummaries] = useState<StudentTermSummary[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SUMMARIES);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialTermSummaries;
  });

  const [commentBank, setCommentBank] = useState<CommentBankItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.COMMENTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialCommentBank;
  });

  const [auditLogs, setAuditLogs] = useState<ScoreAuditLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialScoreAuditLogs;
  });

  const [sessionArchives, setSessionArchives] = useState<AcademicSessionArchive[]>(() => {
    return [
      {
        sessionId: initialSessions[0]?.id || 1,
        sessionName: initialSessions[0]?.name || '2026/27',
        institutionName: defaultSchoolProfile.name,
        schoolMotto: defaultSchoolProfile.motto,
        principalName: defaultSchoolProfile.principalName,
        updatedAt: '2026-10-27T12:00:00Z',
        classSections: initialClassSections,
        teachers: initialTeachers,
        students: initialStudents,
        enrollments: initialEnrollments,
        scores: initialAssessmentScores,
        termSubjectRecords: initialTermSubjectRecords,
        termSummaries: initialTermSummaries
      }
    ];
  });

  const [promotionLogs, setPromotionLogs] = useState<StudentPromotionRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PROMOTION_LOGS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [];
  });

  const [officeMessages, setOfficeMessages] = useState<OfficeMessage[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.OFFICE_MESSAGES);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialOfficeMessages;
  });

  const [requiredDocumentSlots, setRequiredDocumentSlots] = useState<RequiredDocumentSlot[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REQUIRED_DOC_SLOTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialRequiredDocSlots;
  });

  const [teacherDocumentUploads, setTeacherDocumentUploads] = useState<TeacherDocumentUpload[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TEACHER_DOC_UPLOADS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return initialTeacherDocUploads;
  });

  const [studentTestimonials, setStudentTestimonials] = useState<StudentTestimonial[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STUDENT_TESTIMONIALS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [];
  });

  const [academicDepartments, setAcademicDepartments] = useState<AcademicDepartment[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACADEMIC_DEPARTMENTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { /* ignore */ }
    }
    return DEFAULT_ACADEMIC_DEPARTMENTS;
  });

  const [gradingScalePresets, setGradingScalePresets] = useState<GradingScalePreset[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.GRADING_SCALE_PRESETS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { /* ignore */ }
    }
    return DEFAULT_GRADING_SCALE_PRESETS;
  });

  const [activeReportCardTemplateId, setActiveReportCardTemplateId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_REPORT_CARD_TEMPLATE_ID);
    return saved || 'STANDARD';
  });

  const [oldSheets] = useState<OldSheetData[]>(initialOldSheets);

  // Active Selections
  const [selectedSectionId, setSelectedSectionId] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SECTION_ID);
    return saved ? parseInt(saved, 10) : 4; // Year 8 Resilience
  });

  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SUBJECT_ID);
    return saved ? parseInt(saved, 10) : 1;
  });

  const [selectedStudentId, setSelectedStudentId] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STUDENT_ID);
    return saved ? parseInt(saved, 10) : 100;
  });

  // Annual Cumulative Terms selection
  const [includedTermsForAnnual, setIncludedTermsForAnnual] = useState<number[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ANNUAL_TERMS);
    return saved ? JSON.parse(saved) : [1, 2, 3];
  });

  // Report Type
  const [activeReportType, setActiveReportType] = useState<ReportType>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REPORT_TYPE);
    return (saved as ReportType) || 'MID_TERM';
  });

  // Auto-saved timestamp
  const [lastAutoSavedTime, setLastAutoSavedTime] = useState<string | null>(null);

  const lastActivityAtRef = React.useRef(restoredStaffSession?.lastActivityAt || 0);
  const nextSubjectIdRef = React.useRef(0);
  const [isStaffLoggedIn, setIsStaffLoggedIn] = useState(Boolean(restoredStaffSession));
  const [isSecurityUnlocked, setIsSecurityUnlocked] = useState(Boolean(restoredStaffSession));
  const [welcomeNotification, setWelcomeNotification] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(!restoredStaffSession);
  const pendingAuthCallbackRef = React.useRef<(() => void) | null>(null);

  const dismissWelcomeNotification = useCallback(() => {
    setWelcomeNotification(null);
  }, []);

  const openAuthModal = useCallback((onSuccess?: () => void) => {
    pendingAuthCallbackRef.current = onSuccess || null;
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    pendingAuthCallbackRef.current = null;
    setIsAuthModalOpen(false);
  }, []);

  const completeStaffLogin = useCallback((user: User, role: UserRole, sectionId?: number) => {
    const normalizedRole = normalizeUserRole(role);
    const uname = (user.username || generateTeacherUsername(user.fullName)).toLowerCase();
    const matchedTeacher = teachers.find(
      t => (t.username || generateTeacherUsername(t.fullName)).toLowerCase() === uname || t.id === user.id
    );
    const authenticatedUser: User = {
      ...user,
      username: uname,
      role: normalizedRole,
      isActive: true,
      assignedSectionId: sectionId ?? matchedTeacher?.assignedSectionId ?? user.assignedSectionId,
      assignedSubjects: matchedTeacher?.assignedSubjects || user.assignedSubjects || []
    };
    const now = Date.now();
    setCurrentUser(authenticatedUser);
    setCurrentRoleState(normalizedRole);
    lastActivityAtRef.current = now;
    try {
      window.sessionStorage.setItem(
        STAFF_SESSION_STORAGE_KEY,
        serializePersistedStaffSession(authenticatedUser, normalizedRole, now)
      );
    } catch {
      // The current tab remains authenticated; a refresh will require sign-in if storage is unavailable.
    }
    if (sectionId) {
      setSelectedSectionId(sectionId);
    } else if (matchedTeacher?.assignedSubjects && matchedTeacher.assignedSubjects.length > 0) {
      setSelectedSectionId(matchedTeacher.assignedSubjects[0].sectionId);
      setSelectedSubjectId(matchedTeacher.assignedSubjects[0].subjectId);
    }
    try {
      localStorage.removeItem('edugrade_security_locked_v2');
    } catch {}
    setIsStaffLoggedIn(true);
    setIsSecurityUnlocked(true);
    setIsAuthModalOpen(false);
    setWelcomeNotification(`Welcome back, @${uname} (${user.fullName})! System is now UNLOCKED.`);

    if (pendingAuthCallbackRef.current) {
      const cb = pendingAuthCallbackRef.current;
      pendingAuthCallbackRef.current = null;
      setTimeout(() => cb(), 30);
    }
  }, [teachers]);

  // Preserve authenticated tab sessions across refreshes, but expire them after 30 idle minutes.
  useEffect(() => {
    if (!isStaffLoggedIn) return;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPersistedActivityAt = 0;

    const lockForInactivity = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      try {
        window.sessionStorage.removeItem(STAFF_SESSION_STORAGE_KEY);
      } catch {
        // The in-memory lock still applies if browser storage is unavailable.
      }
      try {
        window.localStorage.setItem('edugrade_security_locked_v2', 'true');
      } catch {
        // The in-memory lock still applies if browser storage is unavailable.
      }
      setIsStaffLoggedIn(false);
      setIsSecurityUnlocked(false);
      setIsAuthModalOpen(true);
      setWelcomeNotification('System automatically locked after 30 minutes of inactivity. Please sign in to continue.');
    };

    const scheduleInactivityLock = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      const idleTime = Date.now() - lastActivityAtRef.current;
      const remainingTime = INACTIVITY_TIMEOUT_MS - idleTime;
      if (remainingTime <= 0) {
        lockForInactivity();
        return;
      }
      inactivityTimer = setTimeout(lockForInactivity, remainingTime);
    };

    const recordActivity = (forcePersist = false) => {
      const now = Date.now();
      lastActivityAtRef.current = now;
      if (forcePersist || now - lastPersistedActivityAt >= 5000) {
        try {
          window.sessionStorage.setItem(
            STAFF_SESSION_STORAGE_KEY,
            serializePersistedStaffSession(currentUser, currentRole, now)
          );
          lastPersistedActivityAt = now;
        } catch {
          // The current tab remains authenticated; a refresh will require sign-in if storage is unavailable.
        }
      }
      scheduleInactivityLock();
    };

    const persistActivityBeforeUnload = () => {
      try {
        window.sessionStorage.setItem(
          STAFF_SESSION_STORAGE_KEY,
          serializePersistedStaffSession(currentUser, currentRole, lastActivityAtRef.current)
        );
      } catch {
        // The current tab remains authenticated; a refresh will require sign-in if storage is unavailable.
      }
    };

    const handleActivity = () => recordActivity();
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
    window.addEventListener('pagehide', persistActivityBeforeUnload);
    scheduleInactivityLock();

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      activityEvents.forEach(evt => window.removeEventListener(evt, handleActivity));
      window.removeEventListener('pagehide', persistActivityBeforeUnload);
    };
  }, [isStaffLoggedIn, currentUser, currentRole]);

  // Persistent backend status
  const [backendStatus, setBackendStatus] = useState<BackendDatabaseStatus>({
    nodeConnected: false,
    databaseConnected: false,
    storageMode: 'BROWSER_ONLY',
    dbHost: '127.0.0.1',
    dbPort: 3306,
    dbName: 'edugrade_db',
    dbUser: 'root',
    hasPassword: false,
    nodeVersion: 'v22.x',
    lastSyncedAt: null,
    sqlDumpSizeKb: 0,
    isSyncing: false,
    statusMessage: null
  });
  const [backendHydrated, setBackendHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pendingOfflineSnapshot, setPendingOfflineSnapshot] =
    useState<PendingOfflineSnapshot<FullDatabaseSnapshot> | null>(null);
  const [pendingOfflineDocumentCount, setPendingOfflineDocumentCount] = useState(0);
  const [offlineConflicts, setOfflineConflicts] = useState<OfflineConflict[]>([]);
  const [offlineSyncMessage, setOfflineSyncMessage] = useState<string | null>(null);
  const pendingOfflineSnapshotRef = useRef<PendingOfflineSnapshot<FullDatabaseSnapshot> | null>(null);
  const backendBaseSnapshotRef = useRef<FullDatabaseSnapshot | null>(null);
  const backendRevisionRef = useRef<string | null>(null);
  const buildSnapshotRef = useRef<(() => FullDatabaseSnapshot) | null>(null);
  const persistOfflineSnapshotRef = useRef<
    ((snapshot: FullDatabaseSnapshot) => Promise<PendingOfflineSnapshot<FullDatabaseSnapshot>>) | null
  >(null);
  const getCurrentSnapshot = () => {
    if (!buildSnapshotRef.current) throw new Error('School data is not ready to be saved.');
    return buildSnapshotRef.current();
  };
  const queueCurrentSnapshot = (snapshot: FullDatabaseSnapshot) => {
    if (!persistOfflineSnapshotRef.current) throw new Error('Offline storage is not ready.');
    return persistOfflineSnapshotRef.current(snapshot);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (pendingOfflineSnapshotRef.current) {
        setOfflineSyncMessage('Internet connection restored. Checking Supabase before offering pending changes.');
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setBackendStatus(previous => ({
        ...previous,
        databaseConnected: false,
        statusMessage: 'Network connection lost; Supabase availability is not confirmed.'
      }));
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const hasPendingOfflineWork = Boolean(pendingOfflineSnapshot || pendingOfflineDocumentCount > 0);
  useEffect(() => {
    if (!hasPendingOfflineWork || !isOnline || backendStatus.databaseConnected) return;
    let active = true;
    const checkDatabaseHealth = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        const result = await readJsonResponse<{ ok?: boolean; error?: string }>(response);
        if (!response.ok || !result.ok) {
          const message = result.error || `Supabase health check failed (HTTP ${response.status}).`;
          if (active) {
            setBackendStatus(previous => ({
              ...previous,
              databaseConnected: false,
              statusMessage: message
            }));
          }
          return;
        }
        if (active) {
          setBackendStatus(previous => ({
            ...previous,
            nodeConnected: true,
            databaseConnected: true,
            storageMode: 'SUPABASE_LIVE',
            statusMessage: 'Supabase is reachable. Review pending offline changes before committing.'
          }));
          setOfflineSyncMessage('Supabase connection restored. Review and commit your pending offline changes.');
        }
      } catch (error) {
        if (active) {
          const message = `Could not verify Supabase availability: ${error instanceof Error ? error.message : String(error)}`;
          setBackendStatus(previous => ({
            ...previous,
            databaseConnected: false,
            statusMessage: message
          }));
        }
      }
    };

    void checkDatabaseHealth();
    const interval = window.setInterval(() => void checkDatabaseHealth(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [hasPendingOfflineWork, isOnline, backendStatus.databaseConnected]);

  // Safe local storage writer
  const safeSetItem = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // LocalStorage quota exceeded in browser; memory state remains pristine
    }
  };

  // Sync to LocalStorage safely
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SCHOOL, JSON.stringify(schoolProfile));
  }, [schoolProfile]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.ROLE, currentRole);
  }, [currentRole]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SECTION_ID, selectedSectionId.toString());
  }, [selectedSectionId]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SUBJECT_ID, selectedSubjectId.toString());
  }, [selectedSubjectId]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.STUDENT_ID, selectedStudentId.toString());
  }, [selectedStudentId]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SECTIONS, JSON.stringify(classSections));
  }, [classSections]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachers));
  }, [teachers]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
  }, [subjects]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.COMPONENTS, JSON.stringify(assessmentComponents));
  }, [assessmentComponents]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.REPORT_CARD_SUBJECT_ORDER, JSON.stringify(reportCardSubjectOrder));
  }, [reportCardSubjectOrder]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.CUSTOM_REPORTS, JSON.stringify(customReportTemplates));
  }, [customReportTemplates]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.ENROLLMENTS, JSON.stringify(enrollments));
  }, [enrollments]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SCORES, JSON.stringify(scores));
  }, [scores]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.TERM_SUBJECT_RECORDS, JSON.stringify(termSubjectRecords));
  }, [termSubjectRecords]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SUMMARIES, JSON.stringify(termSummaries));
  }, [termSummaries]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.COMMENTS, JSON.stringify(commentBank));
  }, [commentBank]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.ANNUAL_TERMS, JSON.stringify(includedTermsForAnnual));
  }, [includedTermsForAnnual]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.REPORT_TYPE, activeReportType);
  }, [activeReportType]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS.SESSION_ARCHIVES);
    } catch {
      // Session archives are memory-only; continue if browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.PROMOTION_LOGS, JSON.stringify(promotionLogs));
  }, [promotionLogs]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.OFFICE_MESSAGES, JSON.stringify(officeMessages));
  }, [officeMessages]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.REQUIRED_DOC_SLOTS, JSON.stringify(requiredDocumentSlots));
  }, [requiredDocumentSlots]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.TEACHER_DOC_UPLOADS, JSON.stringify(teacherDocumentUploads));
  }, [teacherDocumentUploads]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.STUDENT_TESTIMONIALS, JSON.stringify(studentTestimonials));
  }, [studentTestimonials]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.ACADEMIC_DEPARTMENTS, JSON.stringify(academicDepartments));
  }, [academicDepartments]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.GRADING_SCALE_PRESETS, JSON.stringify(gradingScalePresets));
  }, [gradingScalePresets]);

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.ACTIVE_REPORT_CARD_TEMPLATE_ID, activeReportCardTemplateId);
  }, [activeReportCardTemplateId]);

  // Keep the active session archive in memory for session switching, but never persist it.
  useEffect(() => {
    if (!currentSession) return;
    setSessionArchives(prev => {
      const updatedEntry: AcademicSessionArchive = {
        sessionId: currentSession.id,
        sessionName: currentSession.name,
        institutionName: schoolProfile.name,
        schoolMotto: schoolProfile.motto,
        principalName: schoolProfile.principalName,
        updatedAt: new Date().toISOString(),
        classSections,
        teachers,
        students,
        enrollments,
        scores,
        termSubjectRecords,
        termSummaries
      };
      const existingIndex = prev.findIndex(archive => archive.sessionId === currentSession.id);
      if (existingIndex < 0) return [...prev, updatedEntry];
      const existing = prev[existingIndex];
      if (
        existing.sessionName === updatedEntry.sessionName &&
        existing.institutionName === updatedEntry.institutionName &&
        existing.schoolMotto === updatedEntry.schoolMotto &&
        existing.principalName === updatedEntry.principalName &&
        existing.classSections === updatedEntry.classSections &&
        existing.teachers === updatedEntry.teachers &&
        existing.students === updatedEntry.students &&
        existing.enrollments === updatedEntry.enrollments &&
        existing.scores === updatedEntry.scores &&
        existing.termSubjectRecords === updatedEntry.termSubjectRecords &&
        existing.termSummaries === updatedEntry.termSummaries
      ) return prev;
      return prev.map((archive, index) => index === existingIndex ? updatedEntry : archive);
    });
  }, [currentSession, classSections, teachers, students, enrollments, scores, termSubjectRecords, termSummaries,
    schoolProfile.name, schoolProfile.motto, schoolProfile.principalName]);

  const currentSection = useMemo(() => {
    return classSections.find(s => s.id === selectedSectionId) || classSections[0];
  }, [classSections, selectedSectionId]);

  const currentStudent = useMemo(() => {
    return students.find(st => st.id === selectedStudentId);
  }, [students, selectedStudentId]);

  const gradingScales = useMemo(() => {
    return resolveActiveGradingScaleBands({
      levelType: currentSection.levelType,
      presets: gradingScalePresets
    });
  }, [currentSection.levelType, gradingScalePresets]);

  // Update School Profile (and update institutionName on the current active session)
  const updateSchoolProfile = useCallback((profile: Partial<SchoolProfile>) => {
    setSchoolProfile(prev => {
      const next = { ...prev, ...profile };
      if (profile.name) {
        setSessions(prevSessions =>
          prevSessions.map(s => (s.isCurrent ? { ...s, institutionName: profile.name } : s))
        );
      }
      return next;
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  // Update Session / Term names
  const updateSessionName = useCallback((id: number, name: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s));
    setSessionArchives(prev => prev.map(a => a.sessionId === id ? { ...a, sessionName: name } : a));
    setSchoolProfile(prev => ({ ...prev, currentSession: name }));
  }, []);

  // Create a new Academic Session (preserving current session archive & institution name)
  const createAcademicSession = useCallback(
    (name: string, options?: { copyStudents?: boolean; makeActive?: boolean }): AcademicSession => {
      const cleanName = name.trim();
      const existing = sessions.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
      if (existing) {
        return existing;
      }

      const newSessionId = Math.max(0, ...sessions.map(s => s.id)) + 1;
      const shouldMakeActive = options?.makeActive ?? false;
      const shouldCopyStudents = options?.copyStudents ?? true;

      const newSession: AcademicSession = {
        id: newSessionId,
        name: cleanName,
        isCurrent: shouldMakeActive,
        institutionName: schoolProfile.name,
        createdAt: new Date().toISOString()
      };

      // Build clean initial state for the new session (students enrolled, scores blank/empty so no stale marks carry over)
      const clonedStudents: Student[] = shouldCopyStudents
        ? students.map(st => ({ ...st }))
        : [];
      const clonedEnrollments: StudentSubjectEnrollment[] = shouldCopyStudents
        ? enrollments.map(en => ({ ...en }))
        : [];

      const newArchive: AcademicSessionArchive = {
        sessionId: newSessionId,
        sessionName: cleanName,
        institutionName: schoolProfile.name,
        schoolMotto: schoolProfile.motto,
        principalName: schoolProfile.principalName,
        updatedAt: new Date().toISOString(),
        classSections,
        teachers,
        students: clonedStudents,
        enrollments: clonedEnrollments,
        scores: [],
        termSubjectRecords: [],
        termSummaries: []
      };

      setSessionArchives(prev => {
        const preservedArchives = shouldMakeActive
          ? [
              ...prev.filter(archive => archive.sessionId !== currentSession.id),
              {
                sessionId: currentSession.id,
                sessionName: currentSession.name,
                institutionName: schoolProfile.name,
                schoolMotto: schoolProfile.motto,
                principalName: schoolProfile.principalName,
                updatedAt: new Date().toISOString(),
                classSections,
                teachers,
                students,
                enrollments,
                scores,
                termSubjectRecords,
                termSummaries
              }
            ]
          : prev;
        return [
          ...preservedArchives.filter(archive => archive.sessionId !== newSessionId),
          newArchive
        ];
      });

      if (shouldMakeActive) {
        setSessions(prev => [
          ...prev.map(s => ({ ...s, isCurrent: false })),
          newSession
        ]);
        setSchoolProfile(prev => ({ ...prev, currentSession: cleanName }));
        setStudents(clonedStudents);
        setEnrollments(clonedEnrollments);
        setScores([]);
        setTermSubjectRecords([]);
        setTermSummaries([]);
      } else {
        setSessions(prev => [...prev, newSession]);
      }

      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return newSession;
    },
    [sessions, currentSession, schoolProfile, students, enrollments, classSections, teachers,
      scores, termSubjectRecords, termSummaries]
  );

  // Switch Active Academic Session and load its student records from the database archive
  const selectActiveSession = useCallback(
    (sessionId: number) => {
      const targetSession = sessions.find(s => s.id === sessionId);
      if (!targetSession || sessionId === currentSession.id) return;

      // Save current session state first
      const currentArchiveSnapshot: AcademicSessionArchive = {
        sessionId: currentSession.id,
        sessionName: currentSession.name,
        institutionName: schoolProfile.name,
        schoolMotto: schoolProfile.motto,
        principalName: schoolProfile.principalName,
        updatedAt: new Date().toISOString(),
        classSections,
        teachers,
        students,
        enrollments,
        scores,
        termSubjectRecords,
        termSummaries
      };

      const targetArchive = sessionArchives.find(a => a.sessionId === sessionId);

      setSessionArchives(prev => {
        const withSavedCurrent = prev.some(a => a.sessionId === currentSession.id)
          ? prev.map(a => (a.sessionId === currentSession.id ? currentArchiveSnapshot : a))
          : [...prev, currentArchiveSnapshot];
        return withSavedCurrent;
      });

      setSessions(prev =>
        prev.map(s => ({
          ...s,
          isCurrent: s.id === sessionId
        }))
      );

      setSchoolProfile(prev => ({
        ...prev,
        currentSession: targetSession.name,
        name: targetArchive?.institutionName || targetSession.institutionName || prev.name
      }));

      if (targetArchive) {
        setStudents(targetArchive.students || []);
        setEnrollments(targetArchive.enrollments || []);
        setScores(targetArchive.scores || []);
        setTermSubjectRecords(targetArchive.termSubjectRecords || []);
        setTermSummaries(targetArchive.termSummaries || []);
      }

      setLastAutoSavedTime(new Date().toLocaleTimeString());
    },
    [
      sessions,
      currentSession,
      schoolProfile,
      classSections,
      teachers,
      students,
      enrollments,
      scores,
      termSubjectRecords,
      termSummaries,
      sessionArchives
    ]
  );

  const updateTermName = useCallback((id: number, name: string) => {
    setTerms(prev => prev.map(t => t.id === id ? { ...t, name: name as any } : t));
    setSchoolProfile(prev => ({ ...prev, currentTerm: name as any }));
  }, []);

  // Student CRUD
  const addStudent = useCallback((
    data: Omit<Student, 'id'>,
    onEnrollmentsCreated?: (enrollments: StudentSubjectEnrollment[]) => void
  ): Student => {
    const newId = Date.now() + (nextStudentIdSeq++);
    const newStudent: Student = { ...data, id: newId };
    setStudents(prev => [...prev, newStudent]);

    // Auto-create enrollments for this student for their section
    const targetSection = classSections.find(s => s.id === data.currentSectionId);
    let newEnrs: StudentSubjectEnrollment[] = [];
    if (targetSection) {
      const applicableSubjects = subjects.filter(sub => {
        if (targetSection.levelType === 'SENIOR') {
          return sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH';
        } else {
          return sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH';
        }
      });

      newEnrs = applicableSubjects.map(sub => ({
        id: Date.now() + (nextStudentIdSeq++),
        studentId: newId,
        sectionId: data.currentSectionId,
        subjectId: sub.id,
        termId: currentTerm.id,
        isIncluded: targetSection.levelType === 'JUNIOR' ? true : sub.category === 'CORE'
      }));

      setEnrollments(prev => [...prev, ...newEnrs]);
    }

    onEnrollmentsCreated?.(newEnrs);
    setLastAutoSavedTime(new Date().toLocaleTimeString());
    return newStudent;
  }, [classSections, currentTerm.id, subjects]);

  const updateStudent = useCallback((id: number, data: Partial<Student>) => {
    setStudents(prev => prev.map(st => st.id === id ? { ...st, ...data } : st));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const deleteStudent = useCallback((id: number) => {
    setStudents(prev => prev.filter(st => st.id !== id));
    setScores(prev => prev.filter(sc => sc.studentId !== id));
    setEnrollments(prev => prev.filter(en => en.studentId !== id));
    setTermSummaries(prev => prev.filter(su => su.studentId !== id));
    setTermSubjectRecords(prev => prev.filter(r => r.studentId !== id));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  // Class Section CRUD
  const addClassSection = useCallback((data: Omit<ClassSection, 'id'>): ClassSection => {
    const newSection: ClassSection = { ...data, id: Date.now() };
    setClassSections(prev => [...prev, newSection]);
    setLastAutoSavedTime(new Date().toLocaleTimeString());
    return newSection;
  }, []);

  const updateClassSection = useCallback((id: number, data: Partial<ClassSection>) => {
    setClassSections(prev => prev.map(sec => sec.id === id ? { ...sec, ...data } : sec));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const deleteClassSection = useCallback((id: number) => {
    setClassSections(prev => prev.filter(sec => sec.id !== id));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  // Teachers & Form Tutor Assignment (Created with generated 4-digit PIN; forces password setup on first login)
  const addTeacher = useCallback((data: Omit<Teacher, 'id'>): Teacher => {
    const cleanUsername = (data.username?.trim() || generateTeacherUsername(data.fullName)).toLowerCase();
    const generatedPin =
      data.initialPin && /^\d{4}$/.test(data.initialPin.trim())
        ? data.initialPin.trim()
        : generateFourDigitPin();
    const newTeacher: Teacher = {
      ...data,
      id: Date.now(),
      username: cleanUsername,
      initialPin: generatedPin,
      assignedSubjects: data.assignedSubjects || [],
      mustSetPassword: data.mustSetPassword ?? true,
      hasPasswordSet: data.hasPasswordSet ?? false,
      passwordResetRequested: false
    };
    setTeachers(prev => {
      // If a section is assigned to this new teacher, unassign it from any previous form tutor
      const cleaned = data.assignedSectionId
        ? prev.map(t => (t.assignedSectionId === data.assignedSectionId ? { ...t, assignedSectionId: undefined } : t))
        : prev;
      return [...cleaned, newTeacher];
    });
    if (data.assignedSectionId) {
      setClassSections(prev => prev.map(sec => sec.id === data.assignedSectionId ? { ...sec, classTeacherName: data.fullName } : sec));
    }
    fetch('/api/auth/register-passwordless', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cleanUsername,
        fullName: newTeacher.fullName,
        initialPin: generatedPin,
        role: newTeacher.systemRole || (newTeacher.role === 'SUBJECT_TEACHER' ? 'SUBJECT_TEACHER' : 'CLASS_TEACHER')
      })
    }).catch(() => {});
    setLastAutoSavedTime(new Date().toLocaleTimeString());
    return newTeacher;
  }, []);

  const updateTeacher = useCallback((id: number, data: Partial<Teacher>) => {
    setTeachers(prev => {
      const updatedList = prev.map(t => t.id === id ? { ...t, ...data } : t);
      const updatedTeacher = updatedList.find(t => t.id === id);
      if (updatedTeacher && updatedTeacher.assignedSectionId) {
        setClassSections(prevSec => prevSec.map(sec => sec.id === updatedTeacher.assignedSectionId ? { ...sec, classTeacherName: updatedTeacher.fullName } : sec));
      }
      return updatedList;
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const updateTeacherCredentials = useCallback(async (input: {
    teacherId: number;
    username: string;
    fullName: string;
    newPassword?: string;
    actorUsername: string;
    actorCredential: string;
  }): Promise<{ ok: boolean; message: string }> => {
    const isSelfUpdate = input.teacherId === currentUser.id;
    if (!isSelfUpdate && !canManageStaffAuth(currentRole)) {
      return { ok: false, message: 'Only Super Admin, Principal, Head of Schools, or Vice Principal can change another staff member’s credentials.' };
    }

    try {
      const response = await fetch('/api/auth/update-staff-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          newUsername: input.username
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        return {
          ok: false,
          message: result.error || 'Could not update staff credentials.'
        };
      }

      setTeachers(previous =>
        previous.map(teacher =>
          teacher.id === input.teacherId
            ? {
                ...teacher,
                username: result.username,
                fullName: result.fullName,
                ...(result.passwordUpdated
                  ? { mustSetPassword: false, hasPasswordSet: true, passwordResetRequested: false }
                  : {})
              }
            : teacher
        )
      );
      if (isSelfUpdate) {
        setCurrentUser(previous => ({
          ...previous,
          username: result.username,
          fullName: result.fullName
        }));
      }
      const teacher = teachers.find(item => item.id === input.teacherId);
      if (teacher?.assignedSectionId) {
        setClassSections(previous =>
          previous.map(section =>
            section.id === teacher.assignedSectionId
              ? { ...section, classTeacherName: result.fullName }
              : section
          )
        );
      }
      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return { ok: true, message: result.message };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `Could not save staff credentials: ${message}` };
    }
  }, [currentRole, currentUser.id, currentUser.username, teachers]);

  const deleteTeacher = useCallback((id: number) => {
    setTeachers(prev => {
      const target = prev.find(t => t.id === id);
      if (target && target.assignedSectionId) {
        setClassSections(prevSec => prevSec.map(sec => sec.id === target.assignedSectionId ? { ...sec, classTeacherName: 'Unassigned' } : sec));
      }
      return prev.filter(t => t.id !== id);
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const assignFormTutor = useCallback((sectionId: number, teacherName: string, teacherId?: number) => {
    setClassSections(prev => prev.map(sec => sec.id === sectionId ? { ...sec, classTeacherName: teacherName } : sec));
    setTeachers(prev => prev.map(t => {
      if (teacherId !== undefined) {
        if (t.id === teacherId) return { ...t, assignedSectionId: sectionId, role: t.role === 'SUBJECT_TEACHER' ? 'BOTH' : t.role };
        if (t.assignedSectionId === sectionId) return { ...t, assignedSectionId: undefined };
      } else {
        if (t.fullName.toLowerCase() === teacherName.toLowerCase()) return { ...t, assignedSectionId: sectionId, role: t.role === 'SUBJECT_TEACHER' ? 'BOTH' : t.role };
        if (t.assignedSectionId === sectionId) return { ...t, assignedSectionId: undefined };
      }
      return t;
    }));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const getAssignedTeacherForSubject = useCallback(
    (sectionId: number, subjectId: number): Teacher | undefined => {
      return teachers.find(t =>
        (t.assignedSubjects || []).some(
          a => Number(a.sectionId) === Number(sectionId) && Number(a.subjectId) === Number(subjectId)
        )
      );
    },
    [teachers]
  );

  // Assign a subject in a class section to a teacher (removing it from any previously assigned teacher)
  const assignSubjectToTeacher = useCallback((sectionId: number, subjectId: number, teacherId: number) => {
    setTeachers(prev => {
      const next = prev.map(t => {
        const filtered = (t.assignedSubjects || []).filter(
          a => !(Number(a.sectionId) === Number(sectionId) && Number(a.subjectId) === Number(subjectId))
        );
        if (t.id === teacherId) {
          return {
            ...t,
            assignedSubjects: [...filtered, { sectionId: Number(sectionId), subjectId: Number(subjectId) }]
          };
        }
        return {
          ...t,
          assignedSubjects: filtered
        };
      });

      // Keep currentUser in sync if they are the affected teacher
      setCurrentUser(curr => {
        const matched = next.find(t => t.id === curr.id || t.username === curr.username);
        if (matched) {
          return { ...curr, assignedSubjects: matched.assignedSubjects || [] };
        }
        return curr;
      });

      return next;
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const removeSubjectFromTeacher = useCallback((sectionId: number, subjectId: number, teacherId: number) => {
    setTeachers(prev => {
      const next = prev.map(t => {
        if (t.id !== teacherId) return t;
        return {
          ...t,
          assignedSubjects: (t.assignedSubjects || []).filter(
            a => !(Number(a.sectionId) === Number(sectionId) && Number(a.subjectId) === Number(subjectId))
          )
        };
      });
      setCurrentUser(curr => {
        const matched = next.find(t => t.id === curr.id || t.username === curr.username);
        if (matched) {
          return { ...curr, assignedSubjects: matched.assignedSubjects || [] };
        }
        return curr;
      });
      return next;
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  // Complete First-Time Password Setup (Enforces >8 chars, 1 uppercase, 1 number/special; encrypted on Server)
  const completeTeacherPasswordSetup = useCallback(async (username: string, newPassword: string, initialPin: string): Promise<{ ok: boolean; message: string }> => {
    const cleanUser = username.trim().toLowerCase();
    const validation = validateStrictPassword(newPassword);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors[0] || 'Password must be longer than 8 characters, with at least 1 uppercase letter and 1 number or special character.'
      };
    }
    const matchedTeacher = teachers.find(t => (t.username || generateTeacherUsername(t.fullName)).toLowerCase() === cleanUser);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          initialPin,
          newPassword
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, message: data.error || 'Could not set password.' };
      }
    } catch (error) {
      return {
        ok: false,
        message: `Could not verify or save the password setup with the server: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    setTeachers(prev =>
      prev.map(t => {
        const u = (t.username || generateTeacherUsername(t.fullName)).toLowerCase();
        if (u === cleanUser) {
          return {
            ...t,
            username: cleanUser,
            mustSetPassword: false,
            hasPasswordSet: true,
            passwordResetRequested: false,
            passwordResetRequestedAt: undefined
          };
        }
        return t;
      })
    );

    return { ok: true, message: 'New password set and encrypted with AES-256-GCM + scrypt on the server.' };
  }, [teachers]);

  // Request Forgotten Password Reset and notify the Super Admin's office.
  const requestPasswordResetForUsername = useCallback(async (username: string): Promise<{ ok: boolean; message: string }> => {
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) {
      return { ok: false, message: 'Please enter your username first.' };
    }
    const matchedTeacher = teachers.find(t => (t.username || generateTeacherUsername(t.fullName)).toLowerCase() === cleanUser);

    try {
      const response = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          ...(matchedTeacher
            ? {
                fullName: matchedTeacher.fullName,
                role: matchedTeacher.systemRole || 'CLASS_TEACHER'
              }
            : {})
        })
      });
      if (!response.ok && (navigator.onLine || !matchedTeacher)) {
        const result = await response.json().catch(() => null);
        return {
          ok: false,
          message: result?.error || `The reset request could not be sent to the server (HTTP ${response.status}).`
        };
      }
    } catch (error) {
      if (navigator.onLine || !matchedTeacher) {
        return {
          ok: false,
          message: `The reset request could not be saved: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }

    if (!matchedTeacher) {
      return {
        ok: true,
        message: `The server-managed account @${cleanUser} was found and its recovery request was recorded. An authorized administrator must approve the reset.`
      };
    }

    const nowIso = new Date().toISOString();
    setTeachers(prev =>
      prev.map(t =>
        t.id === matchedTeacher.id
          ? { ...t, passwordResetRequested: true, passwordResetRequestedAt: nowIso }
          : t
      )
    );
    setOfficeMessages(previous => [
      {
        id: `msg-reset-${matchedTeacher.id}-${Date.now()}`,
        senderName: matchedTeacher.fullName,
        senderRole: matchedTeacher.systemRole || 'CLASS_TEACHER',
        recipientTeacherId: 999,
        recipientTeacherName: 'Super Admin',
        title: 'PIN / Password Reset Request',
        subject: 'PIN / Password Reset Request',
        body: `${matchedTeacher.fullName} (@${cleanUser}) requested a PIN or password reset.`,
        priority: 'IMPORTANT',
        readByTeacherIds: [],
        createdAt: nowIso
      },
      ...previous
    ]);

    return {
      ok: true,
      message: `Password reset request submitted for ${matchedTeacher.fullName} (@${cleanUser}) and sent to the Super Admin's office.`
    };
  }, [teachers]);

  // Approve Password Reset (Super Admin, Principal, Vice Principal) -> Generates a fresh 4-digit PIN
  const approveTeacherPasswordReset = useCallback(async (teacherId: number): Promise<{ ok: boolean; message: string }> => {
    if (!canManageStaffAuth(currentRole)) {
      return { ok: false, message: 'Only Super Admin, Principal, Head of Schools, or Vice Principal can approve password resets.' };
    }
    const target = teachers.find(t => t.id === teacherId);
    if (!target) {
      return { ok: false, message: 'Teacher record not found.' };
    }
    const cleanUser = (target.username || generateTeacherUsername(target.fullName)).toLowerCase();
    const newPin = generateFourDigitPin();

    try {
      await fetch('/api/auth/approve-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          actorRole: currentRole,
          newPin
        })
      });
    } catch {
      // continue
    }

    setTeachers(prev =>
      prev.map(t =>
        t.id === teacherId
          ? {
              ...t,
              initialPin: newPin,
              mustSetPassword: true,
              hasPasswordSet: false,
              passwordResetRequested: false,
              passwordResetRequestedAt: undefined
            }
          : t
      )
    );

    return {
      ok: true,
      message: `Password reset approved for ${target.fullName} (@${cleanUser}). New 4-digit initial login PIN: ${newPin}.`
    };
  }, [currentRole, teachers]);

  // Subjects CRUD
  const addSubject = useCallback((data: Omit<Subject, 'id'>): Subject => {
    const nextId = Math.max(Date.now(), nextSubjectIdRef.current + 1, ...subjects.map(subject => subject.id + 1));
    nextSubjectIdRef.current = nextId;
    const newSubject: Subject = {
      ...data,
      id: nextId
    };
    setSubjects(prev => [...prev, newSubject]);
    setLastAutoSavedTime(new Date().toLocaleTimeString());
    return newSubject;
  }, [subjects]);

  const updateSubject = useCallback((id: number, data: Partial<Subject>) => {
    setSubjects(prev => prev.map(sub => sub.id === id ? { ...sub, ...data } : sub));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const deleteSubject = useCallback((id: number) => {
    setSubjects(prev => prev.filter(sub => sub.id !== id));
    setEnrollments(prev => prev.filter(en => en.subjectId !== id));
    setScores(prev => prev.filter(sc => sc.subjectId !== id));
    setTermSubjectRecords(prev => prev.filter(r => r.subjectId !== id));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  // CA Component Headers & Max Values (Applies to all)
  const updateAssessmentComponent = useCallback((id: number, data: Partial<AssessmentComponent>) => {
    setAssessmentComponents(prev => prev.map(comp => comp.id === id ? { ...comp, ...data } : comp));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const updateReportCardSubjectOrder = useCallback(
    (level: LevelType, subjectIds: number[]) => {
      setReportCardSubjectOrder(previous => ({ ...previous, [level]: subjectIds }));
      setLastAutoSavedTime(new Date().toLocaleTimeString());
    },
    []
  );

  const addAssessmentComponent = useCallback((comp: Omit<AssessmentComponent, 'id'>) => {
    const newComp: AssessmentComponent = { ...comp, id: Date.now() };
    setAssessmentComponents(prev => [...prev, newComp]);
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const deleteAssessmentComponent = useCallback((id: number) => {
    setAssessmentComponents(prev => prev.filter(c => c.id !== id));
    setScores(prev => prev.filter(s => s.componentId !== id));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  // Custom Report Templates CRUD
  const saveCustomReportTemplate = useCallback((template: CustomReportTemplate) => {
    setCustomReportTemplates(prev => {
      const idx = prev.findIndex(t => t.id === template.id);
      const normalizedSectionIds =
        template.sectionIds && template.sectionIds.length > 0
          ? template.sectionIds
          : [template.sectionId];
      const updated: CustomReportTemplate = {
        ...template,
        sectionId: normalizedSectionIds[0] || template.sectionId,
        sectionIds: normalizedSectionIds,
        updatedAt: new Date().toISOString()
      };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [...prev, updated];
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const deleteCustomReportTemplate = useCallback((id: string) => {
    setCustomReportTemplates(prev => prev.filter(t => t.id !== id));
    setActiveReportCardTemplateId(prev => (prev === id ? 'STANDARD' : prev));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const toggleCustomReportInReportTab = useCallback((templateId: string, enabled: boolean) => {
    setCustomReportTemplates(prev =>
      prev.map(t =>
        t.id === templateId ? { ...t, enabledInReportTab: enabled, updatedAt: new Date().toISOString() } : t
      )
    );
    if (!enabled) {
      setActiveReportCardTemplateId(prev => (prev === templateId ? 'STANDARD' : prev));
    }
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const updateStudentCustomReportScore = useCallback(
    (templateId: string, studentId: number, subjectId: number, columnId: string, score: number | null) => {
      const st = students.find(s => s.id === studentId);
      if (st?.isRecordSealed) return;
      setCustomReportTemplates(prev =>
        prev.map(t => {
          if (t.id !== templateId) return t;
          const key = `${studentId}_${subjectId}`;
          const prevScores = t.studentCustomScores || {};
          const prevSubScores = prevScores[key] || {};
          const nextSubScores = { ...prevSubScores };
          if (score === null) {
            delete nextSubScores[columnId];
          } else {
            const col = t.columns.find(c => c.id === columnId);
            const numericScore = Number(score);
            if (!Number.isFinite(numericScore)) return t;
            nextSubScores[columnId] = col
              ? Math.min(col.maxScore, Math.max(0, numericScore))
              : Math.max(0, numericScore);
          }
          const nextScores = { ...prevScores };
          if (Object.keys(nextSubScores).length) nextScores[key] = nextSubScores;
          else delete nextScores[key];
          return {
            ...t,
            studentCustomScores: nextScores,
            updatedAt: new Date().toISOString()
          };
        })
      );
      setLastAutoSavedTime(new Date().toLocaleTimeString());
    },
    [students]
  );

  // Teacher's Corner & Executive Office Handlers
  const sendOfficeMessage = useCallback(
    (msg: Omit<OfficeMessage, 'id' | 'createdAt' | 'readByTeacherIds'>): OfficeMessage => {
      const newMsg: OfficeMessage = {
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        readByTeacherIds: []
      };
      setOfficeMessages(prev => [newMsg, ...prev]);
      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return newMsg;
    },
    []
  );

  const markOfficeMessageAsRead = useCallback((messageId: string, teacherId: number) => {
    setOfficeMessages(prev =>
      prev.map(m => {
        if (m.id !== messageId) return m;
        if (m.readByTeacherIds.includes(teacherId)) return m;
        return { ...m, readByTeacherIds: [...m.readByTeacherIds, teacherId] };
      })
    );
  }, []);

  const deleteOfficeMessage = useCallback((messageId: string) => {
    setOfficeMessages(prev => prev.filter(m => m.id !== messageId));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const createRequiredDocumentSlot = useCallback(
    (slot: Omit<RequiredDocumentSlot, 'id' | 'createdAt'>): RequiredDocumentSlot => {
      const newSlot: RequiredDocumentSlot = {
        ...slot,
        id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString()
      };
      setRequiredDocumentSlots(prev => [newSlot, ...prev]);
      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return newSlot;
    },
    []
  );

  const deleteRequiredDocumentSlot = useCallback((slotId: string) => {
    setRequiredDocumentSlots(prev => prev.filter(s => s.id !== slotId));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const saveAcademicDepartment = useCallback(
    (dept: Omit<AcademicDepartment, 'id' | 'createdAt'> & { id?: string }): AcademicDepartment => {
      const targetId = dept.id || `dept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const savedDept: AcademicDepartment = {
        ...dept,
        id: targetId,
        createdAt: new Date().toISOString()
      };
      setAcademicDepartments(prev => {
        const exists = prev.some(d => d.id === targetId);
        if (exists) {
          return prev.map(d => (d.id === targetId ? { ...d, ...savedDept, createdAt: d.createdAt } : d));
        }
        return [...prev, savedDept];
      });
      // Synchronize existing uploaded documents' department tags if their subject belongs to this department
      setTeacherDocumentUploads(prev =>
        prev.map(doc => {
          if ((savedDept.subjectIds || []).some(sId => Number(sId) === Number(doc.subjectId))) {
            return {
              ...doc,
              departmentId: savedDept.id,
              departmentName: savedDept.name
            };
          }
          return doc;
        })
      );
      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return savedDept;
    },
    []
  );

  const deleteAcademicDepartment = useCallback((deptId: string) => {
    setAcademicDepartments(prev => prev.filter(d => d.id !== deptId));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const saveGradingScalePreset = useCallback(
    (preset: Omit<GradingScalePreset, 'id' | 'updatedAt'> & { id?: string }): GradingScalePreset => {
      const resolvedScope = preset.scope || preset.targetScope || 'SENIOR';
      const targetId = preset.id || `scale-${resolvedScope.toLowerCase()}-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const savedPreset: GradingScalePreset = {
        ...preset,
        scope: resolvedScope,
        targetScope: resolvedScope,
        id: targetId,
        bands: [...preset.bands].sort((a, b) => b.minScore - a.minScore),
        updatedAt: nowIso
      };
      setGradingScalePresets(prev => {
        let next = [...prev];
        // If this preset is enabled for reports, disable other presets in the same scope/template
        if (savedPreset.isEnabledForReports) {
          next = next.map(p => {
            if (p.id === targetId) return p;
            const pScope = p.scope || p.targetScope;
            if (resolvedScope === 'CUSTOM_TEMPLATE') {
              if (
                pScope === 'CUSTOM_TEMPLATE' &&
                (p.customTemplateId || '') === (savedPreset.customTemplateId || '')
              ) {
                return { ...p, isEnabledForReports: false };
              }
              return p;
            }
            if (pScope === resolvedScope) {
              return { ...p, isEnabledForReports: false };
            }
            return p;
          });
        }
        const exists = next.some(p => p.id === targetId);
        if (exists) {
          return next.map(p => (p.id === targetId ? savedPreset : p));
        }
        return [...next, savedPreset];
      });
      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return savedPreset;
    },
    []
  );

  const enableGradingScalePresetForReports = useCallback((presetId: string) => {
    setGradingScalePresets(prev => {
      const target = prev.find(p => p.id === presetId);
      if (!target) return prev;
      const targetScope = target.scope || target.targetScope;
      return prev.map(p => {
        if (p.id === presetId) {
          return { ...p, isEnabledForReports: true, updatedAt: new Date().toISOString() };
        }
        const pScope = p.scope || p.targetScope;
        if (targetScope === 'CUSTOM_TEMPLATE') {
          if (
            pScope === 'CUSTOM_TEMPLATE' &&
            (p.customTemplateId || '') === (target.customTemplateId || '')
          ) {
            return { ...p, isEnabledForReports: false };
          }
          return p;
        }
        if (pScope === targetScope) {
          return { ...p, isEnabledForReports: false };
        }
        return p;
      });
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const deleteGradingScalePreset = useCallback((presetId: string) => {
    setGradingScalePresets(prev => {
      const target = prev.find(p => p.id === presetId);
      if (!target || target.isDefault) return prev;
      const targetScope = target.scope || target.targetScope;
      const filtered = prev.filter(p => p.id !== presetId);
      if (target.isEnabledForReports) {
        return filtered.map(p =>
          (p.scope || p.targetScope) === targetScope && p.isDefault
            ? { ...p, isEnabledForReports: true }
            : p
        );
      }
      return filtered;
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const resetDefaultGradingScales = useCallback(() => {
    setGradingScalePresets(DEFAULT_GRADING_SCALE_PRESETS);
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const uploadTeacherDocument = useCallback(
    (
      doc: Omit<TeacherDocumentUpload, 'id' | 'uploadedAt' | 'status' | 'executiveRemarks'> & { id?: string }
    ): TeacherDocumentUpload => {
      const matchedDept = getDepartmentForSubject(doc.subjectId, academicDepartments);
      const newDoc: TeacherDocumentUpload = {
        ...doc,
        id: doc.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        departmentId: doc.departmentId || matchedDept?.id,
        departmentName: doc.departmentName || matchedDept?.name,
        uploadedAt: new Date().toISOString(),
        status: 'PENDING_REVIEW',
        hodReviewStatus: 'HOD_PENDING',
        executiveRemarks: []
      };
      setTeacherDocumentUploads(prev => [newDoc, ...prev]);
      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return newDoc;
    },
    [academicDepartments]
  );

  const queueOfflineDocumentUpload = useCallback(async (
    file: File,
    doc: Omit<TeacherDocumentUpload, 'id' | 'uploadedAt' | 'status' | 'executiveRemarks'> & { id?: string }
  ): Promise<{ ok: boolean; message: string }> => {
    if (file.size === 0 || file.size > 15 * 1024 * 1024) {
      return { ok: false, message: 'Document file must be between 1 byte and 15 MB.' };
    }

    const id = doc.id || `doc-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 12)}`;
    const pendingMetadata = { ...doc, id };
    try {
      await savePendingOfflineDocument({
        id,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        file,
        metadata: pendingMetadata
      });

      const matchedDepartment = getDepartmentForSubject(doc.subjectId, academicDepartments);
      const pendingDocument: TeacherDocumentUpload = {
        ...doc,
        id,
        departmentId: doc.departmentId || matchedDepartment?.id,
        departmentName: doc.departmentName || matchedDepartment?.name,
        fileStoragePath: `pending:${id}`,
        uploadedAt: new Date().toISOString(),
        status: 'PENDING_REVIEW',
        hodReviewStatus: 'HOD_PENDING',
        executiveRemarks: []
      };
      setTeacherDocumentUploads(previous => [pendingDocument, ...previous.filter(item => item.id !== id)]);
      const snapshot = {
        ...getCurrentSnapshot(),
        teacherDocumentUploads: [
          pendingDocument,
          ...teacherDocumentUploads.filter(item => item.id !== id)
        ]
      };
      await queueCurrentSnapshot(snapshot);
      setPendingOfflineDocumentCount(previous => previous + 1);
      return {
        ok: true,
        message: `“${doc.documentTitle}” and its file are saved in the offline queue. Commit them when the connection is restored.`
      };
    } catch (error) {
      const message = `Could not store the document safely for offline upload: ${error instanceof Error ? error.message : String(error)}`;
      setOfflineSyncMessage(message);
      return { ok: false, message };
    }
  }, [academicDepartments, teacherDocumentUploads]);

  const addExecutiveRemarkToDocument = useCallback(
    (
      uploadId: string,
      remarkText: string,
      status?: 'PENDING_REVIEW' | 'APPROVED' | 'NEEDS_REVISION',
      hodReviewOrStatus?:
        | {
            hodStatus?: 'HOD_PENDING' | 'HOD_REVIEWED' | 'HOD_APPROVED' | 'HOD_REVISION';
            authorName?: string;
            authorDesignation?: string;
            actionType?: 'COMMENT' | 'REVIEWED' | 'APPROVED' | 'NEEDS_REVISION';
          }
        | 'HOD_PENDING'
        | 'HOD_REVIEWED'
        | 'HOD_APPROVED'
        | 'HOD_REVISION',
      authorDesignationOverride?: string
    ) => {
      const hodReview =
        typeof hodReviewOrStatus === 'string'
          ? {
              hodStatus: hodReviewOrStatus,
              authorDesignation: authorDesignationOverride
            }
          : hodReviewOrStatus;
      const cleanRemark = remarkText.trim();
      const hodInfo = getTeacherHodDesignation(
        currentUser.id,
        academicDepartments,
        currentUser.username,
        currentUser.fullName
      );
      const resolvedAuthorName = hodReview?.authorName || currentUser.fullName;
      const resolvedDesignation =
        hodReview?.authorDesignation ||
        authorDesignationOverride ||
        (hodInfo.isHod && currentRole !== 'SUPER_ADMIN' && currentRole !== 'PRINCIPAL' && currentRole !== 'HEAD_OF_SCHOOLS' && currentRole !== 'VICE_PRINCIPAL'
          ? hodInfo.badgeText || 'Head of Department'
          : currentRole === 'PRINCIPAL'
          ? "Principal's Office"
          : currentRole === 'HEAD_OF_SCHOOLS'
          ? "Head of Schools' Office"
          : currentRole === 'VICE_PRINCIPAL'
          ? "Vice Principal's Office"
          : currentRole === 'SUPER_ADMIN'
          ? "Super User's Office"
          : hodInfo.badgeText || 'Academic Office');

      setTeacherDocumentUploads(prev =>
        prev.map(doc => {
          if (doc.id !== uploadId) return doc;
          const nowIso = new Date().toISOString();
          const nextRemarks = cleanRemark
            ? [
                ...doc.executiveRemarks,
                {
                  id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  authorName: resolvedAuthorName,
                  authorRole: currentRole,
                  authorDesignation: resolvedDesignation,
                  actionType:
                    hodReview?.actionType ||
                    (status === 'APPROVED'
                      ? 'APPROVED'
                      : status === 'NEEDS_REVISION'
                      ? 'NEEDS_REVISION'
                      : 'COMMENT'),
                  remark: cleanRemark,
                  createdAt: nowIso
                }
              ]
            : doc.executiveRemarks;

          const isHodAction = Boolean(hodReview?.hodStatus || hodInfo.isHod);
          const nextHodStatus =
            hodReview?.hodStatus ||
            (isHodAction && status === 'APPROVED'
              ? 'HOD_APPROVED'
              : isHodAction && status === 'NEEDS_REVISION'
              ? 'HOD_REVISION'
              : isHodAction
              ? 'HOD_REVIEWED'
              : doc.hodReviewStatus);

          return {
            ...doc,
            status: status || doc.status,
            hodReviewStatus: nextHodStatus,
            hodReviewedBy: isHodAction ? `${resolvedAuthorName} (${resolvedDesignation})` : doc.hodReviewedBy,
            hodReviewedAt: isHodAction ? nowIso : doc.hodReviewedAt,
            executiveRemarks: nextRemarks
          };
        })
      );
      setLastAutoSavedTime(new Date().toLocaleTimeString());
    },
    [currentUser.id, currentUser.username, currentUser.fullName, currentRole, academicDepartments]
  );

  const deleteTeacherDocument = useCallback(async (uploadId: string) => {
    const document = teacherDocumentUploads.find(item => item.id === uploadId);
    const storedFileName = document?.fileStoragePath?.split('/').pop();
    const updatedDocuments = teacherDocumentUploads.filter(item => item.id !== uploadId);
    let shouldQueueChange = Boolean(pendingOfflineSnapshotRef.current) || !navigator.onLine;

    if (document?.fileStoragePath?.startsWith('pending:')) {
      await removePendingOfflineDocument(uploadId);
      setPendingOfflineDocumentCount(previous => Math.max(0, previous - 1));
      shouldQueueChange = true;
    } else if (storedFileName && shouldQueueChange) {
      await savePendingOfflineDocument({
        id: `delete-${uploadId}`,
        action: 'DELETE',
        fileName: storedFileName
      });
      setPendingOfflineDocumentCount(previous => previous + 1);
      setOfflineSyncMessage('The document deletion will be applied when you commit your pending changes.');
    } else if (storedFileName) {
      try {
        if (!navigator.onLine) throw new TypeError('Network is unavailable.');
        const response = await fetch(`/api/documents/file/${encodeURIComponent(storedFileName)}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
          const result = await response.json().catch(() => null);
          if (response.status < 500) {
            throw new Error(result?.error || 'Could not remove stored document file.');
          }
          throw new TypeError(result?.error || 'Document service is unavailable.');
        }
      } catch (error) {
        if (error instanceof TypeError || !navigator.onLine) {
          await savePendingOfflineDocument({
            id: `delete-${uploadId}`,
            action: 'DELETE',
            fileName: storedFileName
          });
          setPendingOfflineDocumentCount(previous => previous + 1);
          setOfflineSyncMessage('A document deletion is queued on this device and will be committed with your other offline changes.');
          shouldQueueChange = true;
        } else {
          const message = error instanceof Error ? error.message : String(error);
          setOfflineSyncMessage(message);
          return;
        }
      }
    }

    setTeacherDocumentUploads(updatedDocuments);
    if (shouldQueueChange) {
      await queueCurrentSnapshot({
        ...getCurrentSnapshot(),
        teacherDocumentUploads: updatedDocuments
      });
    }
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, [teacherDocumentUploads]);

  const updateStudentTestimonial = useCallback((studentId: number, updates: Partial<StudentTestimonial>) => {
    setStudentTestimonials(prev =>
      prev.map(t => (t.studentId === studentId ? { ...t, ...updates } : t))
    );
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  // Recalculates term summaries for a given class section
  const recalculateSectionSummaries = useCallback((sectionId: number) => {
    const section = classSections.find(s => s.id === sectionId);
    if (!section) return;

    const sectionStudents = students.filter(st => st.currentSectionId === sectionId);
    const sectionSubjects = subjects.filter(sub => {
      if (section.levelType === 'SENIOR') {
        return sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH';
      } else {
        return sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH';
      }
    });

    const isSenior = section.levelType === 'SENIOR';
    const activeComponents = assessmentComponents.filter(c => c.levelType === section.levelType);
    const maxSubjectCa = isSenior ? 30.0 : 40.0;

    const studentSummariesData: Array<{
      studentId: number;
      totalObtained: number;
      totalPossible: number;
      cumulativePercentage: number;
      cumulativeGrade: string;
    }> = [];

    sectionStudents.forEach(st => {
      const studentEntries: Array<{
        subjectId: number;
        subjectName: string;
        isIncluded: boolean;
        rawTotal: number;
        maxScore: number;
        cumulativePercentage: number;
        grade: string;
      }> = [];

      sectionSubjects.forEach(sub => {
        const enr = enrollments.find(e => e.studentId === st.id && e.subjectId === sub.id && e.sectionId === sectionId);
        // For junior students, all subjects are ALWAYS included (core)
        const isIncluded = section.levelType === 'JUNIOR' ? true : (enr ? enr.isIncluded : true);

        let rawTotal = 0;
        if (isIncluded) {
          activeComponents.forEach(comp => {
            const sc = scores.find(s => s.studentId === st.id && s.subjectId === sub.id && s.componentId === comp.id);
            if (sc && sc.score !== null && !isNaN(sc.score)) {
              rawTotal += sc.score;
            }
          });
        }
        rawTotal = Number(rawTotal.toFixed(1));

        const cum100 = calculateCumulativePercentage(rawTotal, maxSubjectCa);
        const gradeInfo = determineGrade(cum100, section.levelType);

        studentEntries.push({
          subjectId: sub.id,
          subjectName: sub.name,
          isIncluded,
          rawTotal,
          maxScore: maxSubjectCa,
          cumulativePercentage: cum100,
          grade: gradeInfo.grade
        });
      });

      const overall = calculateStudentOverallSummary(studentEntries, section.levelType);
      studentSummariesData.push({
        studentId: st.id,
        totalObtained: overall.totalObtained,
        totalPossible: overall.totalPossible,
        cumulativePercentage: overall.cumulativePercentage,
        cumulativeGrade: overall.overallGrade
      });
    });

    // Compute ranks
    const ranksMap = calculateClassRanks(studentSummariesData.map(s => ({
      studentId: s.studentId,
      cumulativePercentage: s.cumulativePercentage
    })));

    setTermSummaries(prev => {
      const updated = [...prev];
      studentSummariesData.forEach(item => {
        const idx = updated.findIndex(u => u.studentId === item.studentId && u.sectionId === sectionId && u.termId === currentTerm.id);
        const currentRank = ranksMap.get(item.studentId) || 1;
        if (idx >= 0) {
          updated[idx] = {
            ...updated[idx],
            totalScoreObtained: item.totalObtained,
            totalPossibleScore: item.totalPossible,
            cumulativePercentage: item.cumulativePercentage,
            cumulativeGrade: item.cumulativeGrade,
            classRank: currentRank,
            totalStudentsInSection: sectionStudents.length,
            updatedAt: new Date().toISOString()
          };
        } else {
          updated.push({
            id: Date.now() + item.studentId,
            studentId: item.studentId,
            sectionId,
            termId: currentTerm.id,
            totalScoreObtained: item.totalObtained,
            totalPossibleScore: item.totalPossible,
            cumulativePercentage: item.cumulativePercentage,
            cumulativeGrade: item.cumulativeGrade,
            classRank: currentRank,
            totalStudentsInSection: sectionStudents.length,
            principalRemark: 'Satisfactory work. With more focus, higher grades are within reach.',
            teacherRemark: 'Solid effort throughout the term.',
            isPublished: true,
            updatedAt: new Date().toISOString()
          });
        }
      });
      return updated;
    });
  }, [classSections, students, subjects, assessmentComponents, enrollments, scores, currentTerm.id]);

  // Update Score (Automatic Commit & Audit + Central Term Subject Record Sync)
  const updateScore = useCallback((
    studentId: number,
    subjectId: number,
    componentId: number,
    score: number | null,
    reason = 'Score updated via Assessment Grid (Auto-commit)',
    enrollmentIdOverride?: number
  ): { success: boolean; error?: string } => {
    const comp = assessmentComponents.find(c => c.id === componentId);
    if (!comp) return { success: false, error: 'Component not found' };

    if (score !== null && (score < 0 || score > comp.maxScore)) {
      return {
        success: false,
        error: `Score must be between 0 and maximum possible (${comp.maxScore})`
      };
    }

    const student = students.find(st => st.id === studentId);
    if (student?.isRecordSealed) {
      return {
        success: false,
        error: `Record for ${student.fullName} is permanently SEALED (${student.recordSignature || 'GRADUATED'}) and cannot be modified.`
      };
    }
    const resolvedSectionId = student?.currentSectionId || selectedSectionId;
    const section = classSections.find(sec => sec.id === resolvedSectionId);
    const levelType = section?.levelType || 'SENIOR';
    const isJunior = levelType === 'JUNIOR';
    const maxRawCa = isJunior ? 40 : 30;
    const maxScaledCa = isJunior ? 20 : 15;
    const maxExam = isJunior ? 60 : 70;

    const subject = subjects.find(sb => sb.id === subjectId);
    let prevScoreVal: number | null = null;

    setScores(prev => {
      const existingIdx = prev.findIndex(s => s.studentId === studentId && s.subjectId === subjectId && s.componentId === componentId);
      let nextScores: AssessmentScore[];
      if (existingIdx >= 0) {
        prevScoreVal = prev[existingIdx].score;
        const copy = [...prev];
        const enrollment =
          enrollments.find(
            e => e.studentId === studentId && e.subjectId === subjectId && e.termId === comp.termId
          ) || enrollments.find(e => e.studentId === studentId && e.subjectId === subjectId);
        copy[existingIdx] = {
          ...copy[existingIdx],
          enrollmentId: enrollmentIdOverride ?? enrollment?.id ?? copy[existingIdx].enrollmentId,
          score,
          updatedBy: currentUser.id,
          updatedAt: new Date().toISOString()
        };
        nextScores = copy;
      } else {
        const enrollment =
          enrollments.find(
            e => e.studentId === studentId && e.subjectId === subjectId && e.termId === comp.termId
          ) || enrollments.find(e => e.studentId === studentId && e.subjectId === subjectId);
        nextScores = [
          ...prev,
          {
            id: Date.now() + Math.floor(Math.random() * 100000),
            enrollmentId: enrollmentIdOverride ?? enrollment?.id ?? 0,
            studentId,
            subjectId,
            componentId,
            score,
            updatedBy: currentUser.id,
            updatedAt: new Date().toISOString()
          }
        ];
      }

      // Synchronize the updated CA1 raw sum (divided by 2) into termSubjectRecords in the central database
      const levelComps = assessmentComponents.filter(c => c.levelType === levelType);
      let rawCa1 = 0;
      levelComps.forEach(c => {
        const sc = nextScores.find(s => s.studentId === studentId && s.subjectId === subjectId && s.componentId === c.id);
        if (sc && sc.score !== null && !isNaN(sc.score)) {
          rawCa1 += sc.score;
        }
      });
      rawCa1 = Number(Math.min(maxRawCa, Math.max(0, rawCa1)).toFixed(1));
      const scaledCa1 = Number(Math.min(maxScaledCa, rawCa1 / 2).toFixed(1));

      setTermSubjectRecords(prevRecs => {
        const recIdx = prevRecs.findIndex(
          r => r.studentId === studentId && r.subjectId === subjectId && r.termId === currentTerm.id
        );
        if (recIdx >= 0) {
          const existing = prevRecs[recIdx];
          const ca2Val = Number(Math.min(maxScaledCa, Math.max(0, existing.ca2Score || 0)).toFixed(1));
          const examVal = Number(Math.min(maxExam, Math.max(0, existing.examScore || 0)).toFixed(1));
          const totalVal = Number(Math.min(100, scaledCa1 + ca2Val + examVal).toFixed(1));
          const copy = [...prevRecs];
          copy[recIdx] = {
            ...existing,
            ca1Score: scaledCa1,
            ca1RawScore: rawCa1,
            totalScore: totalVal,
            grade: determineGrade(totalVal, levelType).grade
          };
          return copy;
        }
        return [
          ...prevRecs,
          {
            id: Date.now() + Math.floor(Math.random() * 100000),
            studentId,
            subjectId,
            termId: currentTerm.id,
            ca1Score: scaledCa1,
            ca1RawScore: rawCa1,
            ca2Score: 0,
            ca2RawScore: 0,
            examScore: 0,
            totalScore: scaledCa1,
            grade: determineGrade(scaledCa1, levelType).grade
          }
        ];
      });

      return nextScores;
    });

    if (prevScoreVal !== score) {
      const newAuditLog: ScoreAuditLog = {
        id: Date.now(),
        studentName: student?.fullName || `Student #${studentId}`,
        subjectName: subject?.name || `Subject #${subjectId}`,
        componentName: comp.name,
        previousScore: prevScoreVal,
        newScore: score,
        changedBy: currentUser.fullName,
        changedByRole: currentRole,
        changeReason: score === null ? 'Cleared score cell (Empty / Missing)' : reason,
        createdAt: new Date().toISOString()
      };
      setAuditLogs(prev => [newAuditLog, ...prev]);
    }

    setLastAutoSavedTime(new Date().toLocaleTimeString());

    if (student) {
      setTimeout(() => {
        recalculateSectionSummaries(student.currentSectionId);
      }, 50);
    }

    return { success: true };
  }, [assessmentComponents, students, classSections, subjects, currentUser, currentRole, enrollments, currentTerm.id, recalculateSectionSummaries]);

  // Update Term Subject Record:
  // Junior: 1st CA (20 = 40/2) + 2nd CA (20 = 40/2) + Exam (60) = 100
  // Senior: 1st CA (15 = 30/2) + 2nd CA (15 = 30/2) + Exam (70) = 100
  const updateTermSubjectScore = useCallback((
    studentId: number,
    subjectId: number,
    termId: number,
    data: {
      ca1Score?: number;
      ca2Score?: number;
      examScore?: number;
      ca1Details?: import('../types/index').CaSubScoreDetails;
      ca2Details?: import('../types/index').CaSubScoreDetails;
    }
  ) => {
    const student = students.find(s => s.id === studentId);
    if (student?.isRecordSealed) {
      return;
    }
    const section = classSections.find(sec => sec.id === student?.currentSectionId);
    const levelType = section?.levelType || 'SENIOR';
    const isJunior = levelType === 'JUNIOR';
    const maxRawCa = isJunior ? 40 : 30;
    const maxScaledCa = isJunior ? 20 : 15; // Divide total(40 or 30) by 2
    const maxExam = isJunior ? 60 : 70;     // Exam is 60 for Junior, 70 for Senior

    setTermSubjectRecords(prev => {
      const idx = prev.findIndex(r => r.studentId === studentId && r.subjectId === subjectId && r.termId === termId);
      const prevRecord = idx >= 0 ? prev[idx] : null;

      let ca1 = prevRecord?.ca1Score || 0;
      let ca1Raw = prevRecord?.ca1RawScore ?? Number((ca1 * 2).toFixed(1));
      let ca1Details = prevRecord?.ca1Details || {};
      if (data.ca1Details !== undefined) {
        ca1Details = { ...ca1Details, ...data.ca1Details };
        const rawSum = Number(
          ((ca1Details.cw || 0) + (ca1Details.qz || 0) + (ca1Details.ass || 0) + (ca1Details.pj || 0) + (ca1Details.test || 0)).toFixed(1)
        );
        ca1Raw = Math.min(maxRawCa, Math.max(0, rawSum));
        // Official Formula: Divide Total(40 or 30) by 2
        ca1 = Number(Math.min(maxScaledCa, ca1Raw / 2).toFixed(1));
      } else if (data.ca1Score !== undefined) {
        ca1 = Number(Math.min(maxScaledCa, Math.max(0, data.ca1Score)).toFixed(1));
        ca1Raw = Number((ca1 * 2).toFixed(1));
      }

      let ca2 = prevRecord?.ca2Score || 0;
      let ca2Raw = prevRecord?.ca2RawScore ?? Number((ca2 * 2).toFixed(1));
      let ca2Details = prevRecord?.ca2Details || {};
      if (data.ca2Details !== undefined) {
        ca2Details = { ...ca2Details, ...data.ca2Details };
        const rawSum2 = Number(
          ((ca2Details.cw || 0) + (ca2Details.qz || 0) + (ca2Details.ass || 0) + (ca2Details.pj || 0) + (ca2Details.test || 0)).toFixed(1)
        );
        ca2Raw = Math.min(maxRawCa, Math.max(0, rawSum2));
        // Official Formula: Divide Total(40 or 30) by 2
        ca2 = Number(Math.min(maxScaledCa, ca2Raw / 2).toFixed(1));
      } else if (data.ca2Score !== undefined) {
        ca2 = Number(Math.min(maxScaledCa, Math.max(0, data.ca2Score)).toFixed(1));
        ca2Raw = Number((ca2 * 2).toFixed(1));
      }

      const rawExamInput = data.examScore !== undefined ? data.examScore : (prevRecord?.examScore || 0);
      const exam = Number(Math.min(maxExam, Math.max(0, rawExamInput)).toFixed(1));

      // Term Total = First CA + Second CA + Exam = 100
      const totalRaw = Number(Math.min(100, ca1 + ca2 + exam).toFixed(1));
      const grade = determineGrade(totalRaw, levelType).grade;

      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          ca1Score: ca1,
          ca2Score: ca2,
          ca1RawScore: ca1Raw,
          ca2RawScore: ca2Raw,
          examScore: exam,
          totalScore: totalRaw,
          grade,
          ca1Details,
          ca2Details
        };
        return copy;
      } else {
        return [
          ...prev,
          {
            id: Date.now() + Math.floor(Math.random() * 1000),
            studentId,
            subjectId,
            termId,
            ca1Score: ca1,
            ca2Score: ca2,
            ca1RawScore: ca1Raw,
            ca2RawScore: ca2Raw,
            examScore: exam,
            totalScore: totalRaw,
            grade,
            ca1Details,
            ca2Details
          }
        ];
      }
    });

    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, [students, classSections]);

  // Toggle Subject Inclusion
  const toggleSubjectInclusion = useCallback((
    studentId: number,
    subjectId: number,
    isIncluded: boolean,
    enrollmentIdOverride?: number
  ): number => {
    const existingEnrollment = enrollments.find(
      enrollment => enrollment.studentId === studentId && enrollment.subjectId === subjectId
    );
    const enrollmentId = existingEnrollment?.id ??
      enrollmentIdOverride ??
      Date.now() + Math.floor(Math.random() * 100000);
    setEnrollments(prev => {
      const idx = prev.findIndex(e => e.studentId === studentId && e.subjectId === subjectId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], isIncluded };
        return copy;
      } else {
        const student = students.find(st => st.id === studentId);
        return [
          ...prev,
          {
            id: enrollmentId,
            studentId,
            sectionId: student?.currentSectionId || selectedSectionId,
            subjectId,
            termId: currentTerm.id,
            isIncluded
          }
        ];
      }
    });

    const student = students.find(st => st.id === studentId);
    if (student) {
      setTimeout(() => {
        recalculateSectionSummaries(student.currentSectionId);
      }, 50);
    }
    return enrollmentId;
  }, [enrollments, students, selectedSectionId, currentTerm.id, recalculateSectionSummaries]);

  // Annual Cumulative Summary Calculator
  const getStudentAnnualSummary = useCallback((studentId: number): StudentAnnualSummary => {
    const student = students.find(s => s.id === studentId);
    const sectionId = student?.currentSectionId || selectedSectionId;
    const section = classSections.find(sec => sec.id === sectionId);
    const levelType = section?.levelType || 'SENIOR';

    const t1 = termSummaries.find(s => s.studentId === studentId && s.termId === 1)?.cumulativePercentage ?? null;
    const t2 = termSummaries.find(s => s.studentId === studentId && s.termId === 2)?.cumulativePercentage ?? null;
    const t3 = termSummaries.find(s => s.studentId === studentId && s.termId === 3)?.cumulativePercentage ?? null;

    const termsToAverage = [
      { termId: 1, percentage: t1, isIncluded: includedTermsForAnnual.includes(1) },
      { termId: 2, percentage: t2, isIncluded: includedTermsForAnnual.includes(2) },
      { termId: 3, percentage: t3, isIncluded: includedTermsForAnnual.includes(3) }
    ];

    const { yearlyAverage } = calculateAnnualAverage(termsToAverage);
    const yearlyGrade = determineGrade(yearlyAverage, levelType).grade;

    return {
      studentId,
      sectionId,
      includedTerms: includedTermsForAnnual,
      firstTermPct: t1,
      secondTermPct: t2,
      thirdTermPct: t3,
      yearlyAveragePct: yearlyAverage,
      yearlyGrade,
      yearlyRank: 1
    };
  }, [students, selectedSectionId, classSections, termSummaries, includedTermsForAnnual]);

  const toggleAnnualTermInclusion = useCallback((termId: number) => {
    setIncludedTermsForAnnual(prev => {
      if (prev.includes(termId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(t => t !== termId);
      } else {
        return [...prev, termId].sort();
      }
    });
  }, []);

  // Update Remarks
  const updateRemarks = useCallback((studentId: number, principalRemark?: string, teacherRemark?: string) => {
    setTermSummaries(prev => {
      const idx = prev.findIndex(s => s.studentId === studentId && s.termId === currentTerm.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          principalRemark: principalRemark !== undefined ? principalRemark : copy[idx].principalRemark,
          teacherRemark: teacherRemark !== undefined ? teacherRemark : copy[idx].teacherRemark,
          updatedAt: new Date().toISOString()
        };
        return copy;
      }
      return prev;
    });
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, [currentTerm.id]);

  // Comment Bank CRUD
  const addCommentBankItem = useCallback((item: Omit<CommentBankItem, 'id'>) => {
    const newItem: CommentBankItem = { ...item, id: Date.now() };
    setCommentBank(prev => [...prev, newItem]);
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const updateCommentBankItem = useCallback((id: number, data: Partial<CommentBankItem>) => {
    setCommentBank(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  const deleteCommentBankItem = useCallback((id: number) => {
    setCommentBank(prev => prev.filter(c => c.id !== id));
    setLastAutoSavedTime(new Date().toLocaleTimeString());
  }, []);

  // Security Lock (Tied directly to Staff Login: unlocked when staff logged in, locked when logged out)
  const unlockSecurity = useCallback((pin: string): boolean => {
    const matchedTeacher = teachers.find(t => t.initialPin === pin.trim());
    if (pin === '1234' || matchedTeacher) {
      if (matchedTeacher) {
        const role = matchedTeacher.systemRole || (matchedTeacher.role === 'SUBJECT_TEACHER' ? 'SUBJECT_TEACHER' : 'CLASS_TEACHER');
        completeStaffLogin(
          {
            id: matchedTeacher.id,
            fullName: matchedTeacher.fullName,
            username: matchedTeacher.username || generateTeacherUsername(matchedTeacher.fullName),
            email: matchedTeacher.email,
            role,
            isActive: true,
            assignedSectionId: matchedTeacher.assignedSectionId || undefined,
            assignedSubjects: matchedTeacher.assignedSubjects || []
          },
          role,
          matchedTeacher.assignedSectionId || undefined
        );
      } else {
        try {
          localStorage.removeItem('edugrade_security_locked_v2');
        } catch {}
        setIsStaffLoggedIn(true);
        setIsSecurityUnlocked(true);
      }
      return true;
    }
    return false;
  }, [teachers, completeStaffLogin]);

  const lockSecurity = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STAFF_SESSION_STORAGE_KEY);
    } catch {}
    try {
      localStorage.setItem('edugrade_security_locked_v2', 'true');
    } catch {}
    setIsStaffLoggedIn(false);
    setIsSecurityUnlocked(false);
    setIsAuthModalOpen(true);
    setWelcomeNotification(null);
  }, []);

  // Publish / Unpublish
  const publishReportCards = useCallback((sectionId: number, publish: boolean) => {
    setTermSummaries(prev => prev.map(s => s.sectionId === sectionId ? { ...s, isPublished: publish } : s));
  }, []);

  // Parallel Class Transfer: Move one or multiple students to a parallel class (e.g. Year 7 Excellence -> Year 7 Resilience)
  // Moves their records and scores and assigns them the Form Tutor of the destination class.
  const transferStudentsBetweenClasses = useCallback(
    (
      studentIds: number[],
      destinationSectionId: number
    ): { movedCount: number; destinationSectionName: string; formTutorName: string } => {
      const destSection = classSections.find(s => s.id === destinationSectionId);
      if (!destSection || studentIds.length === 0) {
        return { movedCount: 0, destinationSectionName: '', formTutorName: '' };
      }

      const targetSet = new Set(studentIds);
      const newLogs: StudentPromotionRecord[] = [];
      const nowIso = new Date().toISOString();

      setStudents(prev =>
        prev.map(st => {
          if (!targetSet.has(st.id)) return st;
          const fromSec = classSections.find(s => s.id === st.currentSectionId);
          newLogs.push({
            id: `trans-${st.id}-${Date.now()}`,
            studentId: st.id,
            studentName: st.fullName,
            admissionNumber: st.admissionNumber,
            fromSessionId: currentSession.id,
            fromSessionName: currentSession.name,
            toSessionId: currentSession.id,
            toSessionName: currentSession.name,
            fromSectionId: st.currentSectionId,
            fromSectionName: fromSec?.name || `Class #${st.currentSectionId}`,
            toSectionId: destSection.id,
            toSectionName: destSection.name,
            toFormTutorName: destSection.classTeacherName,
            firstTermPct: 0,
            secondTermPct: 0,
            thirdTermPct: 0,
            cumulativeAvgPct: 0,
            finalGrade: '-',
            decision: 'PARALLEL_TRANSFER',
            createdAt: nowIso
          });
          return {
            ...st,
            currentSectionId: destSection.id,
            previousSectionName: fromSec?.name || st.previousSectionName,
            assignedTutorName: destSection.classTeacherName,
            promotionStatus: 'PARALLEL_TRANSFER'
          };
        })
      );

      // Update enrollments to point to destinationSectionId and ensure applicable subjects exist
      const destSubjects = subjects.filter(sub =>
        destSection.levelType === 'SENIOR'
          ? sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
          : sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH'
      );

      setEnrollments(prev => {
        const updated = prev.map(en =>
          targetSet.has(en.studentId) ? { ...en, sectionId: destSection.id } : en
        );
        const additions: StudentSubjectEnrollment[] = [];
        studentIds.forEach(stId => {
          destSubjects.forEach((sub, idx) => {
            const exists = updated.some(e => e.studentId === stId && e.subjectId === sub.id);
            if (!exists) {
              additions.push({
                id: Date.now() + stId * 100 + idx,
                studentId: stId,
                sectionId: destSection.id,
                subjectId: sub.id,
                termId: currentTerm.id,
                isIncluded: destSection.levelType === 'JUNIOR' ? true : sub.category === 'CORE'
              });
            }
          });
        });
        return [...updated, ...additions];
      });

      // Move student term summaries to destinationSectionId and recompute ranks
      setTermSummaries(prev => {
        const moved = prev.map(sum =>
          targetSet.has(sum.studentId) ? { ...sum, sectionId: destSection.id } : sum
        );
        return moved;
      });

      if (newLogs.length > 0) {
        setPromotionLogs(prev => [...newLogs, ...prev]);
      }

      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return {
        movedCount: studentIds.length,
        destinationSectionName: destSection.name,
        formTutorName: destSection.classTeacherName
      };
    },
    [classSections, currentSession, subjects, currentTerm.id]
  );

  // Academic Promotion to Next Class / Destination Session (with Probation / Repeat / Year 12 Graduation support)
  const promoteStudentsToDestinationClass = useCallback(
    (params: {
      decisions: Array<{
        studentId: number;
        decision: PromotionDecision;
        destinationSectionId: number;
        firstTermPct: number;
        secondTermPct: number;
        thirdTermPct: number;
        cumulativeAvgPct: number;
        finalGrade: string;
      }>;
      destinationSessionId: number;
      destinationTermName?: TermName;
      switchActiveSession?: boolean;
    }): { promotedCount: number; probationCount: number; repeatedCount: number; graduatedCount: number } => {
      const {
        decisions,
        destinationSessionId,
        destinationTermName = 'FIRST',
        switchActiveSession = true
      } = params;

      if (decisions.length === 0) {
        return { promotedCount: 0, probationCount: 0, repeatedCount: 0, graduatedCount: 0 };
      }

      const destSession = sessions.find(s => s.id === destinationSessionId) || currentSession;
      const nowIso = new Date().toISOString();

      // 1. Archive current session's full state first so historical records & institution name are permanently preserved
      const currentArchiveSnapshot: AcademicSessionArchive = {
        sessionId: currentSession.id,
        sessionName: currentSession.name,
        institutionName: schoolProfile.name,
        schoolMotto: schoolProfile.motto,
        principalName: schoolProfile.principalName,
        updatedAt: nowIso,
        classSections,
        teachers,
        students,
        enrollments,
        scores,
        termSubjectRecords,
        termSummaries
      };

      const decisionMap = new Map(decisions.map(d => [d.studentId, d]));
      const newLogs: StudentPromotionRecord[] = [];
      const newTestimonials: StudentTestimonial[] = [];
      let promotedCount = 0;
      let probationCount = 0;
      let repeatedCount = 0;
      let graduatedCount = 0;

      const updatedStudents: Student[] = students.map(st => {
        const d = decisionMap.get(st.id);
        if (!d) return st;

        const fromSec = classSections.find(s => s.id === st.currentSectionId);
        const toSec = classSections.find(s => s.id === d.destinationSectionId) || fromSec;

        if (d.decision === 'GRADUATED') {
          graduatedCount++;
          const stEnrollments = enrollments.filter(e => e.studentId === st.id && e.isIncluded);
          const stSubjectNames = subjects
            .filter(sub =>
              stEnrollments.length > 0
                ? stEnrollments.some(e => e.subjectId === sub.id)
                : sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
            )
            .map(sub => sub.name);

          newTestimonials.push(
            generateStudentTestimonialRecord({
              student: st,
              schoolProfile,
              sectionName: fromSec?.name || 'YEAR 12',
              sessionName: currentSession.name,
              subjectsStudied: stSubjectNames,
              cumulativeAvgPct: d.cumulativeAvgPct,
              finalGrade: d.finalGrade
            })
          );
        } else if (d.decision === 'PROMOTED') {
          promotedCount++;
        } else if (d.decision === 'PROBATION') {
          probationCount++;
        } else {
          repeatedCount++;
        }

        newLogs.push({
          id: `prom-${st.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          studentId: st.id,
          studentName: st.fullName,
          admissionNumber: st.admissionNumber,
          fromSessionId: currentSession.id,
          fromSessionName: currentSession.name,
          toSessionId: d.decision === 'GRADUATED' ? currentSession.id : destSession.id,
          toSessionName: d.decision === 'GRADUATED' ? `${currentSession.name} (GRADUATED)` : destSession.name,
          fromSectionId: st.currentSectionId,
          fromSectionName: fromSec?.name || `Class #${st.currentSectionId}`,
          toSectionId: d.decision === 'GRADUATED' ? st.currentSectionId : (toSec?.id || st.currentSectionId),
          toSectionName: d.decision === 'GRADUATED' ? 'GRADUATED (ALUMNI)' : (toSec?.name || `Class #${d.destinationSectionId}`),
          toFormTutorName: d.decision === 'GRADUATED' ? (fromSec?.classTeacherName || '') : (toSec?.classTeacherName || ''),
          firstTermPct: d.firstTermPct,
          secondTermPct: d.secondTermPct,
          thirdTermPct: d.thirdTermPct,
          cumulativeAvgPct: d.cumulativeAvgPct,
          finalGrade: d.finalGrade,
          decision: d.decision,
          createdAt: nowIso
        });

        if (d.decision === 'GRADUATED') {
          return {
            ...st,
            previousSectionName: fromSec?.name || st.previousSectionName,
            promotionStatus: 'GRADUATED',
            isRecordSealed: true,
            recordSignature: 'GRADUATED',
            graduatedSessionName: currentSession.name,
            graduatedAt: nowIso
          };
        }

        return {
          ...st,
          currentSectionId: toSec?.id || st.currentSectionId,
          previousSectionName: fromSec?.name || st.previousSectionName,
          assignedTutorName: toSec?.classTeacherName || st.assignedTutorName,
          promotionStatus: d.decision
        };
      });

      if (newTestimonials.length > 0) {
        setStudentTestimonials(prev => {
          const filtered = prev.filter(t => !newTestimonials.some(nt => nt.studentId === t.studentId));
          return [...newTestimonials, ...filtered];
        });
      }

      // Build updated enrollments for the promoted students in their destination classes
      const updatedEnrollments: StudentSubjectEnrollment[] = [];
      updatedStudents.forEach((st, stIdx) => {
        const sec = classSections.find(s => s.id === st.currentSectionId);
        if (!sec) return;
        const applicable = subjects.filter(sub =>
          sec.levelType === 'SENIOR'
            ? sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
            : sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH'
        );
        applicable.forEach((sub, subIdx) => {
          const prevEnr = enrollments.find(e => e.studentId === st.id && e.subjectId === sub.id);
          updatedEnrollments.push({
            id: prevEnr?.id || Date.now() + stIdx * 100 + subIdx,
            studentId: st.id,
            sectionId: sec.id,
            subjectId: sub.id,
            termId: 1,
            isIncluded:
              sec.levelType === 'JUNIOR'
                ? true
                : prevEnr !== undefined
                ? prevEnr.isIncluded
                : sub.category === 'CORE'
          });
        });
      });

      const isNewSession = destSession.id !== currentSession.id;

      // Save both the source session archive and the destination session archive
      setSessionArchives(prev => {
        const withSourceSaved = prev.some(a => a.sessionId === currentSession.id)
          ? prev.map(a => (a.sessionId === currentSession.id ? currentArchiveSnapshot : a))
          : [...prev, currentArchiveSnapshot];

        if (!isNewSession) {
          return withSourceSaved;
        }

        const existingDest = withSourceSaved.find(a => a.sessionId === destSession.id);
        const destArchiveSnapshot: AcademicSessionArchive = {
          sessionId: destSession.id,
          sessionName: destSession.name,
          institutionName: schoolProfile.name,
          schoolMotto: schoolProfile.motto,
          principalName: schoolProfile.principalName,
          updatedAt: nowIso,
          classSections,
          teachers,
          students: updatedStudents,
          enrollments: updatedEnrollments,
          scores: existingDest?.scores || [],
          termSubjectRecords: existingDest?.termSubjectRecords || [],
          termSummaries: existingDest?.termSummaries || []
        };

        return withSourceSaved.some(a => a.sessionId === destSession.id)
          ? withSourceSaved.map(a => (a.sessionId === destSession.id ? destArchiveSnapshot : a))
          : [...withSourceSaved, destArchiveSnapshot];
      });

      setPromotionLogs(prev => [...newLogs, ...prev]);

      if (!isNewSession || switchActiveSession) {
        setStudents(updatedStudents);
        setEnrollments(updatedEnrollments);
        if (isNewSession) {
          setSessions(prev =>
            prev.map(s => ({
              ...s,
              isCurrent: s.id === destSession.id
            }))
          );
          const matchedTerm = terms.find(t => t.name === destinationTermName) || terms[0];
          setCurrentTermState(matchedTerm);
          setSchoolProfile(prev => ({
            ...prev,
            currentSession: destSession.name,
            currentTerm: matchedTerm.name
          }));
          // New session starts with blank scores for promoted students unless scores already exist in dest archive
          const existingDest = sessionArchives.find(a => a.sessionId === destSession.id);
          setScores(existingDest?.scores || []);
          setTermSubjectRecords(existingDest?.termSubjectRecords || []);
          setTermSummaries(existingDest?.termSummaries || []);
        }
      }

      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return { promotedCount, probationCount, repeatedCount, graduatedCount };
    },
    [
      sessions,
      currentSession,
      schoolProfile,
      classSections,
      teachers,
      students,
      enrollments,
      scores,
      termSubjectRecords,
      termSummaries,
      subjects,
      terms,
      sessionArchives
    ]
  );

  // Build snapshot object for MySQL / Node.js sync, SQL export & System Backup
  const buildSnapshot = useCallback((): FullDatabaseSnapshot => {
    return {
      schoolProfile,
      sessions,
      terms,
      classSections,
      teachers,
      subjects,
      students,
      assessmentComponents,
      reportCardSubjectOrder,
      enrollments,
      scores,
      termSubjectRecords,
      termSummaries,
      auditLogs,
      commentBank,
      customReportTemplates,
      promotionLogs,
      officeMessages,
      requiredDocumentSlots,
      teacherDocumentUploads,
      studentTestimonials,
      academicDepartments,
      gradingScalePresets
    };
  }, [
    schoolProfile,
    sessions,
    terms,
    classSections,
    teachers,
    subjects,
    students,
    assessmentComponents,
    reportCardSubjectOrder,
    enrollments,
    scores,
    termSubjectRecords,
    termSummaries,
    auditLogs,
    commentBank,
    customReportTemplates,
    promotionLogs,
    officeMessages,
    requiredDocumentSlots,
    teacherDocumentUploads,
    studentTestimonials,
    academicDepartments,
    gradingScalePresets
  ]);
  buildSnapshotRef.current = buildSnapshot;

  const applySnapshotToState = useCallback((snapshot: FullDatabaseSnapshot) => {
    if (snapshot.schoolProfile) setSchoolProfile(snapshot.schoolProfile);
    if (Array.isArray(snapshot.sessions)) setSessions(snapshot.sessions);
    if (Array.isArray(snapshot.terms)) {
      setTerms(snapshot.terms);
      const activeTerm = snapshot.terms.find(term => term.isActive) || snapshot.terms[0];
      if (activeTerm) setCurrentTermState(activeTerm);
    }
    if (Array.isArray(snapshot.classSections)) setClassSections(snapshot.classSections);
    if (Array.isArray(snapshot.teachers)) setTeachers(snapshot.teachers);
    if (Array.isArray(snapshot.subjects)) setSubjects(snapshot.subjects);
    if (Array.isArray(snapshot.students)) setStudents(snapshot.students);
    if (Array.isArray(snapshot.assessmentComponents)) setAssessmentComponents(snapshot.assessmentComponents);
    if (snapshot.reportCardSubjectOrder) {
      setReportCardSubjectOrder({
        JUNIOR: Array.isArray(snapshot.reportCardSubjectOrder.JUNIOR)
          ? snapshot.reportCardSubjectOrder.JUNIOR
          : [],
        SENIOR: Array.isArray(snapshot.reportCardSubjectOrder.SENIOR)
          ? snapshot.reportCardSubjectOrder.SENIOR
          : []
      });
    }
    if (Array.isArray(snapshot.enrollments)) setEnrollments(snapshot.enrollments);
    if (Array.isArray(snapshot.scores)) setScores(snapshot.scores);
    if (Array.isArray(snapshot.termSubjectRecords)) setTermSubjectRecords(snapshot.termSubjectRecords);
    if (Array.isArray(snapshot.termSummaries)) setTermSummaries(snapshot.termSummaries);
    if (Array.isArray(snapshot.auditLogs)) setAuditLogs(snapshot.auditLogs);
    if (Array.isArray(snapshot.commentBank)) setCommentBank(snapshot.commentBank);
    if (Array.isArray(snapshot.customReportTemplates)) setCustomReportTemplates(snapshot.customReportTemplates);
    setSessionArchives([]);
    if (Array.isArray(snapshot.promotionLogs)) setPromotionLogs(snapshot.promotionLogs);
    if (Array.isArray(snapshot.officeMessages)) setOfficeMessages(snapshot.officeMessages);
    if (Array.isArray(snapshot.requiredDocumentSlots)) setRequiredDocumentSlots(snapshot.requiredDocumentSlots);
    if (Array.isArray(snapshot.teacherDocumentUploads)) setTeacherDocumentUploads(snapshot.teacherDocumentUploads);
    if (Array.isArray(snapshot.studentTestimonials)) setStudentTestimonials(snapshot.studentTestimonials);
    if (Array.isArray(snapshot.academicDepartments)) setAcademicDepartments(snapshot.academicDepartments);
    if (Array.isArray(snapshot.gradingScalePresets)) setGradingScalePresets(snapshot.gradingScalePresets);
  }, []);

  const persistOfflineSnapshot = useCallback(async (snapshot: FullDatabaseSnapshot) => {
    const now = new Date().toISOString();
    const queuedSnapshot = omitSessionArchives(snapshot) as FullDatabaseSnapshot;
    const baseSnapshot = omitSessionArchives(
      backendBaseSnapshotRef.current || queuedSnapshot
    ) as FullDatabaseSnapshot;
    const updatedQueue = createPendingOfflineSnapshot(
      baseSnapshot,
      queuedSnapshot,
      backendRevisionRef.current,
      now,
      pendingOfflineSnapshotRef.current || undefined
    );
    const existingClientId = pendingOfflineSnapshotRef.current?.clientId;
    let clientId = existingClientId || localStorage.getItem('edugrade_offline_client_id_v1');
    if (!clientId) {
      clientId = createOfflineId();
      safeSetItem('edugrade_offline_client_id_v1', clientId);
    }
    const queue: PendingOfflineSnapshot<FullDatabaseSnapshot> = {
      ...updatedQueue,
      clientId,
      commitId: createOfflineId(),
      actorUsername: currentUser.username || ''
    };
    await savePendingOfflineSnapshot(queue);
    pendingOfflineSnapshotRef.current = queue;
    setPendingOfflineSnapshot(queue);
    setOfflineSyncMessage('Your changes are saved on this device and need an explicit commit to the database.');
    setBackendStatus(previous => ({
      ...previous,
      databaseConnected: typeof navigator === 'undefined' || navigator.onLine
        ? previous.databaseConnected
        : false,
      isSyncing: false,
      statusMessage: 'Changes are queued on this device and have not yet been committed to the database.'
    }));
    return queue;
  }, [currentUser.username]);
  persistOfflineSnapshotRef.current = persistOfflineSnapshot;

  // Load the server's canonical snapshot before allowing automatic writes. Without
  // this guard, the initial browser/seed state can overwrite records on refresh.
  useEffect(() => {
    let cancelled = false;

    const hydrateFromBackend = async () => {
      let queuedChanges: PendingOfflineSnapshot<FullDatabaseSnapshot> | undefined;
      try {
        queuedChanges = await loadPendingOfflineSnapshot<FullDatabaseSnapshot>();
        const queuedDocuments = await loadPendingOfflineDocuments<
          Omit<TeacherDocumentUpload, 'id' | 'uploadedAt' | 'status' | 'executiveRemarks'> & { id: string }
        >();
        if (queuedChanges) {
          const normalizedBase = omitSessionArchives(queuedChanges.baseSnapshot) as FullDatabaseSnapshot;
          const normalizedSnapshot = omitSessionArchives(queuedChanges.snapshot) as FullDatabaseSnapshot;
          const normalizedQueue = {
            ...createPendingOfflineSnapshot(
              normalizedBase,
              normalizedSnapshot,
              queuedChanges.baseRevision,
              queuedChanges.updatedAt
            ),
            clientId: queuedChanges.clientId,
            commitId: queuedChanges.commitId,
            actorUsername: queuedChanges.actorUsername,
            startedAt: queuedChanges.startedAt,
            updatedAt: queuedChanges.updatedAt
          };
          if (!Object.keys(normalizedQueue.changedAt).length && queuedDocuments.length === 0) {
            await clearPendingOfflineSnapshot();
            queuedChanges = undefined;
          } else {
            queuedChanges = normalizedQueue;
            await savePendingOfflineSnapshot(normalizedQueue);
          }
        }
        if (cancelled) return;
        pendingOfflineSnapshotRef.current = queuedChanges || null;
        setPendingOfflineSnapshot(queuedChanges || null);
        setPendingOfflineDocumentCount(queuedDocuments.length);

        const stateRes = await fetch('/api/state');
        const stateData = await stateRes.json();
        if (stateRes.status === 401) {
          try {
            window.sessionStorage.removeItem(STAFF_SESSION_STORAGE_KEY);
          } catch {
            // Continue with the signed-out state if browser storage is unavailable.
          }
          setIsStaffLoggedIn(false);
          setIsSecurityUnlocked(false);
          setCurrentUser(signedOutUser);
          setIsAuthModalOpen(true);
          setBackendStatus(previous => ({
            ...previous,
            nodeConnected: true,
            databaseConnected: false,
            storageMode: 'SUPABASE_LIVE',
            statusMessage: 'Sign in with your staff password to load protected Supabase records.'
          }));
          return;
        }
        if (!stateRes.ok || !stateData.ok) {
          throw new Error(stateData.error || 'Could not load persisted school records.');
        }

        const localSnapshot = getCurrentSnapshot();
        const persistedSnapshot = stateData.state
          ? omitSessionArchives(
              reconcileExecutiveStaffSnapshot(stateData.state as FullDatabaseSnapshot)
            ) as FullDatabaseSnapshot
          : localSnapshot;
        backendBaseSnapshotRef.current = persistedSnapshot;
        backendRevisionRef.current = stateData.stateRevision || null;
        const snapshot = persistedSnapshot || (
          queuedChanges
            ? reconcileExecutiveStaffSnapshot(queuedChanges.snapshot)
            : null
        );
        if (snapshot) applySnapshotToState(snapshot);

        const statusRes = await fetch('/api/db/status');
        const statusData = statusRes.ok ? await statusRes.json() : null;
        if (cancelled) return;
        const databaseConnected = Boolean(statusData?.databaseConnected ?? stateData.databaseConnected);

        setBackendStatus(prev => ({
          ...prev,
          nodeConnected: true,
          databaseConnected,
          storageMode: statusData?.storageMode || stateData.storageMode || 'LOCAL_NODE_FALLBACK',
          dbHost: statusData?.dbConfig?.host || prev.dbHost,
          dbPort: statusData?.dbConfig?.port || prev.dbPort,
          dbName: statusData?.dbConfig?.database || prev.dbName,
          dbUser: statusData?.dbConfig?.user || prev.dbUser,
          hasPassword: Boolean(statusData?.dbConfig?.hasPassword),
          nodeVersion: statusData?.nodeVersion || prev.nodeVersion,
          sqlDumpSizeKb: statusData?.sqlDumpFile?.sizeKb || prev.sqlDumpSizeKb,
          statusMessage: databaseConnected
            ? snapshot
              ? 'Loaded persisted student and score records from backend storage'
              : 'Connected to Supabase; no saved records found yet'
            : statusData?.errorMessage || stateData.errorMessage || 'Supabase is unavailable; using local storage'
        }));
        if (queuedChanges) {
          setOfflineSyncMessage(
            persistedSnapshot
              ? 'Showing the current database records. Pending offline changes remain queued until you review and commit them.'
              : 'Pending offline changes were restored from this device. Review before committing them.'
          );
        }
        setBackendHydrated(true);
      } catch (error) {
        if (cancelled) return;
        if (queuedChanges) {
          applySnapshotToState(reconcileExecutiveStaffSnapshot(queuedChanges.snapshot));
          pendingOfflineSnapshotRef.current = queuedChanges;
          setPendingOfflineSnapshot(queuedChanges);
          setOfflineSyncMessage('The database is unavailable. Your pending offline changes are preserved on this device.');
        } else {
          backendBaseSnapshotRef.current = getCurrentSnapshot();
          backendRevisionRef.current = null;
        }
        setBackendHydrated(true);
        setBackendStatus(prev => ({
          ...prev,
          nodeConnected: false,
          databaseConnected: false,
          statusMessage: `Could not load persisted records; automatic database writes are paused to protect existing data. ${error instanceof Error ? error.message : String(error)}`
        }));
      }
    };

    void hydrateFromBackend();
    return () => {
      cancelled = true;
    };
  }, [applySnapshotToState]);

  const buildFullSystemStateSnapshot = useCallback((): SystemStateSnapshot => {
    return {
      schoolProfile,
      sessions,
      currentSessionId: currentSession?.id,
      terms,
      currentTermId: currentTerm?.id,
      classLevels,
      classSections,
      teachers,
      subjects,
      students,
      assessmentComponents,
      reportCardSubjectOrder,
      enrollments,
      scores,
      termSubjectRecords,
      termSummaries,
      includedTermsForAnnual,
      activeReportType,
      activeReportCardTemplateId,
      customReportTemplates,
      commentBank,
      gradingScalePresets,
      academicDepartments,
      officeMessages,
      requiredDocumentSlots,
      teacherDocumentUploads,
      studentTestimonials,
      sessionArchives,
      promotionLogs,
      auditLogs
    };
  }, [
    schoolProfile,
    sessions,
    currentSession,
    terms,
    currentTerm,
    classLevels,
    classSections,
    teachers,
    subjects,
    students,
    assessmentComponents,
    reportCardSubjectOrder,
    enrollments,
    scores,
    termSubjectRecords,
    termSummaries,
    includedTermsForAnnual,
    activeReportType,
    activeReportCardTemplateId,
    customReportTemplates,
    commentBank,
    gradingScalePresets,
    academicDepartments,
    officeMessages,
    requiredDocumentSlots,
    teacherDocumentUploads,
    studentTestimonials,
    sessionArchives,
    promotionLogs,
    auditLogs
  ]);

  // System Backups state (Super Admin Only)
  const [systemBackups, setSystemBackups] = useState<SystemBackupRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SYSTEM_BACKUPS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // ignore
      }
    }
    const baselineBackup = createSystemBackupRecord({
      id: 'bkp-initial-baseline',
      createdAt: '2026-10-30T08:00:00.000Z',
      createdBy: 'superadmin',
      label: 'Initial System Baseline Snapshot (All Settings, Files & Records)',
      payload: {
        schoolProfile: defaultSchoolProfile,
        sessions: initialSessions.map(s => ({ ...s, institutionName: defaultSchoolProfile.name })),
        currentSessionId: initialSessions[0]?.id || 1,
        terms: initialTerms,
        currentTermId: initialTerms[0]?.id || 1,
        classLevels: initialClassLevels,
        classSections: initialClassSections,
        teachers: initialTeachers,
        subjects: initialSubjects,
        students: initialStudents,
        assessmentComponents: initialAssessmentComponents,
        enrollments: initialEnrollments,
        scores: initialAssessmentScores,
        termSubjectRecords: initialTermSubjectRecords,
        termSummaries: initialTermSummaries,
        includedTermsForAnnual: [1, 2, 3],
        activeReportType: 'MID_TERM',
        activeReportCardTemplateId: 'STANDARD',
        customReportTemplates: initialCustomReportTemplates,
        commentBank: initialCommentBank,
        gradingScalePresets: DEFAULT_GRADING_SCALE_PRESETS,
        academicDepartments: DEFAULT_ACADEMIC_DEPARTMENTS,
        officeMessages: initialOfficeMessages,
        requiredDocumentSlots: initialRequiredDocSlots,
        teacherDocumentUploads: initialTeacherDocUploads,
        studentTestimonials: [],
        sessionArchives: [],
        promotionLogs: [],
        auditLogs: initialScoreAuditLogs
      }
    });
    return [baselineBackup];
  });

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SYSTEM_BACKUPS, JSON.stringify(systemBackups));
  }, [systemBackups]);

  // Load persisted server backups on mount
  useEffect(() => {
    fetch('/api/backups')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.ok && Array.isArray(data.backups) && data.backups.length > 0) {
          setSystemBackups(prev => {
            const byId = new Map<string, SystemBackupRecord>();
            for (const b of prev) byId.set(b.id, b);
            for (const b of data.backups) {
              if (b && b.id && b.payload) byId.set(b.id, b);
            }
            return Array.from(byId.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          });
        }
      })
      .catch(() => {});
  }, []);

  const createSystemBackup = useCallback(
    async (label?: string): Promise<{ ok: boolean; message: string; backup?: SystemBackupRecord }> => {
      if (!canAccessSystemBackup(currentRole)) {
        return {
          ok: false,
          message: 'Access Denied: Only the Super User (Super Admin) can create or manage system backups.'
        };
      }
      const snapshot = buildFullSystemStateSnapshot();
      const backup = createSystemBackupRecord({
        payload: snapshot,
        createdBy: currentUser.username || 'superadmin',
        label
      });

      setSystemBackups(prev => [backup, ...prev.filter(b => b.id !== backup.id)]);
      try {
        await fetch('/api/backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backup)
        });
      } catch {
        // Local state already updated
      }

      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return {
        ok: true,
        message: `System backup "${backup.label}" (${backup.fileName}) created at ${new Date(
          backup.createdAt
        ).toLocaleString()}.`,
        backup
      };
    },
    [currentRole, currentUser.username, buildFullSystemStateSnapshot]
  );

  const restoreSystemBackup = useCallback(
    async (backupOrId: string | SystemBackupRecord): Promise<{ ok: boolean; message: string }> => {
      if (!canAccessSystemBackup(currentRole)) {
        return {
          ok: false,
          message: 'Access Denied: Only the Super User (Super Admin) can restore system backups.'
        };
      }

      const targetBackup =
        typeof backupOrId === 'string'
          ? systemBackups.find(b => b.id === backupOrId)
          : backupOrId;

      if (!targetBackup || !targetBackup.payload) {
        return {
          ok: false,
          message: 'Selected backup record could not be found or has an empty payload.'
        };
      }

      const p = targetBackup.payload;
      if (p.schoolProfile) setSchoolProfile(p.schoolProfile);
      if (Array.isArray(p.sessions) && p.sessions.length > 0) {
        setSessions(p.sessions);
      }
      if (Array.isArray(p.terms) && p.terms.length > 0) {
        setTerms(p.terms);
        const restoredActiveTerm =
          p.terms.find(t => t.id === p.currentTermId || t.isActive) || p.terms[0];
        if (restoredActiveTerm) {
          setCurrentTermState(restoredActiveTerm);
        }
      }
      if (Array.isArray(p.classSections) && p.classSections.length > 0) {
        setClassSections(p.classSections);
        if (!p.classSections.some(s => s.id === selectedSectionId)) {
          setSelectedSectionId(p.classSections[0].id);
        }
      }
      if (Array.isArray(p.teachers)) setTeachers(p.teachers);
      if (Array.isArray(p.subjects) && p.subjects.length > 0) {
        setSubjects(p.subjects);
        if (!p.subjects.some(s => s.id === selectedSubjectId)) {
          setSelectedSubjectId(p.subjects[0].id);
        }
      }
      if (Array.isArray(p.students)) {
        setStudents(p.students);
        if (p.students.length > 0 && !p.students.some(st => st.id === selectedStudentId)) {
          setSelectedStudentId(p.students[0].id);
        }
      }
      if (Array.isArray(p.assessmentComponents)) setAssessmentComponents(p.assessmentComponents);
      if (p.reportCardSubjectOrder) {
        setReportCardSubjectOrder({
          JUNIOR: Array.isArray(p.reportCardSubjectOrder.JUNIOR) ? p.reportCardSubjectOrder.JUNIOR : [],
          SENIOR: Array.isArray(p.reportCardSubjectOrder.SENIOR) ? p.reportCardSubjectOrder.SENIOR : []
        });
      }
      if (Array.isArray(p.enrollments)) setEnrollments(p.enrollments);
      if (Array.isArray(p.scores)) setScores(p.scores);
      if (Array.isArray(p.termSubjectRecords)) setTermSubjectRecords(p.termSubjectRecords);
      if (Array.isArray(p.termSummaries)) setTermSummaries(p.termSummaries);
      if (Array.isArray(p.includedTermsForAnnual)) setIncludedTermsForAnnual(p.includedTermsForAnnual);
      if (p.activeReportType) setActiveReportType(p.activeReportType);
      if (p.activeReportCardTemplateId) setActiveReportCardTemplateId(p.activeReportCardTemplateId);
      if (Array.isArray(p.customReportTemplates)) setCustomReportTemplates(p.customReportTemplates);
      if (Array.isArray(p.commentBank)) setCommentBank(p.commentBank);
      if (Array.isArray(p.gradingScalePresets) && p.gradingScalePresets.length > 0) {
        setGradingScalePresets(p.gradingScalePresets);
      }
      if (Array.isArray(p.academicDepartments) && p.academicDepartments.length > 0) {
        setAcademicDepartments(p.academicDepartments);
      }
      if (Array.isArray(p.officeMessages)) setOfficeMessages(p.officeMessages);
      if (Array.isArray(p.requiredDocumentSlots)) setRequiredDocumentSlots(p.requiredDocumentSlots);
      if (Array.isArray(p.teacherDocumentUploads)) setTeacherDocumentUploads(p.teacherDocumentUploads);
      if (Array.isArray(p.studentTestimonials)) setStudentTestimonials(p.studentTestimonials);
      if (Array.isArray(p.sessionArchives)) setSessionArchives(p.sessionArchives);
      if (Array.isArray(p.promotionLogs)) setPromotionLogs(p.promotionLogs);
      if (Array.isArray(p.auditLogs)) setAuditLogs(p.auditLogs);

      setLastAutoSavedTime(new Date().toLocaleTimeString());
      return {
        ok: true,
        message: `System state successfully restored from "${targetBackup.label}" (${targetBackup.fileName}). Restored ${targetBackup.summary.studentsCount} students, ${targetBackup.summary.scoresCount} scores, ${targetBackup.summary.documentsCount} teacher files, and all institutional settings.`
      };
    },
    [currentRole, systemBackups, selectedSectionId, selectedSubjectId, selectedStudentId]
  );

  const importSystemBackupFile = useCallback(
    async (
      rawJson: string,
      restoreImmediately = false
    ): Promise<{ ok: boolean; message: string; backup?: SystemBackupRecord }> => {
      if (!canAccessSystemBackup(currentRole)) {
        return {
          ok: false,
          message: 'Access Denied: Only the Super User (Super Admin) can import or restore backup files.'
        };
      }

      const parsed = validateAndParseBackupFile(rawJson);
      if (!parsed.valid || !parsed.backup) {
        return {
          ok: false,
          message: parsed.error || 'Invalid backup file.'
        };
      }

      const importedBackup = parsed.backup;
      setSystemBackups(prev => [importedBackup, ...prev.filter(b => b.id !== importedBackup.id)]);

      try {
        await fetch('/api/backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(importedBackup)
        });
      } catch {
        // Local state already updated
      }

      if (restoreImmediately) {
        const restoreRes = await restoreSystemBackup(importedBackup);
        return {
          ok: restoreRes.ok,
          message: restoreRes.message,
          backup: importedBackup
        };
      }

      return {
        ok: true,
        message: `Imported backup file "${importedBackup.fileName}" into the backup repository. Click "Restore System" on this entry whenever you are ready to apply it.`,
        backup: importedBackup
      };
    },
    [currentRole, restoreSystemBackup]
  );

  const deleteSystemBackup = useCallback(
    async (backupId: string): Promise<void> => {
      if (!canAccessSystemBackup(currentRole)) return;
      setSystemBackups(prev => prev.filter(b => b.id !== backupId));
      try {
        await fetch(`/api/backups/${encodeURIComponent(backupId)}`, {
          method: 'DELETE'
        });
      } catch {
        // ignore
      }
    },
    [currentRole]
  );

  // Save directly to Supabase while available; the durable outbox is reserved for outages.
  const syncToBackend = useCallback(async (): Promise<{
    savedToDatabase: boolean;
    savedToNodeDisk: boolean;
    message: string;
  }> => {
    if (!backendHydrated) {
      return {
        savedToDatabase: false,
        savedToNodeDisk: false,
        message: 'Database save is waiting for persisted school records to finish loading.'
      };
    }
    const snapshot = omitSessionArchives(buildSnapshot()) as FullDatabaseSnapshot;
    if (pendingOfflineSnapshotRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      try {
        await persistOfflineSnapshot(snapshot);
        const message = 'Pending offline changes are saved on this device. Review and commit them to the database.';
        setOfflineSyncMessage(message);
        return { savedToDatabase: false, savedToNodeDisk: false, message };
      } catch (error) {
        const message = `Could not preserve pending changes in offline storage: ${error instanceof Error ? error.message : String(error)}`;
        setOfflineSyncMessage(message);
        setBackendStatus(previous => ({ ...previous, isSyncing: false, statusMessage: message }));
        return { savedToDatabase: false, savedToNodeDisk: false, message };
      }
    }
    setBackendStatus(prev => ({ ...prev, isSyncing: true }));
    let requestStarted = false;
    try {
      const body = await encodeJsonRequestBody({
        snapshot,
        stateRevision: backendRevisionRef.current
      });
      requestStarted = true;
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      if (res.ok) {
        const data = await res.json();
        const savedToDatabase = Boolean(data.savedToDatabase);
        const savedToNodeDisk = Boolean(data.savedToNodeDisk);
        const message = savedToDatabase
          ? 'Synced to Supabase PostgreSQL'
          : data.errorMessage || (savedToNodeDisk
              ? 'The database is unavailable; changes are saved locally and queued for commit'
              : 'Persistence failed; changes have not been saved to the server');
        if (savedToDatabase) {
          backendBaseSnapshotRef.current = snapshot;
          backendRevisionRef.current = data.stateRevision || null;
        }
        setBackendStatus(prev => ({
          ...prev,
          nodeConnected: true,
          databaseConnected: savedToDatabase && Boolean(data.databaseConnected),
          storageMode: data.storageMode || prev.storageMode,
          lastSyncedAt: savedToDatabase ? new Date().toLocaleTimeString() : prev.lastSyncedAt,
          isSyncing: false,
          statusMessage: message
        }));
        return {
          savedToDatabase,
          savedToNodeDisk,
          message
        };
      } else {
        const data = await res.json().catch(() => null);
        const message = data?.error || `Database sync failed (HTTP ${res.status})`;
        if (shouldQueueOfflineChanges(
          typeof navigator === 'undefined' || navigator.onLine,
          res.status
        )) {
          try {
            await persistOfflineSnapshot(snapshot);
          } catch (error) {
            setOfflineSyncMessage(
              `${message}. Offline queue failed: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        } else {
          setOfflineSyncMessage(`${message}. This was not queued as an offline change.`);
        }
        setBackendStatus(prev => ({
          ...prev,
          nodeConnected: true,
          databaseConnected: shouldQueueOfflineChanges(
            typeof navigator === 'undefined' || navigator.onLine,
            res.status
          ) ? false : prev.databaseConnected,
          isSyncing: false,
          statusMessage: message
        }));
        return {
          savedToDatabase: false,
          savedToNodeDisk: false,
          message
        };
      }
    } catch (error) {
      const message = `Database sync failed: ${error instanceof Error ? error.message : String(error)}`;
      const browserOnline = typeof navigator === 'undefined' || navigator.onLine;
      const isOfflineFailure = shouldQueueOfflineChanges(
        browserOnline,
        null,
        requestStarted ? error : undefined
      );
      if (isOfflineFailure) {
        try {
          await persistOfflineSnapshot(snapshot);
        } catch (queueError) {
          setOfflineSyncMessage(
            `${message}. Offline queue failed: ${queueError instanceof Error ? queueError.message : String(queueError)}`
          );
        }
      } else {
        setOfflineSyncMessage(`${message}. This was not queued as an offline change.`);
      }
      setBackendStatus(prev => ({
        ...prev,
        nodeConnected: isOfflineFailure ? false : prev.nodeConnected,
        databaseConnected: isOfflineFailure ? false : prev.databaseConnected,
        isSyncing: false,
        statusMessage: message
      }));
      return {
        savedToDatabase: false,
        savedToNodeDisk: false,
        message
      };
    }
  }, [backendHydrated, buildSnapshot, persistOfflineSnapshot]);

  const commitOfflineChanges = useCallback(async (
    resolutions: Record<string, OfflineConflictResolution> = {}
  ): Promise<{ ok: boolean; message: string; conflicts?: OfflineConflict[] }> => {
    const queue = pendingOfflineSnapshotRef.current;
    if (!queue) {
      return { ok: false, message: 'There are no pending offline changes to commit.' };
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const message = 'Reconnect to the internet or school network before committing offline changes.';
      setOfflineSyncMessage(message);
      return { ok: false, message };
    }
    if (!backendStatus.databaseConnected) {
      const message = 'Supabase is not confirmed reachable yet. Pending changes remain saved on this device.';
      setOfflineSyncMessage(message);
      return { ok: false, message };
    }

    setBackendStatus(previous => ({ ...previous, isSyncing: true }));
    let databaseUnavailable = false;
    try {
      const localClientId = queue.clientId || localStorage.getItem('edugrade_offline_client_id_v1') || createOfflineId();
      safeSetItem('edugrade_offline_client_id_v1', localClientId);
      let queueToCommit: PendingOfflineSnapshot<FullDatabaseSnapshot> = {
        ...queue,
        clientId: localClientId,
        commitId: queue.commitId || createOfflineId(),
        actorUsername: queue.actorUsername || currentUser.username || ''
      };
      if (queueToCommit !== queue) {
        await savePendingOfflineSnapshot(queueToCommit);
        pendingOfflineSnapshotRef.current = queueToCommit;
        setPendingOfflineSnapshot(queueToCommit);
      }
      const stagedDocuments = await loadPendingOfflineDocuments<
        Omit<TeacherDocumentUpload, 'id' | 'uploadedAt' | 'status' | 'executiveRemarks'> & { id: string }
      >();
      const documentDeletes: string[] = [];
      let snapshotToCommit = queue.snapshot;

      for (const staged of stagedDocuments) {
        if (staged.action === 'DELETE') {
          documentDeletes.push(staged.fileName);
          continue;
        }
        if (!staged.file) {
          throw new Error(`The queued file "${staged.fileName}" is missing from offline storage.`);
        }
        const queuedFile = new File([staged.file], staged.fileName, {
          type: staged.mimeType || staged.file.type || 'application/octet-stream'
        });
        const uploadResult = await uploadDocumentToCloud(queuedFile, staged.id, staged.fileName);
        const uploadedFileName = typeof uploadResult.fileName === 'string' ? uploadResult.fileName : '';
        const uploadedFileStoragePath =
          typeof uploadResult.fileStoragePath === 'string' ? uploadResult.fileStoragePath : '';
        if (!uploadedFileName || !uploadedFileStoragePath) {
          throw new Error(`The server response for "${staged.fileName}" is missing its saved file location.`);
        }

        snapshotToCommit = {
          ...snapshotToCommit,
          teacherDocumentUploads: (snapshotToCommit.teacherDocumentUploads || []).map(document =>
            document.id === staged.id
              ? {
                  ...document,
                  fileName: uploadedFileName,
                  fileSizeKb: uploadResult.fileSizeKb || document.fileSizeKb,
                  fileStoragePath: uploadedFileStoragePath
                }
              : document
          )
        };
        queueToCommit = {
          ...queueToCommit,
          snapshot: snapshotToCommit,
          updatedAt: new Date().toISOString()
        };
        await savePendingOfflineSnapshot(queueToCommit);
        pendingOfflineSnapshotRef.current = queueToCommit;
        setPendingOfflineSnapshot(queueToCommit);
      }

      const response = await fetchOfflineCommitWithRetry('/api/state/offline-commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Client-Id': localClientId,
          'X-Offline-Commit-Id': queueToCommit.commitId || ''
        },
        body: await encodeJsonRequestBody({
          queue: queueToCommit,
          clientId: localClientId,
          commitId: queueToCommit.commitId,
          actorUsername: queueToCommit.actorUsername,
          resolutions,
          documentDeletes
        })
      });
      databaseUnavailable = shouldQueueOfflineChanges(
        typeof navigator === 'undefined' || navigator.onLine,
        response.status
      );
      const result = await readJsonResponse<{
        ok?: boolean;
        error?: string;
        state?: FullDatabaseSnapshot;
        savedToNodeDisk?: boolean;
        savedToDatabase?: boolean;
        stateRevision?: string | null;
        conflicts?: OfflineConflict[];
        message?: string;
      }>(response);
      if (response.status === 409 && Array.isArray(result.conflicts)) {
        setOfflineConflicts(result.conflicts);
        const message = 'Some offline changes conflict with newer database values. Choose which value to keep for each conflict.';
        setOfflineSyncMessage(message);
        setBackendStatus(previous => ({ ...previous, isSyncing: false, statusMessage: message }));
        return { ok: false, message, conflicts: result.conflicts };
      }
      if (!response.ok || !result.ok || !result.state) {
        throw new Error(result.error || 'Could not commit pending changes to the database.');
      }

      const committedSnapshot = reconcileExecutiveStaffSnapshot(result.state as FullDatabaseSnapshot);
      backendBaseSnapshotRef.current = committedSnapshot;
      backendRevisionRef.current = result.stateRevision || null;
      const clearedPendingSnapshot = await clearPendingOfflineSnapshotIfMatches(queueToCommit.commitId || '');
      for (const staged of stagedDocuments) {
        await removePendingOfflineDocument(staged.id);
      }
      const remainingQueue = clearedPendingSnapshot
        ? undefined
        : await loadPendingOfflineSnapshot<FullDatabaseSnapshot>();
      if (remainingQueue) {
        const now = new Date().toISOString();
        const rebasedQueue = {
          ...createPendingOfflineSnapshot(
            committedSnapshot,
            remainingQueue.snapshot,
            result.stateRevision || null,
            now
          ),
          clientId: remainingQueue.clientId || localClientId,
          commitId: createOfflineId(),
          actorUsername: remainingQueue.actorUsername || currentUser.username || ''
        };
        await savePendingOfflineSnapshot(rebasedQueue);
        pendingOfflineSnapshotRef.current = rebasedQueue;
        setPendingOfflineSnapshot(rebasedQueue);
        setOfflineSyncMessage('Committed changes were saved to Supabase. Newer edits remain queued for a later commit.');
      } else {
        applySnapshotToState(committedSnapshot);
        pendingOfflineSnapshotRef.current = null;
        setPendingOfflineSnapshot(null);
      }
      const remainingDocuments = await loadPendingOfflineDocuments();
      setPendingOfflineDocumentCount(remainingDocuments.length);
      setOfflineConflicts([]);
      const message = remainingQueue
        ? 'Committed changes were saved to Supabase. Newer edits remain queued for a later commit.'
        : result.savedToDatabase
        ? 'Offline changes and queued documents were committed to Supabase and storage.'
        : 'Offline changes were not confirmed saved to Supabase.';
      setOfflineSyncMessage(message);
      setBackendStatus(previous => ({
        ...previous,
        nodeConnected: true,
        databaseConnected: Boolean(result.savedToDatabase),
        isSyncing: false,
        lastSyncedAt: result.savedToDatabase ? new Date().toLocaleTimeString() : previous.lastSyncedAt,
        statusMessage: message
      }));
      return { ok: true, message };
    } catch (error) {
      const message = `Offline changes were not committed: ${error instanceof Error ? error.message : String(error)}`;
      setOfflineSyncMessage(message);
      databaseUnavailable = databaseUnavailable || !(
        typeof navigator === 'undefined' || navigator.onLine
      ) || error instanceof TypeError;
      setBackendStatus(previous => ({
        ...previous,
        databaseConnected: databaseUnavailable ? false : previous.databaseConnected,
        isSyncing: false,
        statusMessage: message
      }));
      return { ok: false, message };
    }
  }, [applySnapshotToState, backendStatus.databaseConnected, currentUser.username]);

  // Initialize MySQL schema & seed all relational tables
  const initializeMysqlDatabase = useCallback(async (): Promise<{ ok: boolean; message: string; tablesCount?: number }> => {
    if (!backendHydrated) {
      return {
        ok: false,
        message: 'Database setup is waiting for saved school records to finish loading. Please retry in a moment.'
      };
    }

    const snapshot = buildSnapshot();
    setBackendStatus(prev => ({ ...prev, isSyncing: true }));
    try {
      const res = await fetch('/api/db/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await encodeJsonRequestBody({
          snapshot,
          stateRevision: backendRevisionRef.current
        })
      });
      const data = await res.json();
      const canonicalSnapshot = data.state as FullDatabaseSnapshot | null;
      if (canonicalSnapshot) {
        if (canonicalSnapshot.schoolProfile) setSchoolProfile(canonicalSnapshot.schoolProfile);
        if (Array.isArray(canonicalSnapshot.sessions)) setSessions(canonicalSnapshot.sessions);
        if (Array.isArray(canonicalSnapshot.terms)) {
          setTerms(canonicalSnapshot.terms);
          const activeTerm =
            canonicalSnapshot.terms.find(term => term.isActive) || canonicalSnapshot.terms[0];
          if (activeTerm) setCurrentTermState(activeTerm);
        }
        if (Array.isArray(canonicalSnapshot.classSections)) setClassSections(canonicalSnapshot.classSections);
        if (Array.isArray(canonicalSnapshot.teachers)) setTeachers(canonicalSnapshot.teachers);
        if (Array.isArray(canonicalSnapshot.subjects)) setSubjects(canonicalSnapshot.subjects);
        if (Array.isArray(canonicalSnapshot.students)) setStudents(canonicalSnapshot.students);
        if (Array.isArray(canonicalSnapshot.assessmentComponents)) {
          setAssessmentComponents(canonicalSnapshot.assessmentComponents);
        }
        if (canonicalSnapshot.reportCardSubjectOrder) {
          setReportCardSubjectOrder({
            JUNIOR: Array.isArray(canonicalSnapshot.reportCardSubjectOrder.JUNIOR)
              ? canonicalSnapshot.reportCardSubjectOrder.JUNIOR
              : [],
            SENIOR: Array.isArray(canonicalSnapshot.reportCardSubjectOrder.SENIOR)
              ? canonicalSnapshot.reportCardSubjectOrder.SENIOR
              : []
          });
        }
        if (Array.isArray(canonicalSnapshot.enrollments)) setEnrollments(canonicalSnapshot.enrollments);
        if (Array.isArray(canonicalSnapshot.scores)) setScores(canonicalSnapshot.scores);
        if (Array.isArray(canonicalSnapshot.termSubjectRecords)) {
          setTermSubjectRecords(canonicalSnapshot.termSubjectRecords);
        }
        if (Array.isArray(canonicalSnapshot.termSummaries)) setTermSummaries(canonicalSnapshot.termSummaries);
        if (Array.isArray(canonicalSnapshot.auditLogs)) setAuditLogs(canonicalSnapshot.auditLogs);
        if (Array.isArray(canonicalSnapshot.commentBank)) setCommentBank(canonicalSnapshot.commentBank);
        if (Array.isArray(canonicalSnapshot.customReportTemplates)) {
          setCustomReportTemplates(canonicalSnapshot.customReportTemplates);
        }
        if (Array.isArray(canonicalSnapshot.sessionArchives)) setSessionArchives(canonicalSnapshot.sessionArchives);
        if (Array.isArray(canonicalSnapshot.promotionLogs)) setPromotionLogs(canonicalSnapshot.promotionLogs);
        if (Array.isArray(canonicalSnapshot.officeMessages)) setOfficeMessages(canonicalSnapshot.officeMessages);
        if (Array.isArray(canonicalSnapshot.requiredDocumentSlots)) {
          setRequiredDocumentSlots(canonicalSnapshot.requiredDocumentSlots);
        }
        if (Array.isArray(canonicalSnapshot.teacherDocumentUploads)) {
          setTeacherDocumentUploads(canonicalSnapshot.teacherDocumentUploads);
        }
        if (Array.isArray(canonicalSnapshot.studentTestimonials)) {
          setStudentTestimonials(canonicalSnapshot.studentTestimonials);
        }
        if (Array.isArray(canonicalSnapshot.academicDepartments)) {
          setAcademicDepartments(canonicalSnapshot.academicDepartments);
        }
        if (Array.isArray(canonicalSnapshot.gradingScalePresets)) {
          setGradingScalePresets(canonicalSnapshot.gradingScalePresets);
        }
      }
      const statusRes = await fetch('/api/db/status');
      const statusData = statusRes.ok ? await statusRes.json() : null;

      setBackendStatus(prev => ({
        ...prev,
        nodeConnected: true,
        databaseConnected: Boolean(data.databaseConnected && data.savedToDatabase),
        storageMode: data.storageMode || 'LOCAL_NODE_FALLBACK',
        dbHost: statusData?.dbConfig?.host || prev.dbHost,
        dbPort: statusData?.dbConfig?.port || prev.dbPort,
        dbName: statusData?.dbConfig?.database || prev.dbName,
        dbUser: statusData?.dbConfig?.user || prev.dbUser,
        hasPassword: Boolean(statusData?.dbConfig?.hasPassword),
        nodeVersion: statusData?.nodeVersion || prev.nodeVersion,
        sqlDumpSizeKb: statusData?.sqlDumpFile?.sizeKb || prev.sqlDumpSizeKb,
        lastSyncedAt: data.savedToDatabase ? new Date().toLocaleTimeString() : prev.lastSyncedAt,
        isSyncing: false,
        statusMessage: data.savedToDatabase
          ? data.message
          : data.errorMessage || statusData?.errorMessage || data.message
      }));

      return {
        ok: Boolean(data.databaseConnected && data.savedToDatabase),
        message: data.savedToDatabase
          ? data.message
          : data.errorMessage || statusData?.errorMessage || data.message,
        tablesCount: Array.isArray(data.tablesVerified) ? data.tablesVerified.length : undefined
      };
    } catch (err: any) {
      setBackendStatus(prev => ({ ...prev, isSyncing: false }));
      return {
        ok: false,
        message: err?.message || 'Could not reach Node.js backend server'
      };
    }
  }, [backendHydrated, buildSnapshot]);

  // Update MySQL connection settings (including Empty / No Password mode)
  const updateMysqlConfig = useCallback(
    async (config: {
      host: string;
      port: number;
      user: string;
      password: string;
      emptyPassword: boolean;
      database: string;
    }): Promise<{ ok: boolean; message: string }> => {
      setBackendStatus(prev => ({ ...prev, isSyncing: true }));
      try {
        const res = await fetch('/api/db/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setBackendStatus(prev => ({ ...prev, isSyncing: false }));
          return { ok: false, message: data.error || 'Failed to update MySQL config' };
        }
        await syncToBackend();
        setBackendStatus(prev => ({
          ...prev,
          dbHost: data.dbConfig?.host || config.host,
          dbPort: data.dbConfig?.port || config.port,
          dbUser: data.dbConfig?.user || config.user,
          hasPassword: Boolean(data.dbConfig?.hasPassword),
          dbName: data.dbConfig?.database || config.database,
          isSyncing: false,
          statusMessage: data.message
        }));
        return { ok: true, message: data.message };
      } catch (err: any) {
        setBackendStatus(prev => ({ ...prev, isSyncing: false }));
        return { ok: false, message: err?.message || 'Failed to update MySQL connection config' };
      }
    },
    [syncToBackend]
  );

  // Download complete `.sql` dump for phpMyAdmin Import
  const downloadPhpMyAdminSql = useCallback(() => {
    const snapshot = buildSnapshot();
    const sqlContent = generatePhpMyAdminSqlDump(snapshot, backendStatus.dbName || 'edugrade_db');
    const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${backendStatus.dbName || 'edugrade_db'}_phpmyadmin.sql`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [buildSnapshot, backendStatus.dbName]);

  // Debounced auto-sync to Node.js + MySQL backend whenever data changes
  useEffect(() => {
    if (!backendHydrated) return;
    const timer = setTimeout(() => {
      syncToBackend();
    }, 650);
    return () => clearTimeout(timer);
  }, [backendHydrated, syncToBackend]);

  return (
    <AppContext.Provider
      value={{
        schoolProfile,
        updateSchoolProfile,
        sessions,
        currentSession,
        updateSessionName,
        createAcademicSession,
        selectActiveSession,
        sessionArchives,
        promotionLogs,
        transferStudentsBetweenClasses,
        promoteStudentsToDestinationClass,
        terms,
        currentTerm,
        setCurrentTerm,
        updateTermName,
        currentUser,
        setCurrentUser,
        currentRole,
        setCurrentRole,
        classLevels,
        classSections,
        selectedSectionId,
        setSelectedSectionId,
        currentSection,
        addClassSection,
        updateClassSection,
        deleteClassSection,
        teachers,
        addTeacher,
        updateTeacher,
        updateTeacherCredentials,
        deleteTeacher,
        assignFormTutor,
        assignSubjectToTeacher,
        removeSubjectFromTeacher,
        getAssignedTeacherForSubject,
        completeTeacherPasswordSetup,
        requestPasswordResetForUsername,
        approveTeacherPasswordReset,
        subjects,
        selectedSubjectId,
        setSelectedSubjectId,
        addSubject,
        updateSubject,
        deleteSubject,
        students,
        selectedStudentId,
        setSelectedStudentId,
        currentStudent,
        addStudent,
        updateStudent,
        deleteStudent,
        assessmentComponents,
        updateAssessmentComponent,
        addAssessmentComponent,
        deleteAssessmentComponent,
        reportCardSubjectOrder,
        updateReportCardSubjectOrder,
        customReportTemplates,
        saveCustomReportTemplate,
        deleteCustomReportTemplate,
        activeReportCardTemplateId,
        setActiveReportCardTemplateId,
        toggleCustomReportInReportTab,
        updateStudentCustomReportScore,
        officeMessages,
        sendOfficeMessage,
        markOfficeMessageAsRead,
        deleteOfficeMessage,
        academicDepartments,
        saveAcademicDepartment,
        deleteAcademicDepartment,
        requiredDocumentSlots,
        createRequiredDocumentSlot,
        deleteRequiredDocumentSlot,
        teacherDocumentUploads,
        uploadTeacherDocument,
        queueOfflineDocumentUpload,
        addExecutiveRemarkToDocument,
        deleteTeacherDocument,
        studentTestimonials,
        updateStudentTestimonial,
        enrollments,
        scores,
        termSummaries,
        termSubjectRecords,
        lastAutoSavedTime,
        updateScore,
        updateTermSubjectScore,
        toggleSubjectInclusion,
        includedTermsForAnnual,
        toggleAnnualTermInclusion,
        getStudentAnnualSummary,
        activeReportType,
        setActiveReportType,
        commentBank,
        addCommentBankItem,
        updateCommentBankItem,
        deleteCommentBankItem,
        updateRemarks,
        auditLogs,
        gradingScales,
        gradingScalePresets,
        saveGradingScalePreset,
        enableGradingScalePresetForReports,
        deleteGradingScalePreset,
        resetDefaultGradingScales,
        oldSheets,
        isStaffLoggedIn,
        isSecurityUnlocked,
        welcomeNotification,
        dismissWelcomeNotification,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        completeStaffLogin,
        unlockSecurity,
        lockSecurity,
        publishReportCards,
        systemBackups,
        createSystemBackup,
        restoreSystemBackup,
        importSystemBackupFile,
        deleteSystemBackup,
        backendStatus,
        isOnline,
        pendingOfflineSnapshot,
        pendingOfflineDocumentCount,
        offlineConflicts,
        offlineSyncMessage,
        commitOfflineChanges,
        syncToBackend,
        initializeMysqlDatabase,
        updateMysqlConfig,
        downloadPhpMyAdminSql
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
