/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole, LevelType, GradingScale, AssessmentComponent, Subject, Student, StudentTestimonial, User } from '../types/index';
import { SENIOR_GRADING_SCALES, JUNIOR_GRADING_SCALES } from './academicCalculations';

export type AppTab =
  | 'home'
  | 'teachers_corner'
  | 'grid'
  | 'registry'
  | 'dashboard'
  | 'report'
  | 'sheets'
  | 'class_management'
  | 'audit'
  | 'settings';

export const ALLOWED_ROLES: ReadonlyArray<{
  role: UserRole;
  label: string;
  shortLabel: string;
  badgeColor: string;
  description: string;
}> = [
  {
    role: 'SUPER_ADMIN',
    label: 'Super Admin',
    shortLabel: 'Super Admin',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    description: 'All views including Master Settings, Class Management & MySQL/phpMyAdmin configuration'
  },
  {
    role: 'PRINCIPAL',
    label: 'Principal',
    shortLabel: 'Principal',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'All views including Class Management & Master Settings except MySQL/phpMyAdmin'
  },
  {
    role: 'HEAD_OF_SCHOOLS',
    label: 'Head of Schools',
    shortLabel: 'Head of Schools',
    badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    description: 'Same permissions as Principal: all views including Class Management except MySQL/phpMyAdmin'
  },
  {
    role: 'VICE_PRINCIPAL',
    label: 'Vice Principal',
    shortLabel: 'Vice Principal',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    description: 'Same permissions as Principal: all views including Class Management except MySQL/phpMyAdmin'
  },
  {
    role: 'CLASS_TEACHER',
    label: 'Class Teacher',
    shortLabel: 'Class Teacher',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description: 'All views except Class Management & Master Settings; view-only on Report Cards & Transcripts'
  },
  {
    role: 'SUBJECT_TEACHER',
    label: 'Subject Teacher',
    shortLabel: 'Subject Teacher',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'All views except Class Management & Master Settings; view-only on Report Cards & Transcripts'
  }
];

/**
 * Normalizes any legacy role string from storage/seed into one of the valid roles.
 */
export function normalizeUserRole(rawRole: string | null | undefined): UserRole {
  if (
    rawRole === 'SUPER_ADMIN' ||
    rawRole === 'PRINCIPAL' ||
    rawRole === 'HEAD_OF_SCHOOLS' ||
    rawRole === 'VICE_PRINCIPAL' ||
    rawRole === 'CLASS_TEACHER' ||
    rawRole === 'SUBJECT_TEACHER'
  ) {
    return rawRole;
  }
  return 'PRINCIPAL';
}

/**
 * Checks whether a role can access Master Settings ('settings' tab).
 * Class Teachers and Subject Teachers cannot access Master Settings.
 */
export function canAccessMasterSettings(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'PRINCIPAL' || role === 'HEAD_OF_SCHOOLS' || role === 'VICE_PRINCIPAL';
}

/**
 * Checks whether a role can access the Class Management ('class_management') tab.
 * Strictly reserved for SUPER_ADMIN, PRINCIPAL, and VICE_PRINCIPAL.
 */
export function canAccessClassManagement(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'PRINCIPAL' || role === 'HEAD_OF_SCHOOLS' || role === 'VICE_PRINCIPAL';
}

/**
 * Checks whether a role can access the MySQL / phpMyAdmin configuration inside Master Settings.
 * Strictly reserved for SUPER_ADMIN. Principal and Vice Principal have all views except MySQL/phpMyAdmin.
 */
export function canAccessDatabaseConfig(role: UserRole): boolean {
  return role === 'SUPER_ADMIN';
}

/**
 * Checks whether a role can access the Full System Backup & Restore module inside Master Settings.
 * Strictly reserved for SUPER_ADMIN only.
 */
export function canAccessSystemBackup(role: UserRole): boolean {
  return role === 'SUPER_ADMIN';
}

/**
 * Checks whether a role can print or download report cards, transcripts, and PDF records.
 * Teachers (CLASS_TEACHER, SUBJECT_TEACHER) can view transcripts and report cards but CANNOT print or download.
 */
export function canPrintOrDownload(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'PRINCIPAL' || role === 'HEAD_OF_SCHOOLS' || role === 'VICE_PRINCIPAL';
}

/**
 * Checks whether a role can approve password reset requests and create teacher accounts.
 */
export function canManageStaffAuth(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'PRINCIPAL' || role === 'HEAD_OF_SCHOOLS' || role === 'VICE_PRINCIPAL';
}

/**
 * Returns the list of allowed navigation tabs for a given role.
 * Note: 'database' is never a top-level navigation tab; it lives only inside Master Settings for SUPER_ADMIN.
 */
export function getAllowedTabsForRole(role: UserRole): AppTab[] {
  const baseTabs: AppTab[] = [
    'home',
    'teachers_corner',
    'grid',
    'registry',
    'dashboard',
    'report',
    'sheets',
    'audit'
  ];
  if (canAccessClassManagement(role)) {
    return [
      'home',
      'teachers_corner',
      'grid',
      'registry',
      'dashboard',
      'report',
      'sheets',
      'class_management',
      'audit',
      'settings'
    ];
  }
  return baseTabs;
}

/**
 * Returns the role-aware title for the Teacher's Corner / Executive Office tab:
 * - SUPER_ADMIN -> "Super User's Office"
 * - PRINCIPAL -> "Principal's Office"
 * - HEAD_OF_SCHOOLS -> "Head of Schools' Office"
 * - VICE_PRINCIPAL -> "Vice Principal's Office"
 * - CLASS_TEACHER / SUBJECT_TEACHER -> "Teacher's Corner"
 */
