/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole =
  | 'SUPER_ADMIN'
  | 'PRINCIPAL'
  | 'HEAD_OF_SCHOOLS'
  | 'VICE_PRINCIPAL'
  | 'CLASS_TEACHER'
  | 'SUBJECT_TEACHER';

export type TermName = 'FIRST' | 'SECOND' | 'THIRD';

export type SubjectCategory = 'CORE' | 'OPTIONAL';

export type RemarkType = 'PRINCIPAL' | 'TEACHER';

export type LevelType = 'JUNIOR' | 'SENIOR';

export type ReportType = 'MID_TERM' | 'EXAM_TERM' | 'ANNUAL';

export type ReportCardSubjectOrder = Record<LevelType, number[]>;

export const DEFAULT_REPORT_CARD_SUBJECT_ORDER: ReportCardSubjectOrder = {
  JUNIOR: [],
  SENIOR: []
};

export interface SchoolProfile {
  name: string; // e.g. "Sample School (Secondary Section)"
  motto?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string; // Path to institutional crest
  principalName?: string;
  formTeacherName?: string;
  reportDate: string; // e.g. "27/10/2026"
  currentSession: string; // e.g. "2026/27"
  currentTerm: TermName; // e.g. "FIRST"
}

export interface AcademicSession {
  id: number;
  name: string; // e.g., '2026/27'
  isCurrent: boolean;
  institutionName?: string; // Preserves school name at the time of the session
  activeTermId?: number;
  createdAt?: string;
}

export interface Term {
  id: number;
  sessionId: number;
  name: TermName;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  termOrder?: number;
}

export interface ClassLevel {
  id: number;
  name: string; // e.g., 'Year 7', 'Year 10'
  levelType: LevelType;
  maxCaTotal: number; // 40 for Junior, 30 for Senior
}

export interface ClassSection {
  id: number;
  classLevelId: number;
  name: string; // e.g., 'YEAR 7 DILIGENCE', 'YEAR 8 RESILIENCE', 'YEAR 12'
  code?: string;
  levelType: LevelType;
  classTeacherName: string;
  room?: string;
  capacity?: number;
}

export interface TeacherSubjectAssignment {
  sectionId: number;
  subjectId: number;
}

export interface Teacher {
  id: number;
  fullName: string;
  username?: string;
  email: string;
  phone?: string;
  staffId?: string;
  assignedSectionId?: number | null; // Class section where they serve as Form Tutor
  assignedSubjects?: TeacherSubjectAssignment[]; // Assigned subjects per class section
  role: 'FORM_TUTOR' | 'SUBJECT_TEACHER' | 'BOTH';
  systemRole?: UserRole;
  mustSetPassword?: boolean;
  passwordResetRequested?: boolean;
  passwordResetRequestedAt?: string;
  hasPasswordSet?: boolean;
  initialPin?: string;
  departmentId?: string;
  departmentName?: string;
  isHod?: boolean;
}

export interface User {
  id: number;
  fullName: string;
  username?: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  assignedSectionId?: number;
  assignedSubjectIds?: number[];
  assignedSubjects?: TeacherSubjectAssignment[];
  mustSetPassword?: boolean;
  passwordResetRequested?: boolean;
  hasPasswordSet?: boolean;
  initialPin?: string;
  departmentId?: string;
  departmentName?: string;
  isHod?: boolean;
}

export type PromotionDecision = 'PROMOTED' | 'PROBATION' | 'REPEATED' | 'PARALLEL_TRANSFER' | 'GRADUATED';

export interface Student {
  id: number;
  admissionNumber: string;
  fullName: string;
  currentSectionId: number;
  gender: 'MALE' | 'FEMALE';
  guardianEmail?: string;
  guardianPhone?: string;
  avatarUrl?: string;
  attendanceDays?: number;
  totalSchoolDays?: number;
  promotionStatus?: PromotionDecision | 'ENROLLED';
  previousSectionName?: string;
  assignedTutorName?: string;
  isRecordSealed?: boolean;
  recordSignature?: string; // e.g. 'GRADUATED'
  graduatedSessionName?: string;
  graduatedAt?: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  category: SubjectCategory;
  applicableLevel?: LevelType | 'BOTH';
}

export interface AssessmentComponent {
  id: number;
  termId: number;
  levelType: LevelType; // 'JUNIOR' or 'SENIOR'
  name: string; // 'Quiz', 'Classwork', 'Assignment', 'Project', 'Test'
  shortCode: string; // 'QZ', 'CW', 'ASS', 'PJ', 'TEST'
  maxScore: number; // 5.0, 5.0, 5.0, 5.0, 20.0 or 3.0, 2.0, 5.0, 20.0
  weightOrder: number;
}

export interface StudentSubjectEnrollment {
  id: number;
  studentId: number;
  sectionId: number;
  subjectId: number;
  termId: number;
  isIncluded: boolean; // Mirrors the 'INCLUDE' column (senior only; junior always included/core)
}

export interface AssessmentScore {
  id: number;
  enrollmentId: number;
  studentId: number;
  subjectId: number;
  componentId: number;
  score: number | null;
  updatedBy: number;
  updatedAt: string;
}

