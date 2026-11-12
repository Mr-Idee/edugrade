/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GradingScale,
  LevelType,
  CommentBankItem,
  RemarkType,
  GradingScaleBand,
  GradingScalePreset
} from '../types/index';

export const SENIOR_GRADING_SCALES: GradingScale[] = [
  { id: 1, levelType: 'SENIOR', grade: 'A', minScore: 85.0, maxScore: 100.0, description: 'Excellent', gpaPoint: 4.0, colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 2, levelType: 'SENIOR', grade: 'B1', minScore: 80.0, maxScore: 84.99, description: 'Very Good', gpaPoint: 3.5, colorClass: 'bg-blue-100 text-blue-800 border-blue-300' },
  { id: 3, levelType: 'SENIOR', grade: 'B2', minScore: 75.0, maxScore: 79.99, description: 'Very Good', gpaPoint: 3.25, colorClass: 'bg-sky-100 text-sky-800 border-sky-300' },
  { id: 4, levelType: 'SENIOR', grade: 'C4', minScore: 70.0, maxScore: 74.99, description: 'Good (Credit)', gpaPoint: 3.0, colorClass: 'bg-teal-100 text-teal-800 border-teal-300' },
  { id: 5, levelType: 'SENIOR', grade: 'C5', minScore: 65.0, maxScore: 69.99, description: 'Good (Credit)', gpaPoint: 2.75, colorClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 6, levelType: 'SENIOR', grade: 'C6', minScore: 60.0, maxScore: 64.99, description: 'Good (Credit)', gpaPoint: 2.5, colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { id: 7, levelType: 'SENIOR', grade: 'D', minScore: 55.0, maxScore: 59.99, description: 'Fair (Pass)', gpaPoint: 2.0, colorClass: 'bg-orange-100 text-orange-800 border-orange-300' },
  { id: 8, levelType: 'SENIOR', grade: 'E', minScore: 50.0, maxScore: 54.99, description: 'Fair (Pass)', gpaPoint: 1.5, colorClass: 'bg-stone-100 text-stone-800 border-stone-300' },
  { id: 9, levelType: 'SENIOR', grade: 'F', minScore: 0.0, maxScore: 49.99, description: 'Weak (Fail)', gpaPoint: 0.0, colorClass: 'bg-rose-100 text-rose-800 border-rose-300' }
];

export const JUNIOR_GRADING_SCALES: GradingScale[] = [
  { id: 10, levelType: 'JUNIOR', grade: 'A', minScore: 80.0, maxScore: 100.0, description: 'Excellent / Distinction', gpaPoint: 4.0, colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 11, levelType: 'JUNIOR', grade: 'B', minScore: 70.0, maxScore: 79.99, description: 'Very Good', gpaPoint: 3.0, colorClass: 'bg-blue-100 text-blue-800 border-blue-300' },
  { id: 12, levelType: 'JUNIOR', grade: 'C', minScore: 60.0, maxScore: 69.99, description: 'Good', gpaPoint: 2.5, colorClass: 'bg-teal-100 text-teal-800 border-teal-300' },
  { id: 13, levelType: 'JUNIOR', grade: 'D', minScore: 50.0, maxScore: 59.99, description: 'Fair', gpaPoint: 2.0, colorClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 14, levelType: 'JUNIOR', grade: 'E', minScore: 45.0, maxScore: 49.99, description: 'Pass', gpaPoint: 1.5, colorClass: 'bg-stone-100 text-stone-800 border-stone-300' },
  { id: 15, levelType: 'JUNIOR', grade: 'F', minScore: 0.0, maxScore: 44.99, description: 'Weak / Fail', gpaPoint: 0.0, colorClass: 'bg-rose-100 text-rose-800 border-rose-300' }
];

export const DEFAULT_GRADING_SCALE_PRESETS: GradingScalePreset[] = [
  {
    id: 'default-junior-scale',
    name: 'Official Junior Secondary Grading Scale (Default)',
    scope: 'JUNIOR',
    targetScope: 'JUNIOR',
    isDefault: true,
    isEnabledForReports: true,
    bands: JUNIOR_GRADING_SCALES.map(s => ({
      id: `jun-band-${s.grade}`,
      levelType: s.levelType,
      grade: s.grade,
      minScore: s.minScore,
      maxScore: s.maxScore,
      description: s.description,
      remark: s.description,
      gpaPoint: s.gpaPoint,
      colorClass: s.colorClass
    })),
    updatedAt: '2026-10-01T08:00:00.000Z'
  },
  {
    id: 'default-senior-scale',
    name: 'Official Senior Secondary Grading Scale (Default)',
    scope: 'SENIOR',
    targetScope: 'SENIOR',
    isDefault: true,
    isEnabledForReports: true,
    bands: SENIOR_GRADING_SCALES.map(s => ({
      id: `sen-band-${s.grade}`,
      levelType: s.levelType,
      grade: s.grade,
      minScore: s.minScore,
      maxScore: s.maxScore,
      description: s.description,
      remark: s.description,
      gpaPoint: s.gpaPoint,
      colorClass: s.colorClass
    })),
    updatedAt: '2026-10-01T08:00:00.000Z'
  },
  {
    id: 'default-custom-template-scale',
    name: 'Official Custom Report Template Scale (Default)',
    scope: 'CUSTOM_TEMPLATE',
    targetScope: 'CUSTOM_TEMPLATE',
    customTemplateId: 'ALL',
    isDefault: true,
    isEnabledForReports: true,
    bands: JUNIOR_GRADING_SCALES.map(s => ({
      id: `cust-band-${s.grade}`,
      levelType: s.levelType,
      grade: s.grade,
      minScore: s.minScore,
      maxScore: s.maxScore,
      description: s.description,
      remark: s.description,
      gpaPoint: s.gpaPoint,
      colorClass: s.colorClass
    })),
    updatedAt: '2026-10-01T08:00:00.000Z'
  }
];

/**
 * Resolves the active GradingScaleBand[] for a given level or custom report template.
 */
export function resolveActiveGradingScaleBands(
  paramsOrScope:
    | {
        levelType: LevelType;
        presets?: GradingScalePreset[];
        isCustomReport?: boolean;
        customTemplateId?: string;
      }
    | LevelType
    | 'CUSTOM_TEMPLATE',
  presetsArg?: GradingScalePreset[],
  customTemplateIdArg?: string
): GradingScaleBand[] {
  const isObjectParam = typeof paramsOrScope === 'object' && paramsOrScope !== null;
  const levelType: LevelType = isObjectParam
    ? paramsOrScope.levelType
    : paramsOrScope === 'SENIOR'
    ? 'SENIOR'
    : 'JUNIOR';
  const presets = isObjectParam ? paramsOrScope.presets : presetsArg;
  const isCustomReport = isObjectParam
    ? Boolean(paramsOrScope.isCustomReport)
    : paramsOrScope === 'CUSTOM_TEMPLATE';
  const customTemplateId = isObjectParam ? paramsOrScope.customTemplateId : customTemplateIdArg;

  if (presets && presets.length > 0) {
    if (isCustomReport) {
      // Match specific customTemplateId first, then 'ALL'
      const specificPreset = presets.find(
        p =>
          (p.targetScope || p.scope) === 'CUSTOM_TEMPLATE' &&
          p.isEnabledForReports &&
          customTemplateId &&
          p.customTemplateId === customTemplateId &&
          p.bands.length > 0
      );
      if (specificPreset) return specificPreset.bands;

      const globalCustomPreset = presets.find(
        p =>
          (p.targetScope || p.scope) === 'CUSTOM_TEMPLATE' &&
          p.isEnabledForReports &&
          (!p.customTemplateId || p.customTemplateId === 'ALL') &&
          p.bands.length > 0
      );
      if (globalCustomPreset) return globalCustomPreset.bands;
    }

    const levelPreset = presets.find(
      p => (p.targetScope || p.scope) === levelType && p.isEnabledForReports && p.bands.length > 0
    );
    if (levelPreset) return levelPreset.bands;
  }

  const fallback = levelType === 'SENIOR' ? SENIOR_GRADING_SCALES : JUNIOR_GRADING_SCALES;
  return fallback.map(s => ({
    id: `fallback-${s.grade}`,
    levelType: s.levelType,
    grade: s.grade,
    minScore: s.minScore,
    maxScore: s.maxScore,
    description: s.description,
    remark: s.description,
    gpaPoint: s.gpaPoint,
    colorClass: s.colorClass
  }));
}

/**
 * Calculates raw CA total from components
 */
export function calculateRawScore(scores: Array<number | null | undefined>): number {
  return scores.reduce((sum: number, val) => sum + (typeof val === 'number' && !isNaN(val) ? val : 0), 0);
}

/**
 * Calculates cumulative percentage scaled to 100
 * Cum 100 = (Total Raw / Max Possible) * 100
 */
export function calculateCumulativePercentage(rawScore: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  const pct = (rawScore / maxScore) * 100;
  return Number(pct.toFixed(1));
}

/**
 * Assigns grade based on percentage and class level scale (or an active custom grading scale override)
 */
export function determineGrade(
  percentage: number,
  levelType: LevelType,
  customScalesOverride?: Array<
    Pick<GradingScaleBand, 'grade' | 'minScore' | 'maxScore'> &
      Partial<Pick<GradingScaleBand, 'description' | 'gpaPoint' | 'colorClass'>> & {
        remark?: string;
      }
  >
): {
  grade: string;
  description: string;
  gpaPoint: number;
  colorClass: string;
} {
  const defaultScales = levelType === 'SENIOR' ? SENIOR_GRADING_SCALES : JUNIOR_GRADING_SCALES;
  const scales =
    customScalesOverride && customScalesOverride.length > 0
      ? [...customScalesOverride].sort((a, b) => b.maxScore - a.maxScore)
      : defaultScales;
  const clamped = Math.max(0, Math.min(100, percentage));

  for (const scale of scales) {
    if (clamped >= scale.minScore && clamped <= scale.maxScore) {
      return {
        grade: scale.grade,
        description: scale.description || (scale as any).remark || 'Pass',
        gpaPoint: scale.gpaPoint ?? 3.0,
        colorClass: scale.colorClass || 'text-indigo-700 bg-indigo-50 border-indigo-200'
      };
    }
  }

  // Fallback to lowest grade
  const lowest = scales[scales.length - 1];
  return {
    grade: lowest.grade,
    description: lowest.description || (lowest as any).remark || 'Fail',
    gpaPoint: lowest.gpaPoint ?? 0.0,
    colorClass: lowest.colorClass || 'text-rose-700 bg-rose-50 border-rose-200'
  };
}

export interface StudentSubjectScoreEntry {
  subjectId: number;
  subjectName: string;
  isIncluded: boolean;
  rawTotal: number;
  maxScore: number;
  cumulativePercentage: number;
  grade: string;
}

/**
 * Calculates student overall summary across all subjects
 * Core rule: ONLY subjects where isIncluded is true factor into cumulative score and denominator!
 */
export function calculateStudentOverallSummary(
  entries: StudentSubjectScoreEntry[],
  levelType: LevelType,
  customScalesOverride?: Array<Pick<GradingScaleBand, 'grade' | 'minScore' | 'maxScore' | 'description' | 'gpaPoint' | 'colorClass'>>
): {
  totalObtained: number;
  totalPossible: number;
  cumulativePercentage: number;
  overallGrade: string;
  gradeDescription: string;
  includedCount: number;
  excludedCount: number;
} {
  const includedEntries = entries.filter(e => e.isIncluded);
  const excludedEntries = entries.filter(e => !e.isIncluded);

  const totalObtained = Number(includedEntries.reduce((acc, curr) => acc + curr.rawTotal, 0).toFixed(1));
  const totalPossible = Number(includedEntries.reduce((acc, curr) => acc + curr.maxScore, 0).toFixed(1));

  const cumulativePercentage = totalPossible > 0
    ? Number(((totalObtained / totalPossible) * 100).toFixed(1))
    : 0;

  const gradeInfo = determineGrade(cumulativePercentage, levelType, customScalesOverride);

  return {
    totalObtained,
    totalPossible,
    cumulativePercentage,
    overallGrade: gradeInfo.grade,
    gradeDescription: gradeInfo.description,
    includedCount: includedEntries.length,
    excludedCount: excludedEntries.length
  };
}

/**
 * Computes ranks for a list of students based on cumulative percentage (descending)
 * Handles identical scores with standard competition ranking (e.g., 1, 2, 2, 4).
 */
export function calculateClassRanks(
  students: Array<{ studentId: number; cumulativePercentage: number }>
): Map<number, number> {
  const sorted = [...students].sort((a, b) => b.cumulativePercentage - a.cumulativePercentage);
  const rankMap = new Map<number, number>();

  let currentRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].cumulativePercentage === sorted[i - 1].cumulativePercentage) {
      rankMap.set(sorted[i].studentId, rankMap.get(sorted[i - 1].studentId)!);
    } else {
      currentRank = i + 1;
      rankMap.set(sorted[i].studentId, currentRank);
    }
  }

  return rankMap;
}

