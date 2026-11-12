/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SchoolProfile,
  AcademicSession,
  Term,
  ClassLevel,
  ClassSection,
  Teacher,
  Subject,
  Student,
  AssessmentComponent,
  StudentSubjectEnrollment,
  AssessmentScore,
  TermSubjectRecord,
  StudentTermSummary,
  ScoreAuditLog,
  CommentBankItem,
  CustomReportTemplate,
  AcademicSessionArchive,
  StudentPromotionRecord,
  OfficeMessage,
  RequiredDocumentSlot,
  TeacherDocumentUpload,
  StudentTestimonial,
  AcademicDepartment,
  GradingScalePreset,
  ReportType,
  ReportCardSubjectOrder
} from '../types/index';

export interface SystemStateSnapshot {
  schoolProfile: SchoolProfile;
  sessions: AcademicSession[];
  currentSessionId?: number;
  terms: Term[];
  currentTermId?: number;
  classLevels?: ClassLevel[];
  classSections: ClassSection[];
  teachers: Teacher[];
  subjects: Subject[];
  students: Student[];
  assessmentComponents: AssessmentComponent[];
  enrollments: StudentSubjectEnrollment[];
  scores: AssessmentScore[];
  termSubjectRecords: TermSubjectRecord[];
  termSummaries: StudentTermSummary[];
  includedTermsForAnnual?: number[];
  activeReportType?: ReportType;
  activeReportCardTemplateId?: string;
  customReportTemplates: CustomReportTemplate[];
  commentBank: CommentBankItem[];
  gradingScalePresets?: GradingScalePreset[];
  reportCardSubjectOrder?: ReportCardSubjectOrder;
  academicDepartments?: AcademicDepartment[];
  officeMessages?: OfficeMessage[];
  requiredDocumentSlots?: RequiredDocumentSlot[];
  teacherDocumentUploads?: TeacherDocumentUpload[];
  studentTestimonials?: StudentTestimonial[];
  sessionArchives: AcademicSessionArchive[];
  promotionLogs: StudentPromotionRecord[];
  auditLogs: ScoreAuditLog[];
}

export interface SystemBackupSummary {
  studentsCount: number;
  teachersCount: number;
  classesCount: number;
  subjectsCount: number;
  scoresCount: number;
  termRecordsCount: number;
  documentsCount: number;
  customTemplatesCount: number;
  departmentsCount: number;
  sessionsCount: number;
  gradingPresetsCount: number;
}

export interface SystemBackupRecord {
  id: string;
  fileName: string;
  label: string;
  createdAt: string;
  createdBy: string;
  appVersion: string;
  institutionName: string;
  activeSessionName: string;
  activeTermName: string;
  sizeBytes: number;
  summary: SystemBackupSummary;
  payload: SystemStateSnapshot;
}

export const SYSTEM_BACKUP_FORMAT_VERSION = '2026.2.0';

/**
 * Computes summary counts from a SystemStateSnapshot.
 */
export function computeBackupSummary(payload: Partial<SystemStateSnapshot>): SystemBackupSummary {
  return {
    studentsCount: Array.isArray(payload.students) ? payload.students.length : 0,
    teachersCount: Array.isArray(payload.teachers) ? payload.teachers.length : 0,
    classesCount: Array.isArray(payload.classSections) ? payload.classSections.length : 0,
    subjectsCount: Array.isArray(payload.subjects) ? payload.subjects.length : 0,
    scoresCount: Array.isArray(payload.scores) ? payload.scores.length : 0,
    termRecordsCount: Array.isArray(payload.termSubjectRecords) ? payload.termSubjectRecords.length : 0,
    documentsCount: Array.isArray(payload.teacherDocumentUploads) ? payload.teacherDocumentUploads.length : 0,
    customTemplatesCount: Array.isArray(payload.customReportTemplates) ? payload.customReportTemplates.length : 0,
    departmentsCount: Array.isArray(payload.academicDepartments) ? payload.academicDepartments.length : 0,
    sessionsCount: Array.isArray(payload.sessions) ? payload.sessions.length : 0,
    gradingPresetsCount: Array.isArray(payload.gradingScalePresets) ? payload.gradingScalePresets.length : 0
  };
}