export function getTeachersCornerTabTitle(role: UserRole): string {
  if (role === 'SUPER_ADMIN') return "Super User's Office";
  if (role === 'PRINCIPAL') return "Principal's Office";
  if (role === 'HEAD_OF_SCHOOLS') return "Head of Schools' Office";
  if (role === 'VICE_PRINCIPAL') return "Vice Principal's Office";
  return "Teacher's Corner";
}

/**
 * Returns the grading scale array for a given class levelType.
 */
export function getClassGradingScale(levelType: LevelType): GradingScale[] {
  return levelType === 'SENIOR' ? SENIOR_GRADING_SCALES : JUNIOR_GRADING_SCALES;
}

/**
 * Parses an `include` cell value from a Bulk CSV row.
 * Supports:
 * - "true", "false", "1", "0", "yes", "no", "included", "excluded"
 * - "include=true", "include=false", "include:true", "include:false"
 */
export function parseCsvIncludeFlag(rawVal: string | undefined, defaultInclude = true): {
  isExplicitIncludeColumn: boolean;
  isIncluded: boolean;
} {
  if (rawVal === undefined || rawVal === null) {
    return { isExplicitIncludeColumn: false, isIncluded: defaultInclude };
  }
  const cleaned = rawVal.replace(/^"|"$/g, '').trim().toLowerCase();
  if (!cleaned) {
    return { isExplicitIncludeColumn: false, isIncluded: defaultInclude };
  }

  if (cleaned.startsWith('include=') || cleaned.startsWith('include:')) {
    const rhs = cleaned.split(/[=:]/)[1]?.trim() || '';
    const isTrue = rhs === 'true' || rhs === '1' || rhs === 'yes' || rhs === 'y';
    return { isExplicitIncludeColumn: true, isIncluded: isTrue };
  }

  if (cleaned === 'true' || cleaned === 'yes' || cleaned === 'included') {
    return { isExplicitIncludeColumn: true, isIncluded: true };
  }
  if (cleaned === 'false' || cleaned === 'no' || cleaned === 'excluded') {
    return { isExplicitIncludeColumn: true, isIncluded: false };
  }

  return { isExplicitIncludeColumn: false, isIncluded: defaultInclude };
}

export interface ParsedCsvStudentSubjectScore {
  subjectName: string;
  subjectId: number;
  isIncluded: boolean;
  scores: Record<number, number>;
}

export interface ParsedCsvStudentGroup {
  name: string;
  admissionNumber: string;
  gender?: 'MALE' | 'FEMALE';
  isExisting: boolean;
  existingStudent?: Student;
  decision?: 'OVERWRITE' | 'NEW' | 'SKIP';
  enrollConfirmed?: boolean;
  subjectScores: ParsedCsvStudentSubjectScore[];
}

export interface CsvEnrollmentAnalysis {
  csvStudentCount: number;
  registeredStudentCount: number;
  exceedsRegisteredCount: boolean;
  extraStudentCount: number;
  unregisteredGroups: ParsedCsvStudentGroup[];
  requiresEnrollmentModal: boolean;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const character = csvText[i];