/**
 * Filters or recommends remarks from the Comment Bank based on grade band
 */
export function getRecommendedComments(
  grade: string,
  remarkType: RemarkType,
  commentBank: CommentBankItem[]
): string[] {
  // Normalize grades: for junior vs senior, B1/B2 maps to B, C4/C5/C6 maps to C
  const cleanGrade = grade.replace('Grade ', '').trim();
  const directMatches = commentBank
    .filter(c => c.remarkType === remarkType && c.grade.toUpperCase() === cleanGrade.toUpperCase())
    .map(c => c.commentText);

  if (directMatches.length > 0) {
    return directMatches;
  }

  // Broad fallback if specific grade not found (e.g. B1 fallback to B, C5 to C)
  const baseLetter = cleanGrade[0]?.toUpperCase() || 'C';
  const looseMatches = commentBank
    .filter(c => c.remarkType === remarkType && c.grade.startsWith(baseLetter))
    .map(c => c.commentText);

  if (looseMatches.length > 0) {
    return looseMatches;
  }

  // Default institutional remarks
  return [
    'Fair effort shown, but greater dedication is needed to improve.',
    'Satisfactory work. With more focus, higher grades are within reach.',
    'Good progress noted. Maintain focus and strive for higher academic rigor.',
    'Commendable performance, shows consistent dedication.'
  ];
}