/**
 * Generates a clean, filesystem-safe filename for a system backup with timestamp.
 */
export function generateBackupFileName(institutionName: string, createdAtIso: string, label?: string): string {
  const safeInst = (institutionName || 'EduGrade')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const safeLabel = (label || 'Full_Backup')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  const stamp = createdAtIso
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '')
    .slice(0, 19);
  return `${safeInst}_${safeLabel}_${stamp}.ebkp.json`;
}

/**
 * Creates a complete SystemBackupRecord encapsulating all settings, files, student info, scores, and software state.
 */
export function createSystemBackupRecord(params: {
  payload: SystemStateSnapshot;
  createdBy: string;
  label?: string;
  id?: string;
  createdAt?: string;
}): SystemBackupRecord {
  const createdAt = params.createdAt || new Date().toISOString();
  const id = params.id || `bkp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const institutionName = params.payload.schoolProfile?.name || 'Sample School';
  const activeSession =
    params.payload.sessions?.find(s => s.id === params.payload.currentSessionId || s.isCurrent)?.name ||
    params.payload.schoolProfile?.currentSession ||
    '2025/2026';
  const activeTerm =
    params.payload.terms?.find(t => t.id === params.payload.currentTermId || t.isActive)?.name ||
    params.payload.schoolProfile?.currentTerm ||
    'FIRST';
  const resolvedLabel = (params.label || '').trim() || `Full System Backup (${activeSession} • ${activeTerm} Term)`;
  const fileName = generateBackupFileName(institutionName, createdAt, resolvedLabel);
  const summary = computeBackupSummary(params.payload);
  const serialized = JSON.stringify(params.payload);
  const sizeBytes = new TextEncoder().encode(serialized).length;

  return {
    id,
    fileName,
    label: resolvedLabel,
    createdAt,
    createdBy: params.createdBy || 'superadmin',
    appVersion: SYSTEM_BACKUP_FORMAT_VERSION,
    institutionName,
    activeSessionName: activeSession,
    activeTermName: activeTerm,
    sizeBytes,
    summary,
    payload: params.payload
  };
}

/**
 * Validates and parses an uploaded or stored backup JSON string or object.
 * Accepts either a full `SystemBackupRecord` (with `.payload`) or a direct `SystemStateSnapshot` object.
 */
export function validateAndParseBackupFile(rawInput: string | Record<string, any>): {
  valid: boolean;
  error?: string;
  backup?: SystemBackupRecord;
} {
  try {
    const parsed: any = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Backup file is not a valid JSON object.' };
    }

    const candidatePayload: Partial<SystemStateSnapshot> =
      parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : parsed;

    if (
      !candidatePayload.schoolProfile ||
      typeof candidatePayload.schoolProfile !== 'object' ||
      !Array.isArray(candidatePayload.classSections) ||
      !Array.isArray(candidatePayload.subjects) ||
      !Array.isArray(candidatePayload.students)
    ) {
      return {
        valid: false,
        error:
          'Invalid backup structure: missing core state collections (schoolProfile, classSections, subjects, or students).'
      };
    }

    const normalizedPayload: SystemStateSnapshot = {
      schoolProfile: candidatePayload.schoolProfile,
      sessions: Array.isArray(candidatePayload.sessions) ? candidatePayload.sessions : [],
      currentSessionId: candidatePayload.currentSessionId,
      terms: Array.isArray(candidatePayload.terms) ? candidatePayload.terms : [],
      currentTermId: candidatePayload.currentTermId,
      classLevels: Array.isArray(candidatePayload.classLevels) ? candidatePayload.classLevels : undefined,
      classSections: candidatePayload.classSections,
      teachers: Array.isArray(candidatePayload.teachers) ? candidatePayload.teachers : [],
      subjects: candidatePayload.subjects,
      students: candidatePayload.students,
      assessmentComponents: Array.isArray(candidatePayload.assessmentComponents)
        ? candidatePayload.assessmentComponents
        : [],
      enrollments: Array.isArray(candidatePayload.enrollments) ? candidatePayload.enrollments : [],
      scores: Array.isArray(candidatePayload.scores) ? candidatePayload.scores : [],
      termSubjectRecords: Array.isArray(candidatePayload.termSubjectRecords)
        ? candidatePayload.termSubjectRecords
        : [],
      termSummaries: Array.isArray(candidatePayload.termSummaries) ? candidatePayload.termSummaries : [],
      includedTermsForAnnual: Array.isArray(candidatePayload.includedTermsForAnnual)
        ? candidatePayload.includedTermsForAnnual
        : [1, 2, 3],
      activeReportType: candidatePayload.activeReportType || 'MID_TERM',
      activeReportCardTemplateId: candidatePayload.activeReportCardTemplateId || 'STANDARD',
      customReportTemplates: Array.isArray(candidatePayload.customReportTemplates)
        ? candidatePayload.customReportTemplates
        : [],
      commentBank: Array.isArray(candidatePayload.commentBank) ? candidatePayload.commentBank : [],
      gradingScalePresets: Array.isArray(candidatePayload.gradingScalePresets)
        ? candidatePayload.gradingScalePresets
        : [],
      reportCardSubjectOrder:
        candidatePayload.reportCardSubjectOrder &&
        Array.isArray(candidatePayload.reportCardSubjectOrder.JUNIOR) &&
        Array.isArray(candidatePayload.reportCardSubjectOrder.SENIOR)
          ? candidatePayload.reportCardSubjectOrder
          : { JUNIOR: [], SENIOR: [] },
      academicDepartments: Array.isArray(candidatePayload.academicDepartments)
        ? candidatePayload.academicDepartments
        : [],
      officeMessages: Array.isArray(candidatePayload.officeMessages) ? candidatePayload.officeMessages : [],
      requiredDocumentSlots: Array.isArray(candidatePayload.requiredDocumentSlots)
        ? candidatePayload.requiredDocumentSlots
        : [],
      teacherDocumentUploads: Array.isArray(candidatePayload.teacherDocumentUploads)
        ? candidatePayload.teacherDocumentUploads
        : [],
      studentTestimonials: Array.isArray(candidatePayload.studentTestimonials)
        ? candidatePayload.studentTestimonials
        : [],
      sessionArchives: Array.isArray(candidatePayload.sessionArchives) ? candidatePayload.sessionArchives : [],
      promotionLogs: Array.isArray(candidatePayload.promotionLogs) ? candidatePayload.promotionLogs : [],
      auditLogs: Array.isArray(candidatePayload.auditLogs) ? candidatePayload.auditLogs : []
    };

    const backup = createSystemBackupRecord({
      payload: normalizedPayload,
      createdBy: parsed.createdBy || 'superadmin',
      label: parsed.label || 'Imported System Backup',
      id: parsed.id || `bkp-imp-${Date.now()}`,
      createdAt: parsed.createdAt || new Date().toISOString()
    });

    if (parsed.fileName && typeof parsed.fileName === 'string') {
      backup.fileName = parsed.fileName;
    }

    return { valid: true, backup };
  } catch (err: any) {
    return {
      valid: false,
      error: err?.message || 'Failed to parse backup JSON file.'
    };
  }
}

/**
 * Formats an ISO timestamp into a clear human-readable date & time string.
 */
export function formatBackupTimestamp(isoString: string): string {
  if (!isoString) return 'Unknown Timestamp';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
}

/**
 * Formats byte size into KB / MB for display.
 */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