    if (character === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',' && !inQuotes) {
      row.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      row.push(value.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      value = '';
      if (character === '\r' && csvText[i + 1] === '\n') i++;
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

export function normalizeCsvSubjectLabel(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

function isApplicableToLevel(subject: Subject, levelType?: LevelType): boolean {
  return !levelType || !subject.applicableLevel ||
    subject.applicableLevel === 'BOTH' || subject.applicableLevel === levelType;
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (left.length >= right.length) leftIndex += 1;
    if (right.length >= left.length) rightIndex += 1;
  }

  return differences + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

export function findCsvSubjectMatch(
  rawSubjectName: string,
  subjects: Subject[],
  levelType?: LevelType
): Subject | undefined {
  const candidates = subjects.filter(subject => isApplicableToLevel(subject, levelType));
  const normalizedName = normalizeCsvSubjectLabel(rawSubjectName);
  if (!normalizedName) return undefined;

  const exactMatches = candidates.filter(subject =>
    normalizeCsvSubjectLabel(subject.name) === normalizedName ||
    normalizeCsvSubjectLabel(subject.code) === normalizedName
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return undefined;

  if (normalizedName.length < 6) return undefined;
  const nearMatches = candidates.filter(subject =>
    [subject.name, subject.code].some(label => {
      const normalizedLabel = normalizeCsvSubjectLabel(label);
      return normalizedLabel.length >= 6 && editDistanceAtMostOne(normalizedLabel, normalizedName);
    })
  );
  const uniqueMatches = Array.from(new Map(nearMatches.map(subject => [subject.id, subject])).values());
  return uniqueMatches.length === 1 ? uniqueMatches[0] : undefined;
}

export function buildCsvImportedSubject(
  subjectName: string,
  levelType: LevelType,
  existingSubjects: Subject[]
): Omit<Subject, 'id'> {
  const cleanName = subjectName.trim().toUpperCase();
  const tokens = cleanName.split(/[^A-Z0-9]+/).filter(Boolean);
  const baseCode = (tokens.length > 1
    ? tokens.map(token => token[0]).join('')
    : (tokens[0] || 'SUBJ').slice(0, 4)
  ).slice(0, 6) || 'SUBJ';
  const usedCodes = new Set(existingSubjects.map(subject => subject.code.trim().toUpperCase()));
  let code = baseCode;
  let suffix = 2;
  while (usedCodes.has(code)) {
    const ending = String(suffix++);
    code = `${baseCode.slice(0, 6 - ending.length)}${ending}`;
  }

  return {
    name: cleanName,
    code,
    category: levelType === 'JUNIOR' ? 'CORE' : 'OPTIONAL',
    applicableLevel: levelType
  };
}

/**
 * Analyzes parsed CSV student groups against the class's currently registered students.
 * Triggers the Enrollment Identification Modal whenever:
 * 1) The number of students in the CSV is greater than the number of students registered in the class, OR
 * 2) The CSV contains one or more students who are not yet registered in the class.
 */
export function analyzeCsvEnrollmentRequirements(
  groups: ParsedCsvStudentGroup[],
  registeredClassStudents: Student[]
): CsvEnrollmentAnalysis {
  const csvStudentCount = groups.length;
  const registeredStudentCount = registeredClassStudents.length;
  const exceedsRegisteredCount = csvStudentCount > registeredStudentCount;
  const extraStudentCount = Math.max(0, csvStudentCount - registeredStudentCount);
  const unregisteredGroups = groups.filter(g => !g.isExisting);
  const requiresEnrollmentModal = exceedsRegisteredCount || unregisteredGroups.length > 0;

  return {
    csvStudentCount,
    registeredStudentCount,
    exceedsRegisteredCount,
    extraStudentCount,
    unregisteredGroups,
    requiresEnrollmentModal
  };
}

/**
 * Parses Bulk CSV text where each row specifies:
 * Format A (with explicit Include column):
 *   Student Name, Admission Number, Subject, Include (true/false or include=true/false), Comp1, Comp2, ...
 * Format B (legacy without Include column, defaults to defaultInclude):
 *   Student Name, Admission Number, Subject, Comp1, Comp2, ...
 */
export function parseBulkCsvWithSubjectInclusion(params: {
  csvText: string;
  students: Student[];
  subjects: Subject[];
  defaultSubject: Subject;
  components: AssessmentComponent[];
  defaultInclude?: boolean;
  levelType?: LevelType;
}): ParsedCsvStudentGroup[] {
  const {
    csvText,
    students,
    subjects,
    defaultSubject,
    components,
    defaultInclude = true,
    levelType
  } = params;

  if (!csvText || !csvText.trim()) return [];

  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return [];

  const firstCols = rows[0].map(c => c.trim().toUpperCase());
  const hasHeader =
    firstCols[0]?.includes('NAME') ||
    firstCols[1]?.includes('ADM') ||
    firstCols[2]?.includes('SUBJ') ||
    firstCols[3]?.includes('INCL');

  const nameColIdx = hasHeader ? Math.max(0, firstCols.findIndex(c => c.includes('NAME'))) : 0;
  const admissionColIdx = hasHeader
    ? Math.max(0, firstCols.findIndex(c => c.includes('ADM')))
    : 1;
  const subjectColIdx = hasHeader ? Math.max(0, firstCols.findIndex(c => c.includes('SUBJ'))) : 2;
  const includeColIdx = hasHeader ? firstCols.findIndex(c => c.includes('INCL')) : -1;

  const studentGroupMap = new Map<string, ParsedCsvStudentGroup>();

  for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length < 2) continue;

    const rawName = cols[nameColIdx] || '';
    if (!rawName) continue;
    const rawAdm = cols[admissionColIdx] || '';
    const rawSub = cols[subjectColIdx] || '';

    const normKey = `${rawName.trim().replace(/\s+/g, ' ').toUpperCase()}__${rawAdm.trim().toUpperCase()}`;
    let record = studentGroupMap.get(normKey);

    const matchedExisting = students.find(
      st =>
        st.fullName.trim().replace(/\s+/g, ' ').toLowerCase() === rawName.trim().replace(/\s+/g, ' ').toLowerCase() ||
        (rawAdm && st.admissionNumber.trim().toLowerCase() === rawAdm.trim().toLowerCase())
    );

    if (!record) {
      record = {
        name: rawName,
        admissionNumber: rawAdm || matchedExisting?.admissionNumber || `STU-2026-${1000 + r}`,
        gender: matchedExisting?.gender || 'MALE',
        isExisting: Boolean(matchedExisting),
        existingStudent: matchedExisting,
        decision: matchedExisting ? 'OVERWRITE' : 'NEW',
        enrollConfirmed: true,
        subjectScores: []
      };
      studentGroupMap.set(normKey, record);
    }

    const targetSub = rawSub
      ? findCsvSubjectMatch(rawSub, subjects, levelType)
      : defaultSubject;

    const includeIndex = hasHeader ? includeColIdx : 3;
    const includeCheck = parseCsvIncludeFlag(cols[includeIndex], defaultInclude);
    const hasIncludeColInRow = includeColIdx >= 0 || includeCheck.isExplicitIncludeColumn;
    const isIncluded = levelType === 'JUNIOR'
      ? true
      : hasIncludeColInRow ? includeCheck.isIncluded : defaultInclude;
    const scoreStartColIndex = hasHeader
      ? includeColIdx >= 0 ? includeColIdx + 1 : subjectColIdx + 1
      : hasIncludeColInRow ? 4 : 3;

    const rowScores: Record<number, number> = {};
    const scoreHeaderCols = hasHeader ? firstCols : [];

    components.forEach((comp, cIdx) => {
      const targetColIdx = hasHeader
        ? scoreHeaderCols.findIndex(
          h =>
            h === comp.shortCode.toUpperCase() ||
            h.startsWith(`${comp.shortCode.toUpperCase()} `) ||
            h === comp.name.toUpperCase() ||
            h.startsWith(`${comp.name.toUpperCase()} `)
        )
        : scoreStartColIndex + cIdx;

      const rawVal = targetColIdx >= 0 ? cols[targetColIdx] : undefined;
      if (rawVal !== undefined) {
        const trimmed = rawVal.trim();
        // If score for a component is not added (blank), leave it blank — do NOT add 0
        if (trimmed !== '' && trimmed !== '-' && trimmed !== '—' && trimmed.toUpperCase() !== 'NULL') {
          const num = parseFloat(trimmed);
          if (!isNaN(num)) {
            rowScores[comp.id] = Math.min(comp.maxScore, Math.max(0, num));
          }
        }
      }
    });

    record.subjectScores.push({
      subjectName: targetSub?.name || rawSub.trim(),
      subjectId: targetSub?.id ?? 0,
      isIncluded,
      scores: rowScores
    });
  }

  return Array.from(studentGroupMap.values());
}

/**
 * 30 minutes of inactivity (in milliseconds) before locking the system automatically.
 */
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export interface PersistedStaffSession {
  user: User;
  role: UserRole;
  lastActivityAt: number;
}

const STAFF_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'CLASS_TEACHER',
  'SUBJECT_TEACHER'
];

export function serializePersistedStaffSession(
  user: User,
  role: UserRole,
  lastActivityAt: number
): string {
  const safeUser: User = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    role,
    isActive: true,
    assignedSectionId: user.assignedSectionId,
    assignedSubjects: user.assignedSubjects,
    mustSetPassword: user.mustSetPassword,
    hasPasswordSet: user.hasPasswordSet,
    passwordResetRequested: user.passwordResetRequested,
    departmentId: user.departmentId,
    departmentName: user.departmentName,
    isHod: user.isHod
  };
  return JSON.stringify({ user: safeUser, role, lastActivityAt });
}

export function parsePersistedStaffSession(
  raw: string | null,
  now = Date.now()
): PersistedStaffSession | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const session = parsed as Record<string, unknown>;
    if (typeof session.lastActivityAt !== 'number' || !Number.isFinite(session.lastActivityAt)) {
      return null;
    }
    const elapsed = now - session.lastActivityAt;
    if (elapsed < 0 || elapsed >= INACTIVITY_TIMEOUT_MS) return null;