export interface CaSubScoreDetails {
  cw?: number | null;
  qz?: number | null;
  ass?: number | null;
  pj?: number | null;
  test?: number | null;
}

/**
 * End-of-term score record:
 * Junior: 1st CA (20 marks = 40/2) + 2nd CA (20 marks = 40/2) + Exam (60 marks) = 100
 * Senior: 1st CA (15 marks = 30/2) + 2nd CA (15 marks = 30/2) + Exam (70 marks) = 100
 */
export interface TermSubjectRecord {
  id: number;
  studentId: number;
  subjectId: number;
  termId: number;
  ca1Score: number; // Scaled 1st CA: out of 20 (Junior) or 15 (Senior)
  ca2Score: number; // Scaled 2nd CA: out of 20 (Junior) or 15 (Senior)
  ca1RawScore?: number; // Raw CA1 sum out of 40 (Junior) or 30 (Senior)
  ca2RawScore?: number; // Raw CA2 sum out of 40 (Junior) or 30 (Senior)
  examScore: number; // Exam score: out of 60 (Junior) or 70 (Senior)
  totalScore: number; // CA1 + CA2 + EXAM = 100
  grade: string;
  ca1Details?: CaSubScoreDetails;
  ca2Details?: CaSubScoreDetails;
}

export interface CustomReportColumn {
  id: string;
  header: string;
  maxScore: number;
  sourceKey?: 'ca1' | 'ca2' | 'exam' | 'custom';
  defaultValue?: number;
}

export type CustomColorBarTheme =
  | 'EMERALD'
  | 'INDIGO'
  | 'AMBER'
  | 'ROSE'
  | 'PURPLE'
  | 'emerald'
  | 'amber'
  | 'purple'
  | 'rose'
  | 'teal';

export interface CustomReportTemplate {
  id: string;
  sectionId: number;
  sectionIds?: number[]; // Classes selected for this custom report card
  title: string; // Name of the custom report card
  subtitle: string;
  reportMode: 'INDIVIDUAL_STUDENT' | 'SUBJECT_ORIENTED' | 'CUSTOM_HEADERS';
  enabledInReportTab?: boolean; // Whether added to the Report Cards & Transcripts dropdown
  colorBarTheme?: CustomColorBarTheme;
  columns: CustomReportColumn[];
  selectedSubjectIds: number[];
  customSubjectScores?: Record<number, Record<string, number>>;
  studentCustomScores?: Record<string, any>;
  updatedAt: string;
}

export interface StudentTermSummary {
  id: number;
  studentId: number;
  sectionId: number;
  termId: number;
  totalScoreObtained: number;
  totalPossibleScore: number;
  cumulativePercentage: number;
  cumulativeGrade: string;
  classRank: number;
  totalStudentsInSection: number;
  principalRemark: string;
  teacherRemark: string;
  isPublished: boolean;
  updatedAt: string;
}

export interface StudentAnnualSummary {
  studentId: number;
  sectionId: number;
  includedTerms: number[]; // [1, 2, 3] or user-selected
  firstTermPct: number | null;
  secondTermPct: number | null;
  thirdTermPct: number | null;
  yearlyAveragePct: number;
  yearlyGrade: string;
  yearlyRank: number;
}

export interface ScoreAuditLog {
  id: number;
  assessmentScoreId?: number;
  studentName: string;
  subjectName: string;
  componentName: string;
  previousScore: number | null;
  newScore: number | null;
  changedBy: string;
  changedByRole: UserRole;
  changeReason: string;
  createdAt: string;
}

export interface CommentBankItem {
  id: number;
  grade: string; // 'A', 'B1', 'B2', 'B', 'C4', 'C5', 'C6', 'C', 'D', 'E', 'F'
  remarkType: RemarkType;
  commentText: string;
}

export interface GradingScale {
  id: number;
  levelType: LevelType;
  grade: string;
  minScore: number;
  maxScore: number;
  description: string;
  gpaPoint: number;
  colorClass: string;
}

export interface StudentPromotionRecord {
  id: string;
  studentId: number;
  studentName: string;
  admissionNumber: string;
  fromSessionId: number;
  fromSessionName: string;
  toSessionId: number;
  toSessionName: string;
  fromSectionId: number;
  fromSectionName: string;
  toSectionId: number;
  toSectionName: string;
  toFormTutorName: string;
  firstTermPct: number;
  secondTermPct: number;
  thirdTermPct: number;
  cumulativeAvgPct: number;
  finalGrade: string;
  decision: PromotionDecision;
  createdAt: string;
}

export interface AcademicSessionArchive {
  sessionId: number;
  sessionName: string;
  institutionName: string;
  schoolMotto?: string;
  principalName?: string;
  updatedAt: string;
  classSections: ClassSection[];
  teachers: Teacher[];
  students: Student[];
  enrollments: StudentSubjectEnrollment[];
  scores: AssessmentScore[];
  termSubjectRecords: TermSubjectRecord[];
  termSummaries: StudentTermSummary[];
}