/**
 * Returns rank with English ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
 */
export function formatRankOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

/**
 * Calculates end of term total: CA1 + CA2 + EXAM
 * Scales raw components into 100%
 */
export function calculateTermExamTotal(
  ca1Raw: number,
  ca1Max: number,
  ca2Raw: number,
  ca2Max: number,
  examRaw: number,
  examMax: number
): {
  totalObtained: number;
  totalPossible: number;
  scaledPercentage: number;
} {
  const totalObtained = Number((ca1Raw + ca2Raw + examRaw).toFixed(1));
  const totalPossible = Number((ca1Max + ca2Max + examMax).toFixed(1));
  const scaledPercentage = totalPossible > 0
    ? Number(((totalObtained / totalPossible) * 100).toFixed(1))
    : 0;

  return {
    totalObtained,
    totalPossible,
    scaledPercentage
  };
}

/**
 * Calculates annual cumulative average across First, Second, and Third terms
 * Formula: ((FIRST + SECOND + THIRD) / Included_Terms_Count)
 * Only included terms are factored in!
 */
export function calculateAnnualAverage(
  terms: Array<{ termId: number; percentage: number | null; isIncluded: boolean }>
): {
  yearlyAverage: number;
  includedTermsCount: number;
} {
  const activeTerms = terms.filter(t => t.isIncluded && t.percentage !== null && !isNaN(t.percentage));
  if (activeTerms.length === 0) {
    return { yearlyAverage: 0, includedTermsCount: 0 };
  }

  const sum = activeTerms.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
  const yearlyAverage = Number((sum / activeTerms.length).toFixed(1));

  return {
    yearlyAverage,
    includedTermsCount: activeTerms.length
  };
}

export interface MissingSubjectDetail {
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  missingComponents: string[];
  recordedTotal: number;
  maxPossible: number;
  status: 'NO_GRADE' | 'INCOMPLETE_COMPONENTS';
}

export interface StudentCompletenessAuditRow {
  studentId: number;
  admissionNumber: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE';
  includedSubjectsCount: number;
  completedSubjectsCount: number;
  missingSubjectsCount: number;
  includedSubjectNames: string[];
  missingSubjects: MissingSubjectDetail[];
  completionPercentage: number;
  isComplete: boolean;
}

/**
 * Audits all students in a class section to detect missing or incomplete subject results.
 * Lists each student, the number of subjects included, and the specific subjects with missing grades/components.
 */
export function auditClassStudentCompleteness(params: {
  students: Array<{ id: number; admissionNumber: string; fullName: string; gender: 'MALE' | 'FEMALE' }>;
  levelType: LevelType;
  applicableSubjects: Array<{ id: number; name: string; code: string }>;
  components: Array<{ id: number; shortCode: string; name: string; maxScore: number }>;
  enrollments: Array<{ studentId: number; subjectId: number; sectionId: number; isIncluded: boolean }>;
  scores: Array<{ studentId: number; subjectId: number; componentId: number; score: number | null }>;
  sectionId: number;
}): StudentCompletenessAuditRow[] {
  const {
    students,
    levelType,
    applicableSubjects,
    components,
    enrollments,
    scores,
    sectionId
  } = params;

  const maxSubjectScore = components.reduce((acc, c) => acc + c.maxScore, 0);

  return students.map(student => {
    const includedSubjectNames: string[] = [];
    const missingSubjects: MissingSubjectDetail[] = [];
    let completedSubjectsCount = 0;

    applicableSubjects.forEach(subject => {
      const enr = enrollments.find(
        e => e.studentId === student.id && e.subjectId === subject.id && e.sectionId === sectionId
      );
      const isIncluded = levelType === 'JUNIOR' ? true : (enr !== undefined ? enr.isIncluded : true);

      if (!isIncluded) return;

      includedSubjectNames.push(subject.name);

      const missingComponents: string[] = [];
      let recordedTotal = 0;

      components.forEach(comp => {
        const sc = scores.find(
          s => s.studentId === student.id && s.subjectId === subject.id && s.componentId === comp.id
        );
        const isEntered =
          sc !== undefined &&
          sc.score !== null &&
          sc.score !== undefined &&
          !Number.isNaN(Number(sc.score));

        if (!isEntered) {
          // Empty cell — score has not been entered at all
          missingComponents.push(comp.shortCode);
        } else {
          // 0 or any positive mark is a valid entered score
          recordedTotal += Number(sc.score);
        }
      });

      recordedTotal = Number(recordedTotal.toFixed(1));

      if (missingComponents.length === components.length) {
        missingSubjects.push({
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code,
          missingComponents: components.map(c => c.shortCode),
          recordedTotal: 0,
          maxPossible: maxSubjectScore,
          status: 'NO_GRADE'
        });
      } else if (missingComponents.length > 0) {
        missingSubjects.push({
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code,
          missingComponents,
          recordedTotal,
          maxPossible: maxSubjectScore,
          status: 'INCOMPLETE_COMPONENTS'
        });
      } else {
        completedSubjectsCount++;
      }
    });

    const includedSubjectsCount = includedSubjectNames.length;
    const missingSubjectsCount = missingSubjects.length;
    const completionPercentage = includedSubjectsCount > 0
      ? Number(((completedSubjectsCount / includedSubjectsCount) * 100).toFixed(1))
      : 100;

    return {
      studentId: student.id,
      admissionNumber: student.admissionNumber,
      fullName: student.fullName,
      gender: student.gender,
      includedSubjectsCount,
      completedSubjectsCount,
      missingSubjectsCount,
      includedSubjectNames,
      missingSubjects,
      completionPercentage,
      isComplete: missingSubjectsCount === 0
    };
  });
}