    if (!session.user || typeof session.user !== 'object') return null;
    const rawUser = session.user as Record<string, unknown>;
    const role = session.role;
    if (
      typeof role !== 'string' ||
      !STAFF_ROLES.includes(role as UserRole) ||
      rawUser.role !== role ||
      typeof rawUser.id !== 'number' ||
      !Number.isFinite(rawUser.id) ||
      typeof rawUser.fullName !== 'string' ||
      !rawUser.fullName.trim() ||
      typeof rawUser.username !== 'string' ||
      rawUser.isActive !== true
    ) {
      return null;
    }

    const safeAssignedSubjects = Array.isArray(rawUser.assignedSubjects)
      ? rawUser.assignedSubjects.filter(
          (assignment): assignment is { sectionId: number; subjectId: number } =>
            Boolean(
              assignment &&
              typeof assignment === 'object' &&
              typeof (assignment as Record<string, unknown>).sectionId === 'number' &&
              typeof (assignment as Record<string, unknown>).subjectId === 'number'
            )
        )
      : undefined;
    const user: User = {
      id: rawUser.id,
      fullName: rawUser.fullName,
      username: rawUser.username,
      email: typeof rawUser.email === 'string' ? rawUser.email : '',
      role: role as UserRole,
      isActive: true,
      assignedSectionId:
        typeof rawUser.assignedSectionId === 'number' ? rawUser.assignedSectionId : undefined,
      assignedSubjects: safeAssignedSubjects,
      mustSetPassword: rawUser.mustSetPassword === true,
      hasPasswordSet: rawUser.hasPasswordSet === true,
      passwordResetRequested: rawUser.passwordResetRequested === true,
      departmentId: typeof rawUser.departmentId === 'string' ? rawUser.departmentId : undefined,
      departmentName:
        typeof rawUser.departmentName === 'string' ? rawUser.departmentName : undefined,
      isHod: rawUser.isHod === true
    };

    return { user, role: role as UserRole, lastActivityAt: session.lastActivityAt };
  } catch {
    return null;
  }
}

/**
 * Generates a 4-digit numeric PIN (1000 - 9999) to secure initial login.
 * If an optional numeric seed is provided, produces a deterministic 4-digit PIN.
 */
export function generateFourDigitPin(): string {
  const random = new Uint32Array(1);
  globalThis.crypto.getRandomValues(random);
  const randomPin = 1000 + (random[0] % 9000);
  return String(randomPin).padStart(4, '0');
}

export interface StrictPasswordValidationResult {
  valid: boolean;
  hasMinLength: boolean; // Longer than 8 characters (length > 8, i.e., >= 9)
  hasUppercase: boolean; // At least 1 uppercase letter [A-Z]
  hasNumberOrSpecial: boolean; // At least 1 number or special character
  errors: string[];
}

/**
 * Validates a password against the strict security policy:
 * - Must be longer than 8 characters (length > 8, i.e., at least 9 characters)
 * - Must contain at least 1 uppercase letter (A-Z)
 * - Must contain at least 1 number (0-9) or special character
 */
export function validateStrictPassword(password: string): StrictPasswordValidationResult {
  const raw = String(password || '');
  const hasMinLength = raw.length > 8;
  const hasUppercase = /[A-Z]/.test(raw);
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(raw);

  const errors: string[] = [];
  if (!hasMinLength) {
    errors.push('Password must be longer than 8 characters (at least 9 characters).');
  }
  if (!hasUppercase) {
    errors.push('Password must contain at least 1 uppercase letter (A-Z).');
  }
  if (!hasNumberOrSpecial) {
    errors.push('Password must contain at least 1 number or special character.');
  }

  return {
    valid: hasMinLength && hasUppercase && hasNumberOrSpecial,
    hasMinLength,
    hasUppercase,
    hasNumberOrSpecial,
    errors
  };
}