export interface OldSheetData {
  fileName: string;
  section: string;
  term: string;
  session: string;
  levelType?: LevelType;
  activeStudent: string;
  studentsCount: number;
  students: string[];
  coreSubjects: string[];
  optionalSubjects: string[];
  scores: Array<{
    included: boolean;
    subject: string;
    totalScore: number | null;
    cum100: number | null;
    grade: string | null;
    status: string | null;
  }>;
  classAverageTotal: number | null;
  classAverageCum: number | null;
  principalRemark: string;
}

export type TeacherDocumentCategory =
  | 'SCHEME_OF_WORK'
  | 'LESSON_PLAN'
  | 'LESSON_NOTES'
  | 'EXAM_QUESTIONS';

export type SupportedDocumentFormat = 'PDF' | 'DOCX' | 'PPTX';
export type AllowedDocExtension = SupportedDocumentFormat;

export interface OfficeMessage {
  id: string;
  senderName: string;
  senderRole: UserRole;
  recipientTeacherId: number | 'ALL';
  recipientTeacherName?: string;
  title?: string;
  subject?: string;
  body: string;
  priority?: 'NORMAL' | 'IMPORTANT' | 'URGENT';
  readByTeacherIds: number[];
  createdAt: string;
}

export interface RequiredDocumentSlot {
  id: string;
  name: string;
  category: TeacherDocumentCategory;
  targetTermName?: TermName | 'ALL';
  targetWeek?: number | 'ALL';
  instructions?: string;
  description?: string;
  createdByRole: UserRole;
  createdByName?: string;
  createdBy?: string;
  createdAt: string;
}

export interface TeacherDocumentExecutiveRemark {
  id: string;
  authorName: string;
  authorRole: UserRole;
  authorDesignation?: string; // e.g., "HOD — Department of Sciences & Mathematics" or "Principal"
  departmentId?: string;
  departmentName?: string;
  comment?: string;
  remark?: string;
  actionType?: string;
  status?: 'APPROVED' | 'NEEDS_REVISION' | 'REVIEWED';
  createdAt: string;
}

export interface TeacherDocumentUpload {
  id: string;
  teacherId: number;
  teacherName: string;
  sectionId: number;
  sectionName: string;
  subjectId: number;
  subjectName: string;
  departmentId?: string;
  departmentName?: string;
  termId?: number;
  termName: TermName;
  sessionName?: string;
  weekNumber: number; // 1 to 14 (14-week term timeline)
  slotId?: string;
  documentSlotId?: string;
  documentTitle: string;
  category: TeacherDocumentCategory;
  documentCategory?: TeacherDocumentCategory;
  fileName: string;
  fileExtension: SupportedDocumentFormat;
  fileType?: SupportedDocumentFormat;
  fileSizeKb: number;
  fileStoragePath?: string;
  fileDataUrl?: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'NEEDS_REVISION';
  hodReviewStatus?: 'PENDING_HOD' | 'HOD_PENDING' | 'HOD_APPROVED' | 'HOD_REVISION' | 'HOD_REVIEWED';
  hodReviewedBy?: string;
  hodReviewedAt?: string;
  executiveRemarks: TeacherDocumentExecutiveRemark[];
  uploadedAt: string;
}

export interface AcademicDepartment {
  id: string;
  name: string; // e.g. "Department of Sciences & Mathematics"
  code: string; // e.g. "DEPT-SCI"
  hodTeacherId: number;
  hodTeacherName: string;
  hodUsername?: string;
  subjectIds: number[];
  description?: string;
  createdByRole: UserRole;
  createdByName: string;
  createdAt: string;
}

export interface GradingScaleBand {
  id?: string;
  levelType?: LevelType;
  grade: string;
  minScore: number;
  maxScore: number;
  description?: string;
  remark?: string;
  gpaPoint?: number;
  colorClass?: string;
}

export type GradingScaleScope = 'JUNIOR' | 'SENIOR' | 'CUSTOM_TEMPLATE';

export interface GradingScalePreset {
  id: string;
  name: string;
  scope?: GradingScaleScope;
  targetScope?: GradingScaleScope;
  customTemplateId?: string; // 'ALL' or specific CustomReportTemplate.id
  isDefault?: boolean;
  isEnabledForReports: boolean;
  bands: GradingScaleBand[];
  updatedAt: string;
}

export interface StudentTestimonial {
  id: string;
  studentId: number;
  studentName: string;
  examNumber: string;
  examOrAdmissionNo?: string;
  schoolName: string;
  schoolAddress: string;
  schoolLogoUrl?: string;
  fromYear: string;
  toYear: string;
  entryYear?: string;
  graduationYear?: string;
  enteredClass: string;
  enteredInClass?: string;
  leftClass: string;
  leftInClass?: string;
  subjectsStudied: string[];
  academicAbility: string;
  coCurricularActivities: string;
  postOfResponsibility: string;
  postOfResponsibilityHeld?: string;
  remarksOnAttitude: string;
  generalRemarks: string;
  principalName: string;
  issueDate: string;
  graduatedSessionName: string;
  sessionName?: string;
  cumulativeAvgPct?: number;
  finalGrade?: string;
  recordSignature: 'GRADUATED';
  isSealed?: boolean;
  createdAt?: string;
}