/**
 * Official Term CA & Exam Structure:
 * - JUNIOR:
 *   FIRST CA is 20 marks (DIVIDE TOTAL(40) BY 2)
 *   SECOND CA is 20 marks (DIVIDE TOTAL(40) BY 2)
 *   EXAM is 60 marks
 *   Term Total = First CA (20) + Second CA (20) + Exam (60) = 100
 * - SENIOR:
 *   FIRST CA is 15 marks (DIVIDE TOTAL(30) BY 2)
 *   SECOND CA is 15 marks (DIVIDE TOTAL(30) BY 2)
 *   EXAM is 70 marks
 *   Term Total = First CA (15) + Second CA (15) + Exam (70) = 100
 */
export interface LevelTermStructure {
  levelType: LevelType;
  rawCaMax: number; // 40 for JUNIOR, 30 for SENIOR
  ca1Max: number;   // 20 for JUNIOR, 15 for SENIOR
  ca2Max: number;   // 20 for JUNIOR, 15 for SENIOR
  examMax: number;  // 60 for JUNIOR, 70 for SENIOR
  termTotalMax: number; // 100
  ca1Header: string;
  ca2Header: string;
  examHeader: string;
  termTotalHeader: string;
}

/**
 * Formats the active term total column header:
 * "First Term Total", "Second Term Total", or "Third Term Total" depending on the active term.
 */
export function formatActiveTermTotalHeader(termName?: string): string {
  const clean = (termName || 'FIRST').trim().toUpperCase();
  if (clean.startsWith('SECOND') || clean === '2ND') {
    return 'Second Term Total';
  }
  if (clean.startsWith('THIRD') || clean === '3RD') {
    return 'Third Term Total';
  }
  return 'First Term Total';
}

export function getTermStructureForLevel(levelType: LevelType, termName?: string): LevelTermStructure {
  const activeTermTotalLabel = formatActiveTermTotalHeader(termName);
  if (levelType === 'JUNIOR') {
    return {
      levelType: 'JUNIOR',
      rawCaMax: 40,
      ca1Max: 20,
      ca2Max: 20,
      examMax: 60,
      termTotalMax: 100,
      ca1Header: 'FIRST CA (20)',
      ca2Header: 'SECOND CA (20)',
      examHeader: 'EXAM (60)',
      termTotalHeader: activeTermTotalLabel
    };
  }
  return {
    levelType: 'SENIOR',
    rawCaMax: 30,
    ca1Max: 15,
    ca2Max: 15,
    examMax: 70,
    termTotalMax: 100,
    ca1Header: 'FIRST CA (15)',
    ca2Header: 'SECOND CA (15)',
    examHeader: 'EXAM (70)',
    termTotalHeader: activeTermTotalLabel
  };
}

export interface ReportCardGradingScaleItem {
  id: string;
  gradeLabel: string;
  rangeText: string;
  description: string;
  grade: string;
  range: string;
  remark: string;
}

/**
 * Returns the Official Grading Scale items for the Report Card Sheet.
 * For SENIOR secondary, groups B1/B2 into "B" (Very Good) and C4/C5/C6 into "C" (Good)
 * so the grading scale is compact and grouped cleanly on a single line.
 * When a customized GradingScaleBand[] is provided, formats those custom bands (and still groups B1-B2 / C4-C6 if standard Senior grades are present).
 */
export function getReportCardGradingScaleDisplay(
  levelType: LevelType,
  customBandsOverride?: Array<Pick<GradingScaleBand, 'grade' | 'minScore' | 'maxScore' | 'description' | 'remark'>>
): ReportCardGradingScaleItem[] {
  const buildItem = (id: string, gradeLabel: string, rangeText: string, description: string): ReportCardGradingScaleItem => ({
    id,
    gradeLabel,
    rangeText,
    description,
    grade: gradeLabel,
    range: rangeText,
    remark: description
  });

  if (customBandsOverride && customBandsOverride.length > 0) {
    const sorted = [...customBandsOverride].sort((a, b) => b.maxScore - a.maxScore);
    const hasB1B2 = sorted.some(b => b.grade === 'B1') && sorted.some(b => b.grade === 'B2');
    const hasC4C6 = sorted.some(b => b.grade === 'C4') && sorted.some(b => b.grade === 'C6');

    if (levelType === 'SENIOR' && hasB1B2 && hasC4C6) {
      const bBands = sorted.filter(b => b.grade.startsWith('B'));
      const cBands = sorted.filter(b => b.grade.startsWith('C'));
      const bMin = Math.floor(Math.min(...bBands.map(b => b.minScore)));
      const bMax = Math.floor(Math.max(...bBands.map(b => b.maxScore)));
      const cMin = Math.floor(Math.min(...cBands.map(b => b.minScore)));
      const cMax = Math.floor(Math.max(...cBands.map(b => b.maxScore)));
      const result: ReportCardGradingScaleItem[] = [];
      let addedB = false;
      let addedC = false;
      for (const band of sorted) {
        const desc = band.description || band.remark || '';
        if (band.grade.startsWith('B')) {
          if (!addedB) {
            result.push(buildItem('sen-B', 'B (B1–B2)', `${bMin}–${bMax}%`, desc || 'Very Good'));
            addedB = true;
          }
        } else if (band.grade.startsWith('C')) {
          if (!addedC) {
            result.push(
              buildItem(
                'sen-C',
                'C (C4–C6)',
                `${cMin}–${cMax}%`,
                desc.replace(' (Credit)', '') || 'Good'
              )
            );
            addedC = true;
          }
        } else {
          result.push(
            buildItem(
              `sen-${band.grade}`,
              band.grade,
              `${Math.floor(band.minScore)}–${Math.floor(band.maxScore)}%`,
              desc || 'Pass'
            )
          );
        }
      }
      return result;
    }

    return sorted.map((scale, idx) =>
      buildItem(
        `custom-${scale.grade}-${idx}`,
        scale.grade,
        `${Math.floor(scale.minScore)}–${Math.floor(scale.maxScore)}%`,
        scale.description || scale.remark || 'Pass'
      )
    );
  }

  if (levelType === 'SENIOR') {
    return [
      buildItem('sen-A', 'A', '85–100%', 'Excellent'),
      buildItem('sen-B', 'B (B1–B2)', '75–84%', 'Very Good'),
      buildItem('sen-C', 'C (C4–C6)', '60–74%', 'Good'),
      buildItem('sen-D', 'D', '55–59%', 'Fair'),
      buildItem('sen-E', 'E', '50–54%', 'Pass'),
      buildItem('sen-F', 'F', '0–49%', 'Weak / Fail')
    ];
  }
  return JUNIOR_GRADING_SCALES.map(scale =>
    buildItem(
      `jun-${scale.grade}`,
      scale.grade,
      `${scale.minScore.toFixed(0)}–${scale.maxScore.toFixed(0)}%`,
      scale.description
    )
  );
}