/**
 * Generates a username from a teacher's full name if not explicitly provided.
 * e.g. "Sample Teacher" -> "sample.teacher"
 */
export function generateTeacherUsername(fullName: string): string {
  const withoutTitle = fullName
    .trim()
    .replace(/^(mr\.?|mrs\.?|ms\.?|miss|dr\.?|prof\.?|mallam|alhaji|hajiya|pastor|rev\.?)\s+/i, '');
  const parts = withoutTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'teacher';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

export interface StaffAccountAuthState {
  username: string;
  fullName: string;
  role: UserRole;
  initialPin: string;
  mustSetPassword: boolean;
  passwordResetRequested: boolean;
  hasPasswordSet: boolean;
}

/**
 * Pure state machine helper for teacher account creation without password,
 * secured by a generated 4-digit PIN for initial login, followed by mandatory password setup.
 */
export function createPasswordlessTeacherAccount(params: {
  fullName: string;
  username?: string;
  role?: UserRole;
  initialPin?: string;
}): StaffAccountAuthState {
  const cleanName = params.fullName.trim();
  const cleanUsername = (params.username?.trim() || generateTeacherUsername(cleanName)).toLowerCase();
  const initialPin =
    params.initialPin && /^\d{4}$/.test(params.initialPin.trim())
      ? params.initialPin.trim()
      : generateFourDigitPin();
  return {
    username: cleanUsername,
    fullName: cleanName,
    role: params.role || 'CLASS_TEACHER',
    initialPin,
    mustSetPassword: true,
    passwordResetRequested: false,
    hasPasswordSet: false
  };
}

/**
 * Verifies the 4-digit initial login PIN before allowing first-time password creation.
 */
export function verifyInitialLoginPin(
  account: Pick<StaffAccountAuthState, 'initialPin'>,
  enteredPin: string
): { ok: boolean; error?: string } {
  const cleanPin = String(enteredPin || '').trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    return { ok: false, error: 'Please enter a valid 4-digit numeric PIN.' };
  }
  if (cleanPin !== account.initialPin) {
    return { ok: false, error: 'Invalid 4-digit PIN. Check with Super Admin, Principal, or Vice Principal.' };
  }
  return { ok: true };
}

export function completeFirstTimePasswordSetup(
  account: StaffAccountAuthState,
  newPassword: string,
  enteredPin?: string
): { ok: boolean; error?: string; updatedAccount: StaffAccountAuthState } {
  if (enteredPin !== undefined) {
    const pinCheck = verifyInitialLoginPin(account, enteredPin);
    if (!pinCheck.ok) {
      return {
        ok: false,
        error: pinCheck.error,
        updatedAccount: account
      };
    }
  }

  const validation = validateStrictPassword(newPassword);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.errors[0] || 'Password does not meet security requirements.',
      updatedAccount: account
    };
  }

  return {
    ok: true,
    updatedAccount: {
      ...account,
      mustSetPassword: false,
      passwordResetRequested: false,
      hasPasswordSet: true
    }
  };
}

export function requestPasswordReset(account: StaffAccountAuthState): StaffAccountAuthState {
  return {
    ...account,
    passwordResetRequested: true
  };
}

export function approvePasswordResetByAdmin(
  account: StaffAccountAuthState,
  actorRole: UserRole,
  newPin?: string
): { ok: boolean; error?: string; updatedAccount: StaffAccountAuthState } {
  if (!canManageStaffAuth(actorRole)) {
    return {
      ok: false,
      error: 'Only Super Admin, Principal, or Vice Principal can approve password resets.',
      updatedAccount: account
    };
  }
  return {
    ok: true,
    updatedAccount: {
      ...account,
      initialPin: newPin && /^\d{4}$/.test(newPin) ? newPin : generateFourDigitPin(),
      mustSetPassword: true,
      passwordResetRequested: false,
      hasPasswordSet: false
    }
  };
}

/**
 * High-resolution embedded SVG Data URI for the Default School Logo.
 * Guarantees the report card logo always displays crisply on screen, print, and PDF
 * even when offline or before a custom PNG logo is uploaded.
 */
export const DEFAULT_INSTITUTION_LOGO_DATA_URI =
  `data:image/svg+xml;utf8,` +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <linearGradient id="defaultShieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="55%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="defaultGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="50%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>
  </defs>
  <!-- Outer Academic Emblem Ring -->
  <circle cx="120" cy="120" r="112" fill="#ffffff" stroke="url(#defaultGoldGrad)" stroke-width="6"/>
  <circle cx="120" cy="120" r="102" fill="none" stroke="#1e293b" stroke-width="2" stroke-dasharray="4 3"/>
  <!-- Shield Body -->
  <path d="M58 46 H182 V118 C182 162 120 194 120 194 C120 194 58 162 58 118 Z" fill="url(#defaultShieldGrad)" stroke="url(#defaultGoldGrad)" stroke-width="5" stroke-linejoin="round"/>
  <!-- Shield Quadrant Cross -->
  <path d="M120 48 V190 M60 112 H180" stroke="url(#defaultGoldGrad)" stroke-width="3" opacity="0.85"/>
  <!-- Open Book of Knowledge (Top Center) -->
  <path d="M92 66 Q106 60 120 68 Q134 60 148 66 V92 Q134 86 120 94 Q106 86 92 92 Z" fill="#ffffff" stroke="#eab308" stroke-width="2"/>
  <line x1="120" y1="68" x2="120" y2="94" stroke="#1e293b" stroke-width="2"/>
  <!-- Academic Star of Excellence (Bottom Center) -->
  <polygon points="120,124 126,138 141,138 129,147 134,161 120,152 106,161 111,147 99,138 114,138" fill="url(#defaultGoldGrad)"/>
  <!-- Scroll Banner -->
  <path d="M36 196 Q120 218 204 196 L196 218 Q120 238 44 218 Z" fill="#1e293b" stroke="url(#defaultGoldGrad)" stroke-width="2.5"/>
  <text x="120" y="215" font-family="Georgia, serif" font-size="11.5" font-weight="bold" fill="#fef08a" text-anchor="middle" letter-spacing="1.2">ACADEMIC EXCELLENCE</text>
