/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Student } from '../types/index';
import {
  calculateCumulativePercentage,
  determineGrade,
  getRecommendedComments,
  getAutoCommentForGrade,
  getReportCardGradingScaleDisplay,
  getTermStructureForLevel,
  formatColumnSumOverMax,
  resolveActiveGradingScaleBands
} from '../utils/academicCalculations';
import {
  averageAvailableScores,
  sortSubjectsByReportOrder
} from '../utils/reportCardCalculations';
import {
  canPrintOrDownload,
  resolveInstitutionLogoUrl,
  DEFAULT_INSTITUTION_LOGO_DATA_URI
} from '../utils/rbacAndAuth';
import {
  Printer,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  Calendar,
  Layers,
  Eye,
  EyeOff,
  Files,
  FileText,
  Lock,
  Award,
  Palette
} from 'lucide-react';
import { SchoolTestimonialModal } from './SchoolTestimonialModal';

const CUSTOM_COLOR_BAR_CLASSES: Record<string, string> = {
  EMERALD: 'bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-800 text-white',
  INDIGO: 'bg-gradient-to-r from-indigo-700 via-blue-600 to-indigo-800 text-white',
  AMBER: 'bg-gradient-to-r from-amber-600 via-orange-500 to-amber-700 text-white',
  ROSE: 'bg-gradient-to-r from-rose-700 via-pink-600 to-rose-800 text-white',
  PURPLE: 'bg-gradient-to-r from-purple-700 via-fuchsia-600 to-purple-800 text-white'
};