/**
 * Auto-generates a remark from the Comment Bank matched to the student's grade.
 */
export function getAutoCommentForGrade(
  grade: string,
  remarkType: RemarkType,
  commentBank: CommentBankItem[],
  studentId = 0
): string {
  const candidates = getRecommendedComments(grade || 'C', remarkType, commentBank);
  if (candidates.length === 0) {
    return 'Satisfactory academic progress recorded for this term.';
  }
  const index = Math.abs(studentId) % candidates.length;
  return candidates[index];
}

export interface StudentPromotionEvaluation {
  studentId: number;
  firstTermPct: number;
  secondTermPct: number;
  thirdTermPct: number;
  cumulativeAvgPct: number;
  finalGrade: string;
  gradeDescription: string;
  group: 'ELIGIBLE' | 'REPEAT_OR_PROBATION';
  recommendedDecision: 'PROMOTED' | 'PROBATION' | 'REPEATED';
}

/**
 * Evaluates a student's 1st, 2nd, and 3rd term percentages to compute their
 * 3-term cumulative average, final grade, and promotion group:
 * - Grades A to D -> 'ELIGIBLE' (recommendedDecision: 'PROMOTED')
 * - Grades E or F -> 'REPEAT_OR_PROBATION' (recommendedDecision: 'PROBATION' for E, 'REPEATED' for F)
 * Gracefully handles blank/missing scores as 0 without errors.
 */
export function evaluateStudentPromotionEligibility(params: {
  studentId: number;
  levelType: LevelType;
  firstTermPct: number | null | undefined;
  secondTermPct: number | null | undefined;
  thirdTermPct: number | null | undefined;
}): StudentPromotionEvaluation {
  const { studentId, levelType, firstTermPct, secondTermPct, thirdTermPct } = params;
  const t1 = typeof firstTermPct === 'number' && !Number.isNaN(firstTermPct) ? Number(firstTermPct.toFixed(1)) : 0;
  const t2 = typeof secondTermPct === 'number' && !Number.isNaN(secondTermPct) ? Number(secondTermPct.toFixed(1)) : 0;
  const t3 = typeof thirdTermPct === 'number' && !Number.isNaN(thirdTermPct) ? Number(thirdTermPct.toFixed(1)) : 0;

  const validTerms = [firstTermPct, secondTermPct, thirdTermPct].filter(
    (v): v is number => typeof v === 'number' && !Number.isNaN(v) && v > 0
  );
  const cumulativeAvgPct =
    validTerms.length > 0
      ? Number((validTerms.reduce((acc, v) => acc + v, 0) / validTerms.length).toFixed(1))
      : Number(((t1 + t2 + t3) / 3).toFixed(1));

  const gradeInfo = determineGrade(cumulativeAvgPct, levelType);
  const cleanGrade = gradeInfo.grade.toUpperCase();
  const isRepeatOrProbation = cleanGrade === 'E' || cleanGrade === 'F';

  return {
    studentId,
    firstTermPct: t1,
    secondTermPct: t2,
    thirdTermPct: t3,
    cumulativeAvgPct,
    finalGrade: gradeInfo.grade,
    gradeDescription: gradeInfo.description,
    group: isRepeatOrProbation ? 'REPEAT_OR_PROBATION' : 'ELIGIBLE',
    recommendedDecision: cleanGrade === 'F' ? 'REPEATED' : cleanGrade === 'E' ? 'PROBATION' : 'PROMOTED'
  };
}

/**
 * Converts a raw CA component total (out of 40 for Junior or 30 for Senior) into the
 * official term CA score by dividing by 2 (20 for Junior, 15 for Senior).
 */
export function divideRawCaByTwo(rawCaTotal: number, levelType: LevelType): number {
  const { rawCaMax, ca1Max } = getTermStructureForLevel(levelType);
  const clampedRaw = Math.max(0, Math.min(rawCaMax, rawCaTotal));
  return Number(Math.min(ca1Max, clampedRaw / 2).toFixed(1));
}

/**
 * Calculates scaled CA1, CA2, Exam, Total (100), and Grade for a student's subject record.
 */