</svg>`);

/**
 * Resolves a valid logo URL, replacing broken legacy paths with the embedded institutional crest SVG.
 */
export function resolveInstitutionLogoUrl(logoUrl: string | undefined | null): string {
  if (!logoUrl || !logoUrl.trim()) {
    return DEFAULT_INSTITUTION_LOGO_DATA_URI;
  }
  if (logoUrl.includes('cellImage_1151144331_0_d9161c7f.jpg')) {
    return DEFAULT_INSTITUTION_LOGO_DATA_URI;
  }
  return logoUrl;
}

/**
 * Strips any sensitive fields before saving non-sensitive UI preferences to browser storage,
 * and purges any legacy password/token keys from localStorage/sessionStorage.
 */
export function purgeSensitiveBrowserStorage(): void {
  if (typeof window === 'undefined') return;
  const sensitiveKeyPatterns = ['password', 'passwd', 'secret', 'token', 'auth_cred', 'private_key', 'edugrade_unlocked'];
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && sensitiveKeyPatterns.some(pat => k.toLowerCase().includes(pat))) {
        localStorage.removeItem(k);
      }
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && sensitiveKeyPatterns.some(pat => k.toLowerCase().includes(pat))) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    // ignore storage errors in restricted environments
  }
}

/**
 * Only the SUPER_ADMIN reserves the absolute right to change roles freely.
 * Any other user that tries to change roles is blocked and must verify password/PIN.
 */
export function canFreelySwitchRoles(
  currentRole: UserRole,
  isStaffLoggedIn: boolean,
  loggedInUserRole?: UserRole
): boolean {
  if (!isStaffLoggedIn) return false;
  return currentRole === 'SUPER_ADMIN' || loggedInUserRole === 'SUPER_ADMIN';
}

/**
 * Super Admin, Principal, and Vice Principal reserve the right and clearance
 * to view and edit all subjects across all classes at the same time.
 */
export function hasAllSubjectsClearance(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'PRINCIPAL' || role === 'HEAD_OF_SCHOOLS' || role === 'VICE_PRINCIPAL';
}

/**
 * Returns the list of subject IDs a teacher is authorized to view/edit in a given class section.
 * Class Teachers (Form Tutors) and Subject Teachers can only view and edit scores for the
 * subjects assigned to them in that specific class section.
 */
export function getTeacherAssignedSubjectIdsForSection(
  assignedSubjects: Array<{ sectionId: number; subjectId: number }> | undefined,
  sectionId: number
): number[] {
  if (!assignedSubjects || assignedSubjects.length === 0) return [];
  return assignedSubjects
    .filter(a => Number(a.sectionId) === Number(sectionId))
    .map(a => Number(a.subjectId));
}

/**
 * Official independent Super Administrator profile.
 * The Super Administrator is an independent system executive user separate and distinct
 * from regular classroom teachers and form tutors.
 */
export const DEFAULT_SUPER_ADMIN_PROFILE = {
  id: 999,
  staffId: 'ADMIN-01',
  fullName: 'Administrator',
  username: 'superadmin',
  role: 'SUPER_ADMIN' as UserRole,
  email: 'admin@example.invalid',
  phone: ''
};

/**
 * Checks if a given username represents the Super Administrator account.
 */
export function isSuperAdminAccount(username: string | undefined | null): boolean {
  if (!username) return false;
  const clean = username.trim().toLowerCase();
  return clean === 'superadmin' || clean === 'admin';
}

/**
 * Checks if a class section is the final graduating class (Year 12).
 */
export function isYear12GraduationClass(sectionName: string | undefined | null): boolean {
  if (!sectionName) return false;
  const upper = sectionName.trim().toUpperCase();
  return upper.includes('YEAR 12') || upper.includes('SSS 3') || upper.includes('SS 3') || upper.includes('S.S.C. THREE');
}

export interface PromotionValidationInput {
  sourceSectionName?: string;
  isYear12Source?: boolean;
  currentSessionId: number;
  destinationSessionId: number | null;
  availableSessionsCount: number;
  sourceSectionId: number;
  destinationSectionId: number | null;
  selectedStudentsCount?: number;
}

export interface PromotionValidationResult {
  valid: boolean;
  isGraduation: boolean;
  errorCode?:
    | 'NO_NEXT_SESSION_CREATED'
    | 'SAME_SESSION_SELECTED'
    | 'NO_DESTINATION_CLASS'
    | 'SAME_CLASS_SELECTED'
    | 'NO_STUDENTS_SELECTED';
  title?: string;
  message?: string;
  errorTitle?: string;
  errorMessage?: string;
}

/**
 * Validates that before any promotion or Year 12 graduation is executed:
 * 1. If Source Class is Year 12, it is treated as Graduation (`isGraduation: true`).
 * 2. For non-Year 12 classes, the next academic session must be created/selected, and a valid destination class must be selected.
 */
export function validatePromotionSelection(input: PromotionValidationInput): PromotionValidationResult {
  const isGrad = Boolean(
    input.isYear12Source || (input.sourceSectionName && isYear12GraduationClass(input.sourceSectionName))
  );

  if (input.selectedStudentsCount !== undefined && input.selectedStudentsCount <= 0) {
    const title = 'No Students Selected';
    const message = 'Please select at least one student from the class list before executing promotion or graduation.';
    return {
      valid: false,
      isGraduation: isGrad,
      errorCode: 'NO_STUDENTS_SELECTED',
      title,
      message,
      errorTitle: title,
      errorMessage: message
    };
  }

  if (isGrad) {
    return {
      valid: true,
      isGraduation: true
    };
  }

  if (input.availableSessionsCount <= 1 || !input.destinationSessionId) {
    const title = 'Next Academic Session Not Created';
    const message =
      'Cannot proceed: The next academic session has not been created or selected yet. Please create the next academic session first (e.g., 2027/28) before promoting students.';
    return {
      valid: false,
      isGraduation: false,
      errorCode: 'NO_NEXT_SESSION_CREATED',
      title,
      message,
      errorTitle: title,
      errorMessage: message
    };
  }

  if (input.destinationSessionId === input.currentSessionId) {
    const title = 'Next Academic Session Required';
    const message =
      'Cannot proceed: The selected Destination Academic Session is the same as the Current Session. Please create or select the next academic session to promote students.';
    return {
      valid: false,
      isGraduation: false,
      errorCode: 'SAME_SESSION_SELECTED',
      title,
      message,
      errorTitle: title,
      errorMessage: message
    };
  }

  if (!input.destinationSectionId || input.destinationSectionId <= 0) {
    const title = 'Destination Class Not Selected';
    const message =
      'Cannot proceed: No destination class has been selected. Please select the next class level (e.g., Year 7 to Year 8) before promoting students.';
    return {
      valid: false,
      isGraduation: false,
      errorCode: 'NO_DESTINATION_CLASS',
      title,
      message,
      errorTitle: title,
      errorMessage: message
    };
  }

  if (input.destinationSectionId === input.sourceSectionId) {
    const title = 'Destination Class Must Be Next Class';
    const message =
      'Cannot proceed: The destination class cannot be the same as the current source class. Please select the next academic class for promotion.';
    return {
      valid: false,
      isGraduation: false,
      errorCode: 'SAME_CLASS_SELECTED',
      title,
      message,
      errorTitle: title,
      errorMessage: message
    };
  }

  return { valid: true, isGraduation: false };
}

/**
 * Generates an official School Testimonial record for a graduating Year 12 student,
 * signed with 'GRADUATED' and marked as sealed.
 */
export function generateStudentTestimonialRecord(params: {
  student: Student;
  schoolProfile?: import('../types/index').SchoolProfile;
  schoolName?: string;
  schoolAddress?: string;
  schoolLogoUrl?: string;
  principalName?: string;
  sectionName?: string;
  sessionName: string;
  subjectsStudied: string[];
  cumulativeAvgPct: number;
  finalGrade: string;
  enteredInClass?: string;
  entryYear?: string;
  graduationYear?: string;
  issueDate?: string;
}): StudentTestimonial {
  const {
    student,
    schoolProfile,
    schoolName = schoolProfile?.name || 'Sample School',
    schoolAddress = schoolProfile?.address || 'VICTORIA DISTRICT, KADUNA',
    schoolLogoUrl = schoolProfile?.logoUrl,
    principalName = schoolProfile?.principalName || 'Principal',
    sectionName = 'YEAR 12 (S.S.C. THREE)',
    sessionName,
    subjectsStudied,
    cumulativeAvgPct,
    finalGrade,
    enteredInClass = 'YEAR 7 (J.S.S. ONE)',
    entryYear = '2021',
    graduationYear = sessionName.split('/')[1]
      ? sessionName.split('/')[1].length === 2
        ? `20${sessionName.split('/')[1]}`
        : sessionName.split('/')[1]
      : '2027',
    issueDate = schoolProfile?.reportDate || new Date().toLocaleDateString('en-GB')
  } = params;

  let academicAbility = 'GOOD';
  if (cumulativeAvgPct >= 75 || finalGrade === 'A' || finalGrade === 'A1' || finalGrade === 'B1') {
    academicAbility = 'EXCELLENT';
  } else if (cumulativeAvgPct >= 65 || finalGrade.startsWith('B')) {
    academicAbility = 'VERY GOOD';
  } else if (cumulativeAvgPct >= 50 || finalGrade.startsWith('C')) {
    academicAbility = 'GOOD';
  } else {
    academicAbility = 'AVERAGE';
  }

  const finalSubjects =
    subjectsStudied.length > 0
      ? subjectsStudied
      : [
          'ENGLISH LANGUAGE',
          'MATHEMATICS',
          'CIVIC EDUCATION',
          'BIOLOGY',
          'ECONOMICS',
          'CHEMISTRY',
          'PHYSICS',
          'GOVERNMENT',
          'LITERATURE IN ENGLISH'
        ];

  return {
    id: `testim-${student.id}-${Date.now()}`,
    studentId: student.id,
    studentName: student.fullName,
    examNumber: student.admissionNumber,
    examOrAdmissionNo: student.admissionNumber,
    schoolName,
    schoolAddress,
    schoolLogoUrl,
    fromYear: entryYear,
    toYear: graduationYear,
    entryYear,
    graduationYear,
    enteredClass: enteredInClass,
    enteredInClass,
    leftClass: sectionName.toUpperCase().includes('12') ? 'S.S.C. THREE (YEAR 12)' : sectionName,
    leftInClass: sectionName.toUpperCase().includes('12') ? 'S.S.C. THREE (YEAR 12)' : sectionName,
    subjectsStudied: finalSubjects,
    academicAbility,
    coCurricularActivities: 'VERY GOOD',
    postOfResponsibility: 'NIL',
    postOfResponsibilityHeld: 'NIL',
    remarksOnAttitude: 'SATISFACTORY',
    generalRemarks: 'SATISFACTORY',
    principalName,
    issueDate,
    graduatedSessionName: sessionName,
    sessionName,
    cumulativeAvgPct,
    finalGrade,
    recordSignature: 'GRADUATED',
    isSealed: true,
    createdAt: new Date().toISOString()
  };
}

/**
 * Default Academic Departments with assigned Heads of Department (HODs) and subject mappings.
 */
export const DEFAULT_ACADEMIC_DEPARTMENTS: import('../types/index').AcademicDepartment[] = [
  {
    id: 'dept-sciences-math',
    name: 'Department of Sciences & Mathematics',
    code: 'DEPT-SCI',
    hodTeacherId: 11,
    hodTeacherName: 'Class Teacher 9',
    hodUsername: 'class.teacher.9',
    subjectIds: [1, 3, 6, 8, 9, 13, 14, 15], // Mathematics, Intermediate Science, Digital Tech, Biology, Chemistry, Physics, Further Math, Health Ed
    description: 'Oversees Sciences, Mathematics, and Digital Technology lesson notes, schemes of work, and exam moderations.',
    createdByRole: 'SUPER_ADMIN',
    createdByName: 'Administrator',
    createdAt: '2026-10-01T08:00:00.000Z'
  },
  {
    id: 'dept-languages-humanities',
    name: 'Department of Languages & Humanities',
    code: 'DEPT-HUM',
    hodTeacherId: 4,
    hodTeacherName: 'Class Teacher 4',
    hodUsername: 'class.teacher.4',
    subjectIds: [2, 4, 5, 16, 17, 19], // English, Citizenship, Hausa, Literature, Government, C.R.S
    description: 'Oversees Languages, Literature, Humanities, and Civic curriculum files.',
    createdByRole: 'PRINCIPAL',
    createdByName: 'Mr. Tunde Bakare',
    createdAt: '2026-10-01T08:00:00.000Z'
  },
  {
    id: 'dept-business-vocational',
    name: 'Department of Business & Vocational Studies',
    code: 'DEPT-BUS',
    hodTeacherId: 1,
    hodTeacherName: 'Class Teacher 1',
    hodUsername: 'class.teacher.1',
    subjectIds: [7, 10, 11, 12, 18], // Business Studies, Economics, Catering Craft, Visual Art, Accounting
    description: 'Oversees Business, Commercial, and Vocational practical schemes and assessments.',
    createdByRole: 'VICE_PRINCIPAL',
    createdByName: 'Mr. Emmanuel Peters',
    createdAt: '2026-10-01T08:00:00.000Z'
  }
];

/**
 * Returns all AcademicDepartments where the given teacher is appointed as Head of Department (HOD).
 */
export function getDepartmentsForTeacher(
  teacherId: number | undefined | null,
  departments: import('../types/index').AcademicDepartment[],
  teacherUsername?: string,
  teacherFullName?: string
): import('../types/index').AcademicDepartment[] {
  if (!departments || departments.length === 0) return [];
  return departments.filter(d => {
    if (teacherId !== undefined && teacherId !== null && Number(d.hodTeacherId) === Number(teacherId)) {
      return true;
    }
    if (
      teacherUsername &&
      d.hodUsername &&
      d.hodUsername.trim().toLowerCase() === teacherUsername.trim().toLowerCase()
    ) {
      return true;
    }
    if (
      teacherFullName &&
      d.hodTeacherName &&
      d.hodTeacherName.trim().toLowerCase() === teacherFullName.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Resolves the HOD designation badge, office title, and assigned department subject IDs for a teacher.
 */
export function getTeacherHodDesignation(
  teacherId: number | undefined | null,
  departments: import('../types/index').AcademicDepartment[],
  teacherUsername?: string,
  teacherFullName?: string
): {
  isHod: boolean;
  badgeText: string | null;
  designationBadge: string | null;
  officeTitle: string | null;
  departments: import('../types/index').AcademicDepartment[];
  hodSubjectIds: number[];
} {
  const matched = getDepartmentsForTeacher(teacherId, departments, teacherUsername, teacherFullName);
  if (matched.length === 0) {
    return {
      isHod: false,
      badgeText: null,
      designationBadge: null,
      officeTitle: null,
      departments: [],
      hodSubjectIds: []
    };
  }

  const deptNames = matched.map(d => d.name).join(' & ');
  const subjectSet = new Set<number>();
  for (const d of matched) {
    for (const sId of d.subjectIds || []) {
      subjectSet.add(Number(sId));
    }
  }

  const label = `Head of Department (${deptNames})`;

  return {
    isHod: true,
    badgeText: label,
    designationBadge: label,
    officeTitle: `HOD's Office — ${deptNames}`,
    departments: matched,
    hodSubjectIds: Array.from(subjectSet)
  };
}

/**
 * Finds the AcademicDepartment responsible for a given subject ID.
 */
export function getDepartmentForSubject(
  subjectId: number,
  departments: import('../types/index').AcademicDepartment[]
): import('../types/index').AcademicDepartment | undefined {
  return departments.find(d => (d.subjectIds || []).some(id => Number(id) === Number(subjectId)));
}