export const ReportCardView: React.FC = () => {
  const {
    schoolProfile,
    currentRole,
    currentSection,
    classSections,
    selectedSectionId,
    setSelectedSectionId,
    students,
    selectedStudentId,
    setSelectedStudentId,
    subjects,
    assessmentComponents,
    enrollments,
    scores,
    termSummaries,
    termSubjectRecords,
    commentBank,
    updateRemarks,
    currentTerm,
    setCurrentTerm,
    terms,
    activeReportType,
    setActiveReportType,
    includedTermsForAnnual,
    toggleAnnualTermInclusion,
    customReportTemplates,
    activeReportCardTemplateId,
    setActiveReportCardTemplateId,
    gradingScalePresets,
    reportCardSubjectOrder
  } = useApp();

  const [isPrintPreview, setIsPrintPreview] = useState(false);
  const [isBatchClassMode, setIsBatchClassMode] = useState(false);
  const [customRemarkEdits, setCustomRemarkEdits] = useState<Record<string, string>>({});
  const [testimonialModalStudent, setTestimonialModalStudent] = useState<Student | null>(null);

  // Enabled custom report cards
  const enabledCustomTemplates = useMemo(
    () => customReportTemplates.filter(t => t.enabledInReportTab),
    [customReportTemplates]
  );

  const activeCustomTemplate = useMemo(
    () =>
      activeReportCardTemplateId !== 'STANDARD'
        ? enabledCustomTemplates.find(t => t.id === activeReportCardTemplateId) || null
        : null,
    [activeReportCardTemplateId, enabledCustomTemplates]
  );

  // Filtered class sections when a custom report card is selected
  const visibleClassSections = useMemo(() => {
    if (!activeCustomTemplate) return classSections;
    const allowedIds =
      activeCustomTemplate.sectionIds && activeCustomTemplate.sectionIds.length > 0
        ? activeCustomTemplate.sectionIds
        : [activeCustomTemplate.sectionId];
    const filtered = classSections.filter(s => allowedIds.includes(s.id));
    return filtered.length > 0 ? filtered : classSections;
  }, [activeCustomTemplate, classSections]);

  // Ensure selectedSectionId belongs to visibleClassSections when switching to a custom report card
  React.useEffect(() => {
    if (
      visibleClassSections.length > 0 &&
      !visibleClassSections.some(s => s.id === selectedSectionId)
    ) {
      setSelectedSectionId(visibleClassSections[0].id);
    }
  }, [visibleClassSections, selectedSectionId, setSelectedSectionId]);

  const isAllowedToPrint = canPrintOrDownload(currentRole);

  const activeScaleBands = useMemo(
    () =>
      resolveActiveGradingScaleBands({
        levelType: currentSection.levelType,
        presets: gradingScalePresets,
        isCustomReport: Boolean(activeCustomTemplate),
        customTemplateId: activeCustomTemplate?.id
      }),
    [currentSection.levelType, gradingScalePresets, activeCustomTemplate]
  );

  const activeClassGradingScale = useMemo(
    () => getReportCardGradingScaleDisplay(currentSection.levelType, activeScaleBands),
    [currentSection.levelType, activeScaleBands]
  );
  // Logo on the report card is imported strictly from Master Settings logo upload
  const resolvedLogoSrc = resolveInstitutionLogoUrl(schoolProfile.logoUrl);

  const sectionStudents = useMemo(() => {
    return students.filter(st => st.currentSectionId === selectedSectionId);
  }, [students, selectedSectionId]);

  const activeStudent = useMemo(() => {
    const found = sectionStudents.find(s => s.id === selectedStudentId);
    return found || sectionStudents[0] || students[0];
  }, [sectionStudents, selectedStudentId, students]);

  React.useEffect(() => {
    if (activeStudent && activeStudent.id !== selectedStudentId) {
      setSelectedStudentId(activeStudent.id);
    }
  }, [activeStudent, selectedStudentId, setSelectedStudentId]);

  const isSenior = currentSection.levelType === 'SENIOR';
  const termStructure = useMemo(
    () => getTermStructureForLevel(currentSection.levelType, currentTerm.name),
    [currentSection.levelType, currentTerm.name]
  );

  const maxCa = useMemo(() => {
    const comps = assessmentComponents.filter(
      c => c.levelType === currentSection.levelType && c.termId === currentTerm.id
    );
    const sum = comps.reduce((acc, c) => acc + c.maxScore, 0);
    return sum > 0 ? sum : (isSenior ? 30.0 : 40.0);
  }, [assessmentComponents, currentSection.levelType, currentTerm.id, isSenior]);

  // Active CA components for this class level
  const activeComponents = useMemo(() => {
    return assessmentComponents.filter(
      c => c.levelType === currentSection.levelType && c.termId === currentTerm.id
    );
  }, [assessmentComponents, currentSection.levelType, currentTerm.id]);

  // Applicable subjects
  const applicableSubjects = useMemo(() => {
    const levelSubjects = subjects.filter(sub => {
      if (isSenior) {
        return sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH';
      } else {
        return sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH';
      }
    });
    return sortSubjectsByReportOrder(levelSubjects, currentSection.levelType, reportCardSubjectOrder);
  }, [subjects, isSenior, currentSection.levelType, reportCardSubjectOrder]);

  // Sorted included terms for cumulative calculation & dynamic columns
  const sortedIncludedTerms = useMemo(() => {
    return [...includedTermsForAnnual].sort((a, b) => a - b);
  }, [includedTermsForAnnual]);

  const currentStudentIndex = sectionStudents.findIndex(s => s.id === activeStudent?.id);

  const handlePrevStudent = () => {
    if (currentStudentIndex > 0) {
      setSelectedStudentId(sectionStudents[currentStudentIndex - 1].id);
    }
  };

  const handleNextStudent = () => {
    if (currentStudentIndex < sectionStudents.length - 1) {
      setSelectedStudentId(sectionStudents[currentStudentIndex + 1].id);
    }
  };

  const handlePrintSingleReport = () => {
    if (!isAllowedToPrint) return;
    setIsBatchClassMode(false);
    if (!activeStudent) return;
    const makeFilenamePart = (value: string) =>
      value
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    const reportTypeLabel = activeReportType.replace(/_/g, ' ').toLowerCase();
    const previousTitle = document.title;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    const filename = [
      activeStudent.fullName,
      currentTerm.name,
      schoolProfile.currentSession,
      reportTypeLabel
    ].map(makeFilenamePart).filter(Boolean).join('-');
    document.title = filename || previousTitle;
    window.addEventListener('afterprint', restoreTitle, { once: true });
    setTimeout(() => {
      try {
        window.print();
      } catch (error) {
        restoreTitle();
        throw error;
      }
    }, 100);
  };

  const handleBatchPrintEntireClass = () => {
    if (!isAllowedToPrint) return;
    setIsBatchClassMode(true);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const termShortLabel = (termId: number) => {
    if (termId === 1) return '1ST TERM (%)';
    if (termId === 2) return '2ND TERM (%)';
    return '3RD TERM (%)';
  };
  const formatOptionalScore = (score: number | null | undefined) =>
    score === null || score === undefined ? '—' : score.toFixed(1);

  // Helper to compute all transcript rows & totals for a given student from the central database
  const computeStudentReportData = (targetStudent: Student) => {
    const studentSummary = termSummaries.find(
      s => s.studentId === targetStudent.id && s.termId === currentTerm.id
    );

    const enrolledSubjectScores = applicableSubjects
      .map(sub => {
        const enr = enrollments.find(
          e =>
            e.studentId === targetStudent.id &&
            e.subjectId === sub.id &&
            e.sectionId === selectedSectionId
        );
        const isIncluded =
          currentSection.levelType === 'JUNIOR'
            ? true
            : enr !== undefined
            ? enr.isIncluded
            : true;

        const baseCompScores: Record<number, number | null> = {};

        activeComponents.forEach(comp => {
          const sc = scores.find(
            s =>
              s.studentId === targetStudent.id &&
              s.subjectId === sub.id &&
              s.componentId === comp.id
          );
          const val = sc?.score ?? null;
          baseCompScores[comp.id] = val;
        });

        const currentTermRec = termSubjectRecords.find(
          r =>
            r.studentId === targetStudent.id &&
            r.subjectId === sub.id &&
            r.termId === currentTerm.id
        );

        const compScores: Record<number, number | null> = {};
        let rawTotal = 0;

        activeComponents.forEach(comp => {
          const code = comp.shortCode.toUpperCase();
          const detailValue =
            code === 'CW' ? currentTermRec?.ca1Details?.cw :
            code === 'QZ' ? currentTermRec?.ca1Details?.qz :
            code === 'ASS' ? currentTermRec?.ca1Details?.ass :
            code === 'PJ' ? currentTermRec?.ca1Details?.pj :
            code === 'TEST' ? currentTermRec?.ca1Details?.test : undefined;
          const value =
            currentTermRec?.ca1Details && detailValue !== undefined && detailValue !== null
              ? Math.min(comp.maxScore, Number(detailValue.toFixed(1)))
              : baseCompScores[comp.id] ?? null;
          compScores[comp.id] = value;
          if (value !== null) rawTotal += value;
        });

        rawTotal = Number(rawTotal.toFixed(1));
        const hasCurrentCaScore = Object.values(compScores).some(value => value !== null);
        const cum100 = calculateCumulativePercentage(rawTotal, maxCa);
        const gradeInfo = determineGrade(cum100, currentSection.levelType, activeScaleBands);

        // Official Junior (20 + 20 + 60 = 100) and Senior (15 + 15 + 70 = 100) Term Record
        const ca1Max = termStructure.ca1Max; // 20 for Junior, 15 for Senior
        const ca2Max = termStructure.ca2Max; // 20 for Junior, 15 for Senior
        const examMax = termStructure.examMax; // 60 for Junior, 70 for Senior

        const ca1Scaled = currentTermRec
          ? Number(
              Math.min(
                ca1Max,
                currentTermRec.ca1Score > ca1Max
                  ? currentTermRec.ca1Score / 2
                  : currentTermRec.ca1Score
              ).toFixed(1)
            )
          : hasCurrentCaScore
          ? Number(Math.min(ca1Max, rawTotal / 2).toFixed(1))
          : null;

        const ca2Scaled = currentTermRec
          ? Number(
              Math.min(
                ca2Max,
                currentTermRec.ca2Score > ca2Max
                  ? currentTermRec.ca2Score / 2
                  : currentTermRec.ca2Score
              ).toFixed(1)
            )
          : null;

        const examScaled = currentTermRec
          ? Number(Math.min(examMax, currentTermRec.examScore).toFixed(1))
          : null;

        const termTotal100 =
          currentTermRec && ca1Scaled !== null && ca2Scaled !== null && examScaled !== null
            ? Number(Math.min(100, ca1Scaled + ca2Scaled + examScaled).toFixed(1))
            : null;
        const termGradeInfo =
          termTotal100 === null
            ? null
            : determineGrade(termTotal100, currentSection.levelType, activeScaleBands);

        const examRec = {
          ca1Score: ca1Scaled,
          ca2Score: ca2Scaled,
          examScore: examScaled,
          totalScore: termTotal100,
          grade: termGradeInfo?.grade ?? '',
          remark: termGradeInfo?.description ?? ''
        };

        const recTerm1 = termSubjectRecords.find(
          r => r.studentId === targetStudent.id && r.subjectId === sub.id && r.termId === 1
        );
        const recTerm2 = termSubjectRecords.find(
          r => r.studentId === targetStudent.id && r.subjectId === sub.id && r.termId === 2
        );
        const recTerm3 = termSubjectRecords.find(
          r => r.studentId === targetStudent.id && r.subjectId === sub.id && r.termId === 3
        );

        const getTermCaPercentage = (termId: number) => {
          const record =
            termId === 1 ? recTerm1 : termId === 2 ? recTerm2 : recTerm3;
          const caDetails = record?.ca1Details;
          const hasCaDetails = Boolean(
            caDetails &&
            Object.values(caDetails).some(value => value !== null && value !== undefined)
          );
          if (
            record &&
            (hasCaDetails || (record.ca1RawScore ?? 0) > 0 || record.ca1Score > 0)
          ) {
            return calculateCumulativePercentage(
              record.ca1RawScore ?? record.ca1Score * 2,
              maxCa
            );
          }
          const termComponents = assessmentComponents.filter(
            component =>
              component.termId === termId &&
              component.levelType === currentSection.levelType
          );
          let scoreTotal = 0;
          let hasScore = false;
          for (const component of termComponents) {
            const score = scores.find(
              item =>
                item.studentId === targetStudent.id &&
                item.subjectId === sub.id &&
                item.componentId === component.id
            )?.score;
            if (score !== null && score !== undefined) {
              hasScore = true;
              scoreTotal += score;
            }
          }
          return hasScore ? calculateCumulativePercentage(scoreTotal, maxCa) : null;
        };

        const getTermScore = (termId: number): number | null => {
          if (activeReportType === 'MID_TERM') {
            if (termId === currentTerm.id) {
              return hasCurrentCaScore ? cum100 : null;
            }
            return getTermCaPercentage(termId);
          }
          const record =
            termId === 1 ? recTerm1 : termId === 2 ? recTerm2 : recTerm3;
          return record ? Number(record.totalScore.toFixed(1)) : null;
        };

        const termScoreMap: Record<number, number | null> = {
          1: getTermScore(1),
          2: getTermScore(2),
          3: getTermScore(3)
        };

        const selectedTermsAvg = averageAvailableScores(
          sortedIncludedTerms.map(tId => termScoreMap[tId])
        );
        const selectedTermsGrade = selectedTermsAvg === null
          ? null
          : determineGrade(selectedTermsAvg, currentSection.levelType, activeScaleBands);

        return {
          subject: sub,
          isIncluded,
          compScores,
          rawTotal,
          cum100,
          gradeInfo,
          examRec,
          term1Score: termScoreMap[1],
          term2Score: termScoreMap[2],
          term3Score: termScoreMap[3],
          termScoreMap,
          hasCurrentCaScore,
          selectedTermsAvg,
          selectedTermsGrade
        };
      })
      .filter(row => row.isIncluded);

    let rawSum = 0;
    let cum100Sum = 0;
    let ca1Sum = 0;
    let ca2Sum = 0;
    let examSum = 0;
    let examTotalSum = 0;
    let caDataCount = 0;
    let ca1DataCount = 0;
    let ca2DataCount = 0;
    let examDataCount = 0;
    let examTotalCount = 0;
    let selectedTermsCount = 0;
    const compSums: Record<number, number> = {};
    const compCounts: Record<number, number> = {};
    const termSums: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const termCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    let selectedCumulativeSum = 0;

    activeComponents.forEach(c => {
      compSums[c.id] = 0;
      compCounts[c.id] = 0;
    });

    enrolledSubjectScores.forEach(row => {
      if (row.hasCurrentCaScore) {
        rawSum += row.rawTotal;
        cum100Sum += row.cum100;
        caDataCount += 1;
      }
      if (row.examRec.ca1Score !== null) {
        ca1Sum += row.examRec.ca1Score;
        ca1DataCount += 1;
      }
      if (row.examRec.ca2Score !== null) {
        ca2Sum += row.examRec.ca2Score;
        ca2DataCount += 1;
      }
      if (row.examRec.examScore !== null) {
        examSum += row.examRec.examScore;
        examDataCount += 1;
      }
      if (row.examRec.totalScore !== null) {
        examTotalSum += row.examRec.totalScore;
        examTotalCount += 1;
      }
      for (const termId of [1, 2, 3]) {
        const score = row.termScoreMap[termId];
        if (score !== null) {
          termSums[termId] += score;
          termCounts[termId] += 1;
        }
      }
      if (row.selectedTermsAvg !== null) {
        selectedCumulativeSum += row.selectedTermsAvg;
        selectedTermsCount += 1;
      }

      activeComponents.forEach(c => {
        const score = row.compScores[c.id];
        if (score !== null) {
          compSums[c.id] += score;
          compCounts[c.id] += 1;
        }
      });
    });

    const subjectCount = enrolledSubjectScores.length;
    const maxTotalPossible = caDataCount * maxCa;
    const overallCum =
      maxTotalPossible > 0 ? Number(((rawSum / maxTotalPossible) * 100).toFixed(1)) : null;
    const overallSelectedCumAvg =
      selectedTermsCount > 0 ? Number((selectedCumulativeSum / selectedTermsCount).toFixed(1)) : null;
    const overallExamAvg =
      examTotalCount > 0 ? Number((examTotalSum / examTotalCount).toFixed(1)) : null;

    const termAvgs: Record<number, number | null> = {
      1: termCounts[1] > 0 ? Number((termSums[1] / termCounts[1]).toFixed(1)) : null,
      2: termCounts[2] > 0 ? Number((termSums[2] / termCounts[2]).toFixed(1)) : null,
      3: termCounts[3] > 0 ? Number((termSums[3] / termCounts[3]).toFixed(1)) : null
    };

    const grade =
      overallSelectedCumAvg === null
        ? ''
        : determineGrade(overallSelectedCumAvg, currentSection.levelType, activeScaleBands).grade;
    const examGrade =
      overallExamAvg === null
        ? ''
        : determineGrade(overallExamAvg, currentSection.levelType, activeScaleBands).grade;

    const activeOverallGrade = activeReportType === 'EXAM_TERM' ? examGrade : grade;
    const principalRemarksOptions = getRecommendedComments(
      activeOverallGrade || 'C',
      'PRINCIPAL',
      commentBank
    );

    const autoGeneratedGradeComment = getAutoCommentForGrade(
      activeOverallGrade || 'C',
      'PRINCIPAL',
      commentBank,
      targetStudent.id
    );

    const remarkKey = `${targetStudent.id}-${currentTerm.id}-${activeReportType}-${activeOverallGrade}`;
    const remarkText =
      customRemarkEdits[remarkKey] !== undefined
        ? customRemarkEdits[remarkKey]
        : autoGeneratedGradeComment;

    return {
      enrolledSubjectScores,
      subjectCount,
      overallTotals: {
        rawSum: Number(rawSum.toFixed(1)),
        cum100Sum: Number(cum100Sum.toFixed(1)),
        ca1Sum: Number(ca1Sum.toFixed(1)),
        ca2Sum: Number(ca2Sum.toFixed(1)),
        examSum: Number(examSum.toFixed(1)),
        examTotalSum: Number(examTotalSum.toFixed(1)),
        termSums,
        termCounts,
        caDataCount,
        ca1DataCount,
        ca2DataCount,
        examDataCount,
        examTotalCount,
        selectedTermsCount,
        selectedCumulativeSum: Number(selectedCumulativeSum.toFixed(1)),
        compSums,
        compCounts,
        maxTotalPossible,
        overallCum,
        overallSelectedCumAvg,
        overallExamAvg,
        termAvgs,
        grade,
        examGrade
      },
      activeOverallGrade,
      principalRemarksOptions,
      remarkText
    };
  };

  // Render a single student's official report card sheet
  const renderStudentTranscriptSheet = (
    student: Student,
    index: number,
    totalInBatch: number
  ) => {
    const {
      enrolledSubjectScores,
      subjectCount,
      overallTotals,
      activeOverallGrade,
      principalRemarksOptions,
      remarkText
    } = computeStudentReportData(student);

    const isLastInBatch = index === totalInBatch - 1;
    const customCols = activeCustomTemplate?.columns || [];
    const customMaxTotalPerSub = customCols.reduce((a, c) => a + (Number(c.maxScore) || 0), 0) || 100;

    return (
      <div
        key={student.id}
        data-testid={index === 0 ? 'printable-report-sheet' : `printable-report-sheet-${student.id}`}
        className={`max-w-4xl mx-auto bg-white border border-slate-400 shadow-xl overflow-hidden print:border-none print:shadow-none print:m-0 print:p-0 print:max-w-none text-slate-900 font-sans ${
          !isLastInBatch ? 'print-page-break mb-8 print:mb-0' : ''
        }`}
      >
        {/* Distinctive Color Bar distinguishing Standard vs Custom Report Card */}
        <div
          data-testid={index === 0 ? 'report-card-format-color-bar' : undefined}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-between ${
            activeCustomTemplate
              ? CUSTOM_COLOR_BAR_CLASSES[activeCustomTemplate.colorBarTheme || 'EMERALD'] ||
                CUSTOM_COLOR_BAR_CLASSES.EMERALD
              : 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-amber-300'
          }`}
        >
          <span className="flex items-center space-x-2">
            <Palette className="w-3.5 h-3.5" />
            <span>
              {activeCustomTemplate
                ? `CUSTOM REPORT CARD: ${activeCustomTemplate.title}`
                : 'OFFICIAL REPORT CARD SHEET'}
            </span>
          </span>
          <span className="font-mono text-[11px]">
            {student.isRecordSealed
              ? `SIGNED: ${student.recordSignature || 'GRADUATED'} (SEALED)`
              : `${currentSection.name} • ${currentTerm.name} TERM`}
          </span>
        </div>

        {/* Batch Page Number Indicator (Hidden on Print) */}
        {totalInBatch > 1 && (
          <div className="bg-slate-900 text-white px-4 py-2 text-xs font-bold flex items-center justify-between print:hidden">
            <span>
              Batch Class Report Sheet — Student {index + 1} of {totalInBatch}: {student.fullName} ({student.admissionNumber})
            </span>
            <span className="px-2 py-0.5 rounded bg-indigo-600 text-[11px] font-mono">
              Print Page {index + 1} of {totalInBatch}
            </span>
          </div>
        )}

        {/* Outer Border Frame */}
        <div className="border-4 border-slate-900 m-3 p-4 sm:p-6 print:m-0 print:border-2 print:p-2">
          {/* Official School Crest (Imported from Master Settings Logo Upload) */}
          <div className="flex justify-center mb-1 print:mb-0">
            <img
              data-testid={index === 0 ? 'report-school-logo' : undefined}
              src={resolvedLogoSrc}
              alt={schoolProfile.name}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = DEFAULT_INSTITUTION_LOGO_DATA_URI;
              }}
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain mx-auto print:w-14 print:h-14"
            />
          </div>

          {/* School Name & Subheaders (Single-Line School Name) */}
          <div className="border border-slate-900 divide-y divide-slate-900 text-center font-bold">
            <div
              data-testid={index === 0 ? 'report-school-name' : undefined}
              className="py-1.5 px-3 text-lg sm:text-xl font-black uppercase tracking-wide whitespace-nowrap overflow-hidden text-ellipsis bg-white text-slate-950 leading-snug"
            >
              {schoolProfile.name}
            </div>
            <div className="py-1.5 px-2 text-xs sm:text-sm font-extrabold uppercase tracking-wide bg-white">
              {activeCustomTemplate
                ? `${activeCustomTemplate.title} — ${currentTerm.name} TERM`
                : activeReportType === 'MID_TERM'
                ? `${currentTerm.name} TERM — MID-TERM CONTINUOUS ASSESSMENT REPORT`
                : activeReportType === 'EXAM_TERM'
                ? `${currentTerm.name} TERM — END-OF-TERM EXAMINATION REPORT`
                : 'ANNUAL CUMULATIVE ACADEMIC TRANSCRIPT'}
            </div>
            <div className="py-1 px-2 text-xs uppercase flex justify-center space-x-12 bg-white font-bold">
              <span>TERM: {currentTerm.name} TERM</span>
              <span>YEAR: {schoolProfile.currentSession}</span>
            </div>
          </div>

          {/* Student & Class Row */}
          <div className="border-x border-b border-slate-900 px-4 py-1.5 flex flex-wrap justify-between text-xs font-bold uppercase bg-white">
            <div>
              <span>CLASS: </span>
              <span className="font-black">{currentSection.name}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span>NAME OF STUDENT: </span>
              <span className="font-black text-sm">{student.fullName}</span>
              {student.isRecordSealed && (
                <span className="px-2 py-0.5 rounded bg-emerald-900 text-white text-[10px] font-black">
                  SIGNED: {student.recordSignature || 'GRADUATED'}
                </span>
              )}
            </div>
          </div>

          {/* Table Header Bar */}
          <div
            data-testid={index === 0 ? 'report-assessment-summary-bar' : undefined}
            className="border-x border-b border-slate-900 px-4 py-1 text-center text-xs font-bold uppercase bg-slate-100"
          >
            {activeCustomTemplate
              ? `${activeCustomTemplate.title} (${currentTerm.name} TERM ASSESSMENT SUMMARY)`
              : activeReportType === 'MID_TERM'
              ? `${currentTerm.name} TERM FIRST C.A. SUMMARY`
              : activeReportType === 'EXAM_TERM'
              ? `${currentTerm.name} TERM ASSESSMENT SUMMARY`
              : `ANNUAL ACADEMIC CUMULATIVE SUMMARY (${sortedIncludedTerms
                  .map(t => `${t === 1 ? '1ST' : t === 2 ? '2ND' : '3RD'} TERM`)
                  .join(' + ')})`}
          </div>

          {/* The Academic Performance Table */}
          <div className="border-x border-b border-slate-900 overflow-x-auto">
            {activeCustomTemplate ? (
              <table
                data-testid={index === 0 ? 'custom-format-report-table' : undefined}
                className="w-full text-left border-collapse text-xs"
              >
                <thead>
                  <tr className="border-b border-slate-900 divide-x divide-slate-900 font-bold uppercase text-[10px] text-center bg-emerald-50/70">
                    <th className="py-2 px-1 w-8">S/N</th>
                    <th className="py-2 px-3 text-left min-w-[180px]">SUBJECT&apos;S NAME</th>
                    {customCols.map(col => (
                      <th key={col.id} className="py-2 px-2">
                        {col.header.includes(`(${col.maxScore})`) ? col.header : `${col.header} (${col.maxScore})`}
                      </th>
                    ))}
                    <th className="py-2 px-2 font-black normal-case">
                      {termStructure.termTotalHeader} ({customMaxTotalPerSub})
                    </th>
                    <th className="py-2 px-2 font-black">GRADE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-[13px]">
                  {enrolledSubjectScores.map((row, idx) => {
                    const customScoresMap = activeCustomTemplate.studentCustomScores || {};
                    const subCustom = customScoresMap[`${student.id}_${row.subject.id}`] || {};
                    const colVals = customCols.map(col => {
                      if (subCustom[col.id] !== undefined) return Number(subCustom[col.id]);
                      if (col.sourceKey === 'ca1') return row.examRec.ca1Score;
                      if (col.sourceKey === 'ca2') return row.examRec.ca2Score;
                      if (col.sourceKey === 'exam') return row.examRec.examScore;
                      return Number(col.defaultValue || 0);
                    });
                    const hasCustomScores = colVals.some(value => value !== null);
                    const rowSum = Number(
                      colVals.reduce<number>((total, value) => total + (value ?? 0), 0).toFixed(1)
                    );
                    const rowPct =
                      hasCustomScores && customMaxTotalPerSub > 0
                        ? Number(((rowSum / customMaxTotalPerSub) * 100).toFixed(1))
                        : null;
                    const rowGrade = rowPct === null
                      ? ''
                      : determineGrade(rowPct, currentSection.levelType, activeScaleBands).grade;
                    return (
                      <tr key={row.subject.id} className="divide-x divide-slate-900 font-medium">
                        <td className="py-1.5 px-1 text-center font-mono">{idx + 1}</td>
                        <td className="py-1.5 px-3 font-bold uppercase text-slate-900">
                          {row.subject.name}
                        </td>
                        {colVals.map((v, cIdx) => (
                          <td key={customCols[cIdx].id} className="py-1.5 px-2 text-center font-mono">
                            {formatOptionalScore(v)}
                          </td>
                        ))}
                        <td className="py-1.5 px-2 text-center font-mono font-black">
                          {hasCustomScores ? rowSum.toFixed(1) : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-center font-bold">{rowGrade}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-900 divide-x divide-slate-900 font-bold uppercase text-[10px] text-center bg-white">
                  <th className="py-2 px-1 w-8">S/N</th>
                  <th className="py-2 px-3 text-left min-w-[180px]">SUBJECT&apos;S NAME</th>

                  {/* Mode 1: Mid-Term CA Components */}
                  {activeReportType === 'MID_TERM' && (
                    <>
                      {activeComponents.map(c => (
                        <th key={c.id} className="py-2 px-2 w-14">
                          {c.shortCode} ({c.maxScore})
                        </th>
                      ))}
                      <th className="py-2 px-2 w-18 font-black">TOTAL CA ({maxCa})</th>
                      {sortedIncludedTerms.length === 1 &&
                      sortedIncludedTerms[0] === currentTerm.id ? (
                        <th className="py-2 px-2 w-20 font-black">CUM. 100</th>
                      ) : (
                        <>
                          {sortedIncludedTerms.map(tId => (
                            <th key={tId} className="py-2 px-2 w-20 bg-amber-50/40 font-black">
                              {termShortLabel(tId)}
                            </th>
                          ))}
                          <th className="py-2 px-2 w-22 font-black bg-indigo-50/40">
                            CUM. AVG (100)
                          </th>
                        </>
                      )}
                      <th className="py-2 px-2 w-16 font-black">GRADE</th>
                    </>
                  )}

                  {/* Mode 2: Exam Report (Official Junior 20+20+60=100 & Senior 15+15+70=100 Headings) */}
                  {activeReportType === 'EXAM_TERM' && (
                    <>
                      <th className="py-2 px-2 w-24" data-testid={index === 0 ? 'report-header-ca1' : undefined}>
                        {termStructure.ca1Header}
                      </th>
                      <th className="py-2 px-2 w-24" data-testid={index === 0 ? 'report-header-ca2' : undefined}>
                        {termStructure.ca2Header}
                      </th>
                      <th className="py-2 px-2 w-20" data-testid={index === 0 ? 'report-header-exam' : undefined}>
                        {termStructure.examHeader}
                      </th>
                      <th
                        className="py-2 px-2 w-28 font-black normal-case"
                        data-testid={index === 0 ? 'report-header-term-total' : undefined}
                      >
                        {termStructure.termTotalHeader}
                      </th>
                      {sortedIncludedTerms.length > 1 && (
                        <>
                          {sortedIncludedTerms.map(tId => (
                            <th key={tId} className="py-2 px-2 w-20 bg-amber-50/40 font-bold">
                              {termShortLabel(tId)}
                            </th>
                          ))}
                          <th className="py-2 px-2 w-22 font-black bg-indigo-50/40">
                            CUM. AVG (%)
                          </th>
                        </>
                      )}
                      <th className="py-2 px-2 w-16 font-black">GRADE</th>
                    </>
                  )}

                  {/* Mode 3: Annual Cumulative (Strictly shows ONLY checked Term columns) */}
                  {activeReportType === 'ANNUAL' && (
                    <>
                      {sortedIncludedTerms.map(tId => (
                        <th key={tId} className="py-2 px-2 w-24">
                          {termShortLabel(tId)}
                        </th>
                      ))}
                      <th className="py-2 px-2 w-28 font-black">CUMULATIVE AVG (%)</th>
                      <th className="py-2 px-2 w-16 font-black">GRADE</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-[13px]">
                {enrolledSubjectScores.map((row, idx) => {
                  return (
                    <tr
                      key={row.subject.id}
                      className="divide-x divide-slate-900 font-medium text-[13px]"
                    >
                      <td className="py-1.5 px-1 text-center font-mono text-[13px]">{idx + 1}</td>
                      <td className="py-1.5 px-3 font-bold uppercase text-slate-900 text-[13px]">
                        {row.subject.name}
                      </td>
                      {activeReportType === 'MID_TERM' && (
                        <>
                          {activeComponents.map(c => {
                            const val = row.compScores[c.id];
                            return (
                              <td key={c.id} className="py-1.5 px-2 text-center font-mono text-[13px]">
                                {formatOptionalScore(val)}
                              </td>
                            );
                          })}
                          <td className="py-1.5 px-2 text-center font-mono font-bold text-[13px]">
                            {row.hasCurrentCaScore ? row.rawTotal.toFixed(1) : '—'}
                          </td>
                          {sortedIncludedTerms.length === 1 &&
                          sortedIncludedTerms[0] === currentTerm.id ? (
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-[13px]">
                              {row.hasCurrentCaScore ? row.cum100.toFixed(1) : '—'}
                            </td>
                          ) : (
                            <>
                              {sortedIncludedTerms.map(tId => (
                                <td
                                  key={tId}
                                  className="py-1.5 px-2 text-center font-mono bg-amber-50/20 text-[13px]"
                                >
                                  {formatOptionalScore(row.termScoreMap[tId])}
                                </td>
                              ))}
                              <td className="py-1.5 px-2 text-center font-mono font-black bg-indigo-50/20 text-[13px]">
                                {formatOptionalScore(row.selectedTermsAvg)}
                              </td>
                            </>
                          )}
                          <td className="py-1.5 px-2 text-center font-bold text-[13px]">
                            <span
                              className={
                                row.hasCurrentCaScore &&
                                (row.selectedTermsGrade?.grade || row.gradeInfo.grade) === 'F'
                                  ? 'text-rose-600'
                                  : ''
                              }
                            >
                              {sortedIncludedTerms.length === 1 &&
                              sortedIncludedTerms[0] === currentTerm.id
                                ? row.hasCurrentCaScore ? row.gradeInfo.grade : '—'
                                : row.selectedTermsGrade?.grade || '—'}
                            </span>
                          </td>
                        </>
                      )}

                      {activeReportType === 'EXAM_TERM' && (
                        <>
                          <td className="py-1.5 px-2 text-center font-mono text-[13px]">
                            {formatOptionalScore(row.examRec.ca1Score)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono text-[13px]">
                            {formatOptionalScore(row.examRec.ca2Score)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono text-[13px]">
                            {formatOptionalScore(row.examRec.examScore)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono font-black text-[13px]">
                            {formatOptionalScore(row.examRec.totalScore)}
                          </td>
                          {sortedIncludedTerms.length > 1 && (
                            <>
                              {sortedIncludedTerms.map(tId => (
                                <td
                                  key={tId}
                                  className="py-1.5 px-2 text-center font-mono bg-amber-50/20 text-[13px]"
                                >
                                  {formatOptionalScore(row.termScoreMap[tId])}
                                </td>
                              ))}
                              <td className="py-1.5 px-2 text-center font-mono font-black bg-indigo-50/20 text-[13px]">
                                {formatOptionalScore(row.selectedTermsAvg)}
                              </td>
                            </>
                          )}
                          <td className="py-1.5 px-2 text-center font-bold text-[13px]">
                            {sortedIncludedTerms.length > 1
                              ? row.selectedTermsGrade?.grade || '—'
                              : row.examRec.grade || '—'}
                          </td>
                        </>
                      )}

                      {activeReportType === 'ANNUAL' && (
                        <>
                          {sortedIncludedTerms.map(tId => (
                            <td key={tId} className="py-1.5 px-2 text-center font-mono text-[13px]">
                              {formatOptionalScore(row.termScoreMap[tId])}
                            </td>
                          ))}
                          <td className="py-1.5 px-2 text-center font-mono font-black text-[13px]">
                            {formatOptionalScore(row.selectedTermsAvg)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-bold text-[13px]">
                            {row.selectedTermsGrade?.grade || '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                {/* ROW 1 BEFORE STUDENT OVERALL TOTAL: Sum of each CA, EXAM, and Termly Total ("Sum over Subjects * ColumnMax") */}
                <tr
                  data-testid={index === 0 ? 'report-column-sums-row' : undefined}
                  className="border-t-2 border-slate-900 divide-x divide-slate-900 font-bold bg-amber-50/60 text-[11px] text-center"
                >
                  <td
                    colSpan={2}
                    className="py-1.5 px-3 text-left font-black uppercase text-slate-900"
                  >
                    SUM OF SCORES ({subjectCount} SUBJECTS)
                  </td>

                  {activeReportType === 'MID_TERM' && (
                    <>
                      {activeComponents.map(c => (
                        <td key={c.id} className="py-1.5 px-1.5 font-mono text-[10px]">
                          {overallTotals.compCounts[c.id] > 0
                            ? formatColumnSumOverMax(
                                overallTotals.compSums[c.id],
                                overallTotals.compCounts[c.id],
                                c.maxScore
                              )
                            : '—'}
                        </td>
                      ))}
                      <td className="py-1.5 px-1.5 font-mono font-black text-[11px]">
                        {overallTotals.caDataCount > 0
                          ? formatColumnSumOverMax(overallTotals.rawSum, overallTotals.caDataCount, maxCa)
                          : '—'}
                      </td>
                      {sortedIncludedTerms.length === 1 &&
                      sortedIncludedTerms[0] === currentTerm.id ? (
                        <td className="py-1.5 px-1.5 font-mono font-black text-[11px]">
                          {overallTotals.caDataCount > 0
                            ? formatColumnSumOverMax(overallTotals.cum100Sum, overallTotals.caDataCount, 100)
                            : '—'}
                        </td>
                      ) : (
                        <>
                          {sortedIncludedTerms.map(tId => (
                            <td key={tId} className="py-1.5 px-1.5 font-mono text-[10px]">
                              {overallTotals.termCounts[tId] > 0
                                ? formatColumnSumOverMax(
                                    overallTotals.termSums[tId],
                                    overallTotals.termCounts[tId],
                                    100
                                  )
                                : '—'}
                            </td>
                          ))}
                          <td className="py-1.5 px-1.5 font-mono font-black text-[11px]">
                            {overallTotals.selectedTermsCount > 0
                              ? formatColumnSumOverMax(
                                  overallTotals.selectedCumulativeSum,
                                  overallTotals.selectedTermsCount,
                                  100
                                )
                              : '—'}
                          </td>
                        </>
                      )}
                      <td className="py-1.5 px-1.5 font-black text-slate-500">—</td>
                    </>
                  )}

                  {activeReportType === 'EXAM_TERM' && (
                    <>
                      <td
                        className="py-1.5 px-1.5 font-mono font-bold"
                        data-testid={index === 0 ? 'report-sum-ca1' : undefined}
                      >
                        {overallTotals.ca1DataCount > 0
                          ? formatColumnSumOverMax(
                              overallTotals.ca1Sum,
                              overallTotals.ca1DataCount,
                              termStructure.ca1Max
                            )
                          : '—'}
                      </td>
                      <td
                        className="py-1.5 px-1.5 font-mono font-bold"
                        data-testid={index === 0 ? 'report-sum-ca2' : undefined}
                      >
                        {overallTotals.ca2DataCount > 0
                          ? formatColumnSumOverMax(
                              overallTotals.ca2Sum,
                              overallTotals.ca2DataCount,
                              termStructure.ca2Max
                            )
                          : '—'}
                      </td>
                      <td
                        className="py-1.5 px-1.5 font-mono font-bold"
                        data-testid={index === 0 ? 'report-sum-exam' : undefined}
                      >
                        {overallTotals.examDataCount > 0
                          ? formatColumnSumOverMax(
                              overallTotals.examSum,
                              overallTotals.examDataCount,
                              termStructure.examMax
                            )
                          : '—'}
                      </td>
                      <td
                        className="py-1.5 px-1.5 font-mono font-black"
                        data-testid={index === 0 ? 'report-sum-term-total' : undefined}
                      >
                        {overallTotals.examTotalCount > 0
                          ? formatColumnSumOverMax(overallTotals.examTotalSum, overallTotals.examTotalCount, 100)
                          : '—'}
                      </td>
                      {sortedIncludedTerms.length > 1 && (
                        <>
                          {sortedIncludedTerms.map(tId => (
                            <td key={tId} className="py-1.5 px-1.5 font-mono text-[10px]">
                              {overallTotals.termCounts[tId] > 0
                                ? formatColumnSumOverMax(
                                    overallTotals.termSums[tId],
                                    overallTotals.termCounts[tId],
                                    100
                                  )
                                : '—'}
                            </td>
                          ))}
                          <td className="py-1.5 px-1.5 font-mono font-black text-[11px]">
                            {overallTotals.selectedTermsCount > 0
                              ? formatColumnSumOverMax(
                                  overallTotals.selectedCumulativeSum,
                                  overallTotals.selectedTermsCount,
                                  100
                                )
                              : '—'}
                          </td>
                        </>
                      )}
                      <td className="py-1.5 px-1.5 font-black text-slate-500">—</td>
                    </>
                  )}

                  {activeReportType === 'ANNUAL' && (
                    <>
                      {sortedIncludedTerms.map(tId => (
                        <td key={tId} className="py-1.5 px-1.5 font-mono font-bold">
                          {overallTotals.termCounts[tId] > 0
                            ? formatColumnSumOverMax(
                                overallTotals.termSums[tId],
                                overallTotals.termCounts[tId],
                                100
                              )
                            : '—'}
                        </td>
                      ))}
                      <td className="py-1.5 px-1.5 font-mono font-black">
                        {overallTotals.selectedTermsCount > 0
                          ? formatColumnSumOverMax(
                              overallTotals.selectedCumulativeSum,
                              overallTotals.selectedTermsCount,
                              100
                            )
                          : '—'}
                      </td>
                      <td className="py-1.5 px-1.5 font-black text-slate-500">—</td>
                    </>
                  )}
                </tr>

                {/* ROW 2: STUDENT OVERALL TOTAL & AVERAGE SCORES */}
                <tr className="border-t border-slate-900 divide-x divide-slate-900 font-bold bg-slate-100 text-[13px] text-center">
                  <td
                    colSpan={2}
                    className="py-2 px-3 text-left font-black uppercase"
                  >
                    STUDENT OVERALL TOTAL
                  </td>

                  {activeReportType === 'MID_TERM' && (
                    <>
                      <td
                        colSpan={activeComponents.length}
                        className="py-2 px-2 text-right uppercase font-black text-xs"
                        data-testid={index === 0 ? 'report-average-scores-label' : undefined}
                      >
                        Average Scores:
                      </td>
                      <td className="py-2 px-2 font-mono font-black">
                        {overallTotals.caDataCount > 0
                          ? `${overallTotals.rawSum.toFixed(1)} / ${overallTotals.maxTotalPossible}`
                          : '—'}
                      </td>
                      {sortedIncludedTerms.length === 1 &&
                      sortedIncludedTerms[0] === currentTerm.id ? (
                        <td className="py-2 px-2 font-mono font-black">
                          {formatOptionalScore(overallTotals.overallCum)} / 100
                        </td>
                      ) : (
                        <>
                          {sortedIncludedTerms.map(tId => (
                            <td key={tId} className="py-2 px-2 font-mono font-bold">
                              {formatOptionalScore(overallTotals.termAvgs[tId])}
                            </td>
                          ))}
                          <td className="py-2 px-2 font-mono font-black">
                            {formatOptionalScore(overallTotals.overallSelectedCumAvg)} / 100
                          </td>
                        </>
                      )}
                      <td className="py-2 px-2 font-black text-sm">{overallTotals.grade}</td>
                    </>
                  )}

                  {activeReportType === 'EXAM_TERM' && (
                    <>
                      <td
                        colSpan={3}
                        className="py-2 px-2 text-right uppercase font-black"
                        data-testid={index === 0 ? 'report-average-scores-label' : undefined}
                      >
                        Average Scores:
                      </td>
                      <td className="py-2 px-2 font-mono font-black">
                        {formatOptionalScore(overallTotals.overallExamAvg)} / 100
                      </td>
                      {sortedIncludedTerms.length > 1 && (
                        <>
                          {sortedIncludedTerms.map(tId => (
                            <td key={tId} className="py-2 px-2 font-mono font-bold">
                              {formatOptionalScore(overallTotals.termAvgs[tId])}
                            </td>
                          ))}
                          <td className="py-2 px-2 font-mono font-black">
                            {formatOptionalScore(overallTotals.overallSelectedCumAvg)} / 100
                          </td>
                        </>
                      )}
                      <td className="py-2 px-2 font-black">
                        {sortedIncludedTerms.length > 1
                          ? overallTotals.grade
                          : overallTotals.examGrade}
                      </td>
                    </>
                  )}

                  {activeReportType === 'ANNUAL' && (
                    <>
                      {sortedIncludedTerms.map(tId => (
                        <td key={tId} className="py-2 px-2 font-mono font-bold">
                          {formatOptionalScore(overallTotals.termAvgs[tId])}%
                        </td>
                      ))}
                      <td className="py-2 px-2 font-mono font-black">
                        {formatOptionalScore(overallTotals.overallSelectedCumAvg)} / 100
                      </td>
                      <td className="py-2 px-2 font-black">{overallTotals.grade}</td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
            )}
          </div>

          {/* Official Grading Scale — Single Horizontal Line (Grouped B & C for Senior) */}
          <div
            data-testid={index === 0 ? 'report-card-grading-scale' : undefined}
            className="mt-2.5 border border-slate-900 bg-slate-50 px-2 py-1 flex items-center justify-between gap-1.5 flex-nowrap whitespace-nowrap overflow-x-auto no-scrollbar text-[8px] sm:text-[8.5px] leading-none"
          >
            <span className="font-black uppercase tracking-tight text-slate-900 shrink-0 pr-1 border-r border-slate-300">
              GRADING SCALE ({currentSection.levelType}):
            </span>
            <div className="flex items-center justify-between gap-1.5 flex-nowrap whitespace-nowrap flex-1">
              {activeClassGradingScale.map(scale => (
                <span
                  key={scale.id}
                  className="inline-flex items-center space-x-0.5 whitespace-nowrap shrink-0 text-slate-800"
                >
                  <strong className="font-black text-slate-950">{scale.gradeLabel}:</strong>
                  <span className="font-mono">{scale.rangeText}</span>
                  <span className="text-slate-600">({scale.description})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Blue Header: PRINCIPAL'S EXECUTIVE REMARKS & ASSESSMENT */}
          <div className="mt-3 border border-slate-900">
            <div className="bg-[#1c4e80] text-white px-3 py-1.5 flex justify-between items-center text-xs font-bold uppercase">
              <span>PRINCIPAL&apos;S EXECUTIVE REMARKS &amp; ASSESSMENT</span>
              <span className="font-black text-sm">Grade {activeOverallGrade || 'C'}</span>
            </div>

            <div className="p-3 bg-white text-xs text-slate-800 min-h-[46px] relative space-y-2">
              <p
                data-testid={index === 0 ? 'report-remark-display' : undefined}
                className="font-medium text-slate-900"
              >
                {remarkText}
              </p>

              {/* Inline Editable Comment Input & Comment Bank Auto-Generator (Hidden on Print) */}
              {!isPrintPreview && (
                <div className="print:hidden pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-500 font-semibold">
                      Auto-generated for Grade <strong>{activeOverallGrade || 'C'}</strong> (Edit below to insert extra information):
                    </span>
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        data-testid={index === 0 ? 'report-auto-comment-btn' : undefined}
                        onClick={() => {
                          const autoText = getAutoCommentForGrade(
                            activeOverallGrade || 'C',
                            'PRINCIPAL',
                            commentBank,
                            student.id
                          );
                          const rKey = `${student.id}-${currentTerm.id}-${activeReportType}-${activeOverallGrade}`;
                          setCustomRemarkEdits(prev => {
                            const next = { ...prev };
                            delete next[rKey];
                            return next;
                          });
                          updateRemarks(student.id, autoText, undefined);
                        }}
                        className="text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
                        title="Restore Grade-Matched Comment from Comment Bank"
                      >
                        Auto-Generate by Grade ({activeOverallGrade || 'C'})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const rand =
                            principalRemarksOptions[
                              Math.floor(Math.random() * principalRemarksOptions.length)
                            ];
                          if (rand) {
                            const rKey = `${student.id}-${currentTerm.id}-${activeReportType}-${activeOverallGrade}`;
                            setCustomRemarkEdits(prev => ({ ...prev, [rKey]: rand }));
                            updateRemarks(student.id, rand, undefined);
                          }
                        }}
                        className="flex items-center space-x-1 text-indigo-700 hover:text-indigo-900 font-bold cursor-pointer"
                        title="Randomize Remark from Comment Bank"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>Shuffle Comment</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    aria-label="Edit Principal Executive Remark"
                    data-testid={index === 0 ? 'report-editable-remark-input' : undefined}
                    value={remarkText}
                    onChange={e => {
                      const val = e.target.value;
                      const rKey = `${student.id}-${currentTerm.id}-${activeReportType}-${activeOverallGrade}`;
                      setCustomRemarkEdits(prev => ({ ...prev, [rKey]: val }));
                      updateRemarks(student.id, val, undefined);
                    }}
                    placeholder="Edit or insert additional remarks for this student..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Signatures & Report Date Row */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-slate-900 px-2">
            <div data-testid={index === 0 ? 'report-form-tutor' : undefined}>
              <span>Form Tutor Signature: </span>
              <span className="font-serif italic underline underline-offset-4 decoration-slate-400 font-normal ml-1">
                {currentSection.classTeacherName ||
                  schoolProfile.formTeacherName ||
                  '____________________'}
              </span>
            </div>

            <div>
              <span>Principal Signature: </span>
              <span className="font-serif italic underline underline-offset-4 decoration-slate-400 font-normal ml-1">
                {schoolProfile.principalName || 'Principal'}
              </span>
            </div>

            <div>
              <span>Report Date: </span>
              <span className="font-mono font-normal ml-1">{schoolProfile.reportDate}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Controls & Term/Cumulative Configuration Bar (Hidden on Print) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 print:hidden space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Navigation & Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Report Card Format Dropdown BEFORE Class Section (Standard + Enabled Custom Report Cards) */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                Report Card Format
              </label>
              <select
                aria-label="Report Card Format"
                data-testid="report-card-format-dropdown"
                value={activeReportCardTemplateId}
                onChange={e => setActiveReportCardTemplateId(e.target.value)}
                className={`px-3 py-1.5 border rounded-xl text-xs sm:text-sm font-black cursor-pointer ${
                  activeCustomTemplate
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                    : 'bg-indigo-50/70 border-indigo-300 text-indigo-950'
                }`}
              >
                <option value="STANDARD">Standard</option>
                {enabledCustomTemplates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Class Section (Filtered to selected classes when a Custom Report Card is active) */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Class Section {activeCustomTemplate ? `(${visibleClassSections.length} Assigned)` : ''}
              </label>
              <select
                aria-label="Filter Class Section"
                data-testid="report-card-class-section-dropdown"
                value={selectedSectionId}
                onChange={e => setSelectedSectionId(Number(e.target.value))}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800"
              >
                {visibleClassSections.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.levelType})
                  </option>
                ))}
              </select>
            </div>

            {/* Student Picker */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Active Student
              </label>
              <select
                aria-label="Select Student"
                value={activeStudent?.id}
                onChange={e => {
                  setSelectedStudentId(Number(e.target.value));
                  setIsBatchClassMode(false);
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-indigo-900"
              >
                {sectionStudents.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.fullName} ({st.admissionNumber}){st.isRecordSealed ? ' • GRADUATED' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Official School Testimonial Button if Graduated / Sealed */}
            {activeStudent && (activeStudent.isRecordSealed || activeStudent.promotionStatus === 'GRADUATED') && (
              <button
                type="button"
                data-testid="open-student-testimonial-btn"
                onClick={() => setTestimonialModalStudent(activeStudent)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-sm cursor-pointer"
              >
                <Award className="w-4 h-4" />
                <span>View School Testimonial &amp; Sealed Transcript</span>
              </button>
            )}

            {/* Student Prev / Next */}
            <div className="flex items-center space-x-1 pt-3 sm:pt-0">
              <button
                type="button"
                aria-label="Previous Student"
                onClick={handlePrevStudent}
                disabled={currentStudentIndex <= 0}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-semibold px-2 text-slate-500">
                {currentStudentIndex + 1} / {sectionStudents.length}
              </span>
              <button
                type="button"
                aria-label="Next Student"
                onClick={handleNextStudent}
                disabled={currentStudentIndex >= sectionStudents.length - 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Multi-Optional Report Type Selector & Print Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveReportType('MID_TERM')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeReportType === 'MID_TERM'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mid-Term (CA1)
              </button>
              <button
                type="button"
                onClick={() => setActiveReportType('EXAM_TERM')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeReportType === 'EXAM_TERM'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Term Exam (CA+Exam)
              </button>
              <button
                type="button"
                onClick={() => setActiveReportType('ANNUAL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeReportType === 'ANNUAL'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Yearly Cumulative
              </button>
            </div>

            {/* Clean Print Preview Toggle */}
            <button
              type="button"
              onClick={() => setIsPrintPreview(prev => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isPrintPreview
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {isPrintPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{isPrintPreview ? 'Exit Print Preview' : 'Verify Final Print View'}</span>
            </button>

            {isAllowedToPrint ? (
              <>
                {/* Single Student Print Button */}
                <button
                  type="button"
                  data-testid="print-single-report-btn"
                  onClick={handlePrintSingleReport}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Single Student</span>
                </button>

                {/* Batch Print Entire Class Button */}
                <button
                  type="button"
                  data-testid="batch-print-class-btn"
                  onClick={handleBatchPrintEntireClass}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-black shadow-md transition-all cursor-pointer"
                >
                  <Files className="w-4 h-4 text-amber-400" />
                  <span>Batch Print Class ({sectionStudents.length} Pages)</span>
                </button>
              </>
            ) : (
              <div
                data-testid="teacher-view-only-notice"
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs font-bold"
              >
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>View-Only Mode (Teachers cannot print or download)</span>
              </div>
            )}
          </div>
        </div>

        {/* Second Row: Active Report Term Selector + Cumulative Term Checkboxes + Batch View Toggle */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Active Term Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>Report Sheet Term:</span>
              </span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                {terms.map(t => {
                  const isSelected = currentTerm.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCurrentTerm(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.name} TERM
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Toggle Single vs All Class Sheets Preview */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setIsBatchClassMode(false)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !isBatchClassMode
                    ? 'bg-white text-indigo-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Single Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => setIsBatchClassMode(true)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isBatchClassMode
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Files className="w-3.5 h-3.5" />
                <span>All Class Sheets ({sectionStudents.length} Pages)</span>
              </button>
            </div>
          </div>

          {/* Cumulative Terms Checkbox Selector */}
          <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl text-xs">
            <div className="flex items-center space-x-1.5 text-amber-950 font-black uppercase tracking-wide">
              <Layers className="w-4 h-4 text-amber-700" />
              <span>Cumulative Terms (Columns):</span>
            </div>

            <div className="flex items-center space-x-3">
              {[
                { id: 1, label: 'First Term' },
                { id: 2, label: 'Second Term' },
                { id: 3, label: 'Third Term' }
              ].map(t => (
                <label
                  key={t.id}
                  className="flex items-center space-x-1.5 cursor-pointer font-bold text-slate-900 select-none"
                >
                  <input
                    type="checkbox"
                    checked={includedTermsForAnnual.includes(t.id)}
                    onChange={() => toggleAnnualTermInclusion(t.id)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>

            <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded">
              Avg of {sortedIncludedTerms.length} Term{sortedIncludedTerms.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Render either Single Student Report Card OR Entire Class Batch Report Cards on Separate Pages */}
      {isBatchClassMode ? (
        <div data-testid="batch-class-report-sheets" className="space-y-8 print:space-y-0">
          {sectionStudents.map((st, idx) =>
            renderStudentTranscriptSheet(st, idx, sectionStudents.length)
          )}
        </div>
      ) : (
        activeStudent && renderStudentTranscriptSheet(activeStudent, 0, 1)
      )}

      {/* Official School Testimonial & Sealed Transcript Modal */}
      {testimonialModalStudent && (
        <SchoolTestimonialModal
          student={testimonialModalStudent}
          onClose={() => setTestimonialModalStudent(null)}
        />
      )}
    </div>
  );
};