export function calculateOfficialTermRecord(
  levelType: LevelType,
  ca1ScoreInput: number,
  ca2ScoreInput: number,
  examScoreInput: number,
  options?: { ca1IsRaw?: boolean; ca2IsRaw?: boolean }
): {
  ca1RawScore: number;
  ca2RawScore: number;
  ca1Score: number;
  ca2Score: number;
  examScore: number;
  totalScore: number;
  grade: string;
  remark: string;
} {
  const structure = getTermStructureForLevel(levelType);
  const safeCa1 = typeof ca1ScoreInput === 'number' && !Number.isNaN(ca1ScoreInput) ? ca1ScoreInput : 0;
  const safeCa2 = typeof ca2ScoreInput === 'number' && !Number.isNaN(ca2ScoreInput) ? ca2ScoreInput : 0;
  const safeExam = typeof examScoreInput === 'number' && !Number.isNaN(examScoreInput) ? examScoreInput : 0;

  const ca1Score = options?.ca1IsRaw
    ? divideRawCaByTwo(safeCa1, levelType)
    : Number(Math.max(0, Math.min(structure.ca1Max, safeCa1)).toFixed(1));
  const ca2Score = options?.ca2IsRaw
    ? divideRawCaByTwo(safeCa2, levelType)
    : Number(Math.max(0, Math.min(structure.ca2Max, safeCa2)).toFixed(1));
  const ca1RawScore = options?.ca1IsRaw
    ? Number(Math.max(0, Math.min(structure.rawCaMax, safeCa1)).toFixed(1))
    : Number((ca1Score * 2).toFixed(1));
  const ca2RawScore = options?.ca2IsRaw
    ? Number(Math.max(0, Math.min(structure.rawCaMax, safeCa2)).toFixed(1))
    : Number((ca2Score * 2).toFixed(1));
  const examScore = Number(Math.max(0, Math.min(structure.examMax, safeExam)).toFixed(1));
  const totalScore = Number(Math.min(100, ca1Score + ca2Score + examScore).toFixed(1));
  const gradeInfo = determineGrade(totalScore, levelType);
  return {
    ca1RawScore,
    ca2RawScore,
    ca1Score,
    ca2Score,
    examScore,
    totalScore,
    grade: gradeInfo.grade,
    remark: gradeInfo.description
  };
}

/**
 * Formats the report card summary row before Student Overall Total:
 * Format: (Sum of scores + " over " + number of subjects * columnMax)
 */
export function formatColumnSumOverMax(
  sumOfScores: number,
  numberOfSubjects: number,
  columnMax: number
): string {
  const safeSum = typeof sumOfScores === 'number' && !Number.isNaN(sumOfScores) ? sumOfScores : 0;
  const formattedSum = Number(safeSum.toFixed(1));
  const totalPossible = Math.round(numberOfSubjects * columnMax);
  return `${formattedSum} over ${totalPossible}`;
}

export interface DuplicateStudentMember {
  id: number;
  admissionNumber: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE';
  currentSectionId: number;
  recordedEntriesCount: number;
  totalScoreSum: number;
}

export interface DuplicateStudentGroup {
  groupId: string;
  sectionId: number;
  sectionName: string;
  normalizedName: string;
  hasExactSameScores: boolean;
  scoreSignatureSummary: string;
  students: DuplicateStudentMember[];
}

export function normalizeStudentNameForComparison(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Builds a canonical deterministic score signature for a student so we can compare
 * whether two students in the same class have the exact same scores.
 */
export function buildStudentScoreSignature(
  studentId: number,
  scores: Array<{ studentId: number; subjectId: number; componentId: number; score: number | null }>,
  termSubjectRecords?: Array<{
    studentId: number;
    subjectId: number;
    termId: number;
    ca1Score: number;
    ca2Score: number;
    examScore: number;
    totalScore: number;
  }>
): { signature: string; recordedEntriesCount: number; totalScoreSum: number } {
  const studentCompScores = scores
    .filter(s => s.studentId === studentId && s.score !== null && s.score !== undefined && !Number.isNaN(Number(s.score)))
    .map(s => `C:${s.subjectId}:${s.componentId}=${Number(s.score).toFixed(2)}`)
    .sort();

  const studentTermRecs = (termSubjectRecords || [])
    .filter(r => r.studentId === studentId)
    .map(
      r =>
        `T:${r.termId}:${r.subjectId}=${Number(r.ca1Score || 0).toFixed(2)}/${Number(r.ca2Score || 0).toFixed(2)}/${Number(
          r.examScore || 0
        ).toFixed(2)}/${Number(r.totalScore || 0).toFixed(2)}`
    )
    .sort();

  const compSum = scores
    .filter(s => s.studentId === studentId && s.score !== null && s.score !== undefined && !Number.isNaN(Number(s.score)))
    .reduce((acc, s) => acc + Number(s.score), 0);

  const termSum = (termSubjectRecords || [])
    .filter(r => r.studentId === studentId)
    .reduce((acc, r) => acc + Number(r.totalScore || 0), 0);

  const combined = [...studentCompScores, ...studentTermRecs];
  return {
    signature: combined.join('|'),
    recordedEntriesCount: combined.length,
    totalScoreSum: Number((compSum + termSum).toFixed(1))
  };
}

/**
 * Detects duplicate students in the same class:
 * Students with the exact same name and exact same scores in the same class section.
 */
export function detectDuplicateStudents(params: {
  students: Array<{
    id: number;
    admissionNumber: string;
    fullName: string;
    gender: 'MALE' | 'FEMALE';
    currentSectionId: number;
  }>;
  classSections: Array<{ id: number; name: string }>;
  scores: Array<{ studentId: number; subjectId: number; componentId: number; score: number | null }>;
  termSubjectRecords?: Array<{
    studentId: number;
    subjectId: number;
    termId: number;
    ca1Score: number;
    ca2Score: number;
    examScore: number;
    totalScore: number;
  }>;
  sectionIdFilter?: number | 'ALL';
  strictExactScoresOnly?: boolean;
}): DuplicateStudentGroup[] {
  const {
    students,
    classSections,
    scores,
    termSubjectRecords = [],
    sectionIdFilter = 'ALL',
    strictExactScoresOnly = true
  } = params;

  const sectionMap = new Map<number, string>();
  classSections.forEach(sec => sectionMap.set(sec.id, sec.name));

  const filteredStudents =
    sectionIdFilter === 'ALL'
      ? students
      : students.filter(st => st.currentSectionId === Number(sectionIdFilter));

  // Group by (sectionId + normalizedName)
  const bySectionAndName = new Map<string, typeof filteredStudents>();
  for (const st of filteredStudents) {
    const normName = normalizeStudentNameForComparison(st.fullName);
    if (!normName) continue;
    const key = `${st.currentSectionId}::${normName}`;
    const existing = bySectionAndName.get(key) || [];
    existing.push(st);
    bySectionAndName.set(key, existing);
  }

  const groups: DuplicateStudentGroup[] = [];

  for (const [key, sameNameList] of bySectionAndName.entries()) {
    if (sameNameList.length < 2) continue;

    const [secIdStr, normName] = key.split('::');
    const secId = Number(secIdStr);
    const secName = sectionMap.get(secId) || `Class #${secId}`;

    // Sub-group by score signature
    const byScoreSig = new Map<
      string,
      Array<{ student: (typeof sameNameList)[0]; recordedEntriesCount: number; totalScoreSum: number }>
    >();

    for (const st of sameNameList) {
      const sigInfo = buildStudentScoreSignature(st.id, scores, termSubjectRecords);
      const list = byScoreSig.get(sigInfo.signature) || [];
      list.push({
        student: st,
        recordedEntriesCount: sigInfo.recordedEntriesCount,
        totalScoreSum: sigInfo.totalScoreSum
      });
      byScoreSig.set(sigInfo.signature, list);
    }

    // Add groups where 2+ students share both exact name AND exact scores in the same class
    let addedExactScoreGroup = false;
    let subIdx = 0;
    for (const [, sigMembers] of byScoreSig.entries()) {
      if (sigMembers.length >= 2) {
        addedExactScoreGroup = true;
        subIdx++;
        const first = sigMembers[0];
        const summary =
          first.recordedEntriesCount > 0
            ? `Identical name & identical scores across ${first.recordedEntriesCount} score entry/entries (Sum: ${first.totalScoreSum})`
            : 'Identical name & identical unentered/blank score records in the same class';
        groups.push({
          groupId: `dup-${secId}-${normName.replace(/\s+/g, '_')}-${subIdx}`,
          sectionId: secId,
          sectionName: secName,
          normalizedName: normName,
          hasExactSameScores: true,
          scoreSignatureSummary: summary,
          students: sigMembers.map(m => ({
            id: m.student.id,
            admissionNumber: m.student.admissionNumber,
            fullName: m.student.fullName,
            gender: m.student.gender,
            currentSectionId: m.student.currentSectionId,
            recordedEntriesCount: m.recordedEntriesCount,
            totalScoreSum: m.totalScoreSum
          }))
        });
      }
    }

    // If strictExactScoresOnly is false and sameNameList had different scores, still surface them
    if (!strictExactScoresOnly && !addedExactScoreGroup) {
      const members: DuplicateStudentMember[] = sameNameList.map(st => {
        const sigInfo = buildStudentScoreSignature(st.id, scores, termSubjectRecords);
        return {
          id: st.id,
          admissionNumber: st.admissionNumber,
          fullName: st.fullName,
          gender: st.gender,
          currentSectionId: st.currentSectionId,
          recordedEntriesCount: sigInfo.recordedEntriesCount,
          totalScoreSum: sigInfo.totalScoreSum
        };
      });
      groups.push({
        groupId: `dup-name-${secId}-${normName.replace(/\s+/g, '_')}`,
        sectionId: secId,
        sectionName: secName,
        normalizedName: normName,
        hasExactSameScores: false,
        scoreSignatureSummary: 'Identical student name in the same class (different score entries)',
        students: members
      });
    }
  }

  return groups;
}

export interface TransferDuplicateConflict {
  sourceStudent: {
    id: number;
    fullName: string;
    admissionNumber: string;
    currentSectionId: number;
  };
  existingDestinationStudent: {
    id: number;
    fullName: string;
    admissionNumber: string;
    currentSectionId: number;
  };
  hasIdenticalScores: boolean;
}

/**
 * Checks if any student being moved/transferred from one arm to another already exists
 * in the destination class (matching exact normalized name or admission number).
 */
export function checkDuplicateStudentsOnTransfer(params: {
  studentIdsToTransfer: number[];
  destinationSectionId: number;
  students: Array<{
    id: number;
    admissionNumber: string;
    fullName: string;
    gender: 'MALE' | 'FEMALE';
    currentSectionId: number;
  }>;
  scores?: Array<{ studentId: number; subjectId: number; componentId: number; score: number | null }>;
  termSubjectRecords?: Array<{
    studentId: number;
    subjectId: number;
    termId: number;
    ca1Score: number;
    ca2Score: number;
    examScore: number;
    totalScore: number;
  }>;
}): {
  hasDuplicates: boolean;
  conflicts: TransferDuplicateConflict[];
  safeStudentIds: number[];
} {
  const {
    studentIdsToTransfer,
    destinationSectionId,
    students,
    scores = [],
    termSubjectRecords = []
  } = params;

  const destinationStudents = students.filter(
    st => st.currentSectionId === Number(destinationSectionId)
  );

  const conflicts: TransferDuplicateConflict[] = [];
  const safeStudentIds: number[] = [];

  for (const sourceId of studentIdsToTransfer) {
    const sourceStudent = students.find(st => st.id === Number(sourceId));
    if (!sourceStudent) continue;

    const sourceNormName = normalizeStudentNameForComparison(sourceStudent.fullName);
    const sourceAdm = (sourceStudent.admissionNumber || '').trim().toUpperCase();

    const matchedExisting = destinationStudents.find(dest => {
      if (dest.id === sourceStudent.id) return false;
      const destNormName = normalizeStudentNameForComparison(dest.fullName);
      const destAdm = (dest.admissionNumber || '').trim().toUpperCase();
      return (
        (sourceNormName && destNormName === sourceNormName) ||
        (sourceAdm && destAdm === sourceAdm)
      );
    });

    if (matchedExisting) {
      const srcSig = buildStudentScoreSignature(sourceStudent.id, scores, termSubjectRecords);
      const destSig = buildStudentScoreSignature(matchedExisting.id, scores, termSubjectRecords);
      conflicts.push({
        sourceStudent: {
          id: sourceStudent.id,
          fullName: sourceStudent.fullName,
          admissionNumber: sourceStudent.admissionNumber,
          currentSectionId: sourceStudent.currentSectionId
        },
        existingDestinationStudent: {
          id: matchedExisting.id,
          fullName: matchedExisting.fullName,
          admissionNumber: matchedExisting.admissionNumber,
          currentSectionId: matchedExisting.currentSectionId
        },
        hasIdenticalScores: srcSig.signature === destSig.signature
      });
    } else {
      safeStudentIds.push(sourceStudent.id);
    }
  }

  return {
    hasDuplicates: conflicts.length > 0,
    conflicts,
    safeStudentIds
  };
}

export type StudentSortMode = 'AZ' | 'ZA' | 'ADM_ASC' | 'ADM_DESC' | 'DEFAULT';

/**
 * Sorts and arranges students in the Assessment Grid and Term Registry alphabetically
 * (A -> Z or Z -> A) or by Admission Number, using natural case-insensitive collation.
 */
export function sortStudentsForGridAndRegistry<
  T extends { id: number; fullName: string; admissionNumber?: string }
>(students: T[], sortMode: StudentSortMode = 'AZ'): T[] {
  if (!Array.isArray(students) || students.length <= 1 || sortMode === 'DEFAULT') {
    return [...(students || [])];
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const copy = [...students];

  copy.sort((a, b) => {
    const nameA = (a.fullName || '').trim();
    const nameB = (b.fullName || '').trim();
    const admA = (a.admissionNumber || '').trim();
    const admB = (b.admissionNumber || '').trim();

    if (sortMode === 'AZ') {
      const cmp = collator.compare(nameA, nameB);
      return cmp !== 0 ? cmp : collator.compare(admA, admB);
    }
    if (sortMode === 'ZA') {
      const cmp = collator.compare(nameB, nameA);
      return cmp !== 0 ? cmp : collator.compare(admB, admA);
    }
    if (sortMode === 'ADM_ASC') {
      const cmp = collator.compare(admA, admB);
      return cmp !== 0 ? cmp : collator.compare(nameA, nameB);
    }
    if (sortMode === 'ADM_DESC') {
      const cmp = collator.compare(admB, admA);
      return cmp !== 0 ? cmp : collator.compare(nameA, nameB);
    }
    return 0;
  });

  return copy;
}

/**
 * Resolves all sub-component scores (CW, QZ, ASS, PJ, TEST) for CA1 and CA2 when
 * the user clicks "Expand CW/QZ/ASS/TEST" in the Assessment Grid & Term Registry.
 *
 * Ensures that:
 * 1. Explicitly stored sub-scores in `storedDetails` are preserved (including 0).
 * 2. For CA1, any component entered in the CA1 Assessment Grid or via Bulk CSV Import
 *    (`gridScoresByCode`) is automatically merged so it never shows `-` when a score exists.
 * 3. If a record has a positive CA total (`rawCaScore` or `scaledCaScore`) without individual
 *    component breakdown, the breakdown is derived proportionally across the level's component weights.
 */
export function resolveExpandedCaComponentScores(params: {
  caType: 'ca1' | 'ca2';
  levelType: LevelType;
  storedDetails?: {
    cw?: number | null;
    qz?: number | null;
    ass?: number | null;
    pj?: number | null;
    test?: number | null;
  } | null;
  gridScoresByCode?: Record<string, number | null | undefined>;
  rawCaScore?: number | null;
  scaledCaScore?: number | null;
}): {
  cw: number | null;
  qz: number | null;
  ass: number | null;
  pj: number | null | undefined;
  test: number | null;
} {
  const { caType, levelType, storedDetails, gridScoresByCode, rawCaScore, scaledCaScore } = params;
  const isSenior = levelType === 'SENIOR';

  const pickValidNumber = (...candidates: Array<number | null | undefined>): number | null => {
    for (const val of candidates) {
      if (val !== null && val !== undefined && !Number.isNaN(Number(val))) {
        return Number(val);
      }
    }
    return null;
  };

  const gridLookup = (code: string): number | null => {
    if (caType !== 'ca1' || !gridScoresByCode) return null;
    const upper = code.toUpperCase();
    const direct = gridScoresByCode[upper] ?? gridScoresByCode[code.toLowerCase()];
    if (direct !== null && direct !== undefined && !Number.isNaN(Number(direct))) {
      return Number(direct);
    }
    return null;
  };

  let cw = pickValidNumber(storedDetails?.cw, gridLookup('CW'));
  let qz = pickValidNumber(storedDetails?.qz, gridLookup('QZ'));
  let ass = pickValidNumber(storedDetails?.ass, gridLookup('ASS'));
  let pj: number | null | undefined = isSenior
    ? undefined
    : pickValidNumber(storedDetails?.pj, gridLookup('PJ'));
  let test = pickValidNumber(storedDetails?.test, gridLookup('TEST'));

  const hasAnyExplicitComponent =
    cw !== null ||
    qz !== null ||
    ass !== null ||
    (!isSenior && pj !== null && pj !== undefined) ||
    test !== null;

  if (!hasAnyExplicitComponent) {
    const effectiveRaw =
      rawCaScore !== null && rawCaScore !== undefined && Number(rawCaScore) > 0
        ? Number(rawCaScore)
        : scaledCaScore !== null && scaledCaScore !== undefined && Number(scaledCaScore) > 0
        ? Number((Number(scaledCaScore) * 2).toFixed(1))
        : 0;

    if (effectiveRaw > 0) {
      if (isSenior) {
        // Senior CA Max = 30 (CW: 2, ASS: 5, QZ: 3, TEST: 20)
        const clampedRaw = Math.min(30, Math.max(0, effectiveRaw));
        cw = Number(((clampedRaw / 30) * 2).toFixed(1));
        ass = Number(((clampedRaw / 30) * 5).toFixed(1));
        qz = Number(((clampedRaw / 30) * 3).toFixed(1));
        test = Number(Math.max(0, Math.min(20, clampedRaw - (cw + ass + qz))).toFixed(1));
      } else {
        // Junior CA Max = 40 (CW: 5, QZ: 5, ASS: 5, PJ: 5, TEST: 20)
        const clampedRaw = Math.min(40, Math.max(0, effectiveRaw));
        cw = Number(((clampedRaw / 40) * 5).toFixed(1));
        qz = Number(((clampedRaw / 40) * 5).toFixed(1));
        ass = Number(((clampedRaw / 40) * 5).toFixed(1));
        pj = Number(((clampedRaw / 40) * 5).toFixed(1));
        test = Number(Math.max(0, Math.min(20, clampedRaw - (cw + qz + ass + pj))).toFixed(1));
      }
    }
  }

  return {
    cw,
    qz,
    ass,
    pj,
    test
  };
}
