/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  FileSpreadsheet,
  Users,
  BookOpen,
  Award,
  ArrowRight,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Calendar
} from 'lucide-react';
import {
  determineGrade,
  getTermStructureForLevel
} from '../utils/academicCalculations';

interface SheetsDataExplorerProps {
  onOpenClass: (sectionId: number) => void;
  onOpenReportCard: (studentId: number, sectionId: number) => void;
}

export const SheetsDataExplorer: React.FC<SheetsDataExplorerProps> = ({
  onOpenClass,
  onOpenReportCard
}) => {
  const {
    oldSheets,
    classSections,
    students,
    subjects,
    scores,
    enrollments,
    assessmentComponents,
    termSummaries,
    termSubjectRecords,
    currentTerm,
    setCurrentTerm,
    terms,
    currentSession,
    toggleSubjectInclusion
  } = useApp();

  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const classScrollRef = useRef<HTMLDivElement | null>(null);

  const currentSheet = oldSheets[selectedSheetIndex] || oldSheets[0];

  // Match corresponding live class section
  const matchedSection = useMemo(() => {
    return (
      classSections.find(
        c => c.name.toUpperCase() === currentSheet.section.toUpperCase()
      ) || classSections[selectedSheetIndex] || classSections[0]
    );
  }, [classSections, currentSheet.section, selectedSheetIndex]);

  const isSenior =
    (matchedSection?.levelType ||
      currentSheet.levelType ||
      (currentSheet.section.toUpperCase().includes('YEAR 10') ||
      currentSheet.section.toUpperCase().includes('YEAR 11') ||
      currentSheet.section.toUpperCase().includes('YEAR 12')
        ? 'SENIOR'
        : 'JUNIOR')) === 'SENIOR';

  const levelType = isSenior ? 'SENIOR' : 'JUNIOR';
  const termStructure = useMemo(
    () => getTermStructureForLevel(levelType, currentTerm.name),
    [levelType, currentTerm.name]
  );

  // Students enrolled in this class section
  const sectionStudents = useMemo(() => {
    if (!matchedSection) return [];
    return students.filter(st => st.currentSectionId === matchedSection.id);
  }, [students, matchedSection]);

  // Track which student is selected in the Master Enrolled Students List
  const [selectedStudentName, setSelectedStudentName] = useState<string>(
    sectionStudents[0]?.fullName || currentSheet.activeStudent
  );

  // Reset selectedStudentName when switching sheets or when sectionStudents updates
  useEffect(() => {
    if (sectionStudents.length > 0) {
      const exists = sectionStudents.some(
        st => st.fullName.trim().toUpperCase() === selectedStudentName.trim().toUpperCase()
      );
      if (!exists) {
        setSelectedStudentName(sectionStudents[0].fullName);
      }
    } else {
      setSelectedStudentName(currentSheet.activeStudent);
    }
  }, [selectedSheetIndex, currentSheet.activeStudent, sectionStudents, selectedStudentName]);

  // Resolve the active Student object from live state
  const activeStudentObj = useMemo(() => {
    const cleanTarget = selectedStudentName.trim().toUpperCase();
    return (
      sectionStudents.find(st => st.fullName.trim().toUpperCase() === cleanTarget) ||
      students.find(st => st.fullName.trim().toUpperCase() === cleanTarget) ||
      sectionStudents[0]
    );
  }, [selectedStudentName, sectionStudents, students]);

  // Applicable curriculum subjects for this class level
  const applicableSubjects = useMemo(() => {
    return subjects.filter(
      sub => sub.applicableLevel === levelType || sub.applicableLevel === 'BOTH'
    );
  }, [subjects, levelType]);

  // Active CA components for this class level
  const levelComponents = useMemo(() => {
    return assessmentComponents
      .filter(c => c.levelType === levelType)
      .sort((a, b) => a.weightOrder - b.weightOrder);
  }, [assessmentComponents, levelType]);

  const maxCaTotal = termStructure.rawCaMax; // 40 for Junior, 30 for Senior

  // Build live subject score rows for the selected student for the ACTIVE TERM (currentTerm.id)
  // Junior: 1st CA (20) + 2nd CA (20) + Exam (60) = Cum 100%
  // Senior: 1st CA (15) + 2nd CA (15) + Exam (70) = Cum 100%
  const studentSubjectScoreRows = useMemo(() => {
    if (!activeStudentObj) {
      return [];
    }

    return applicableSubjects.map(sub => {
      const enr = enrollments.find(
        e =>
          e.studentId === activeStudentObj.id &&
          e.subjectId === sub.id &&
          e.sectionId === activeStudentObj.currentSectionId
      );
      const sheetFallback = currentSheet.scores.find(
        s => s.subject.trim().toUpperCase() === sub.name.trim().toUpperCase()
      );

      const isIncluded = isSenior
        ? enr
          ? enr.isIncluded
          : sheetFallback
          ? sheetFallback.included
          : sub.category === 'CORE'
        : true;

      let rawTotal = 0;
      let hasAnyLiveScore = false;

      levelComponents.forEach(comp => {
        const sc = scores.find(
          s =>
            s.studentId === activeStudentObj.id &&
            s.subjectId === sub.id &&
            s.componentId === comp.id
        );
        if (sc && sc.score !== null && !isNaN(sc.score)) {
          rawTotal += sc.score;
          hasAnyLiveScore = true;
        }
      });

      const termRec = termSubjectRecords.find(
        r =>
          r.studentId === activeStudentObj.id &&
          r.subjectId === sub.id &&
          r.termId === currentTerm.id
      );

      const ca1Max = termStructure.ca1Max;
      const ca2Max = termStructure.ca2Max;
      const examMax = termStructure.examMax;

      let ca1Score = 0;
      let ca2Score = 0;
      let examScore = 0;

      if (isIncluded) {
        if (termRec) {
          ca1Score =
            currentTerm.id === 1 && hasAnyLiveScore
              ? Number(Math.min(ca1Max, rawTotal / 2).toFixed(1))
              : Number(
                  Math.min(
                    ca1Max,
                    termRec.ca1Score > ca1Max ? termRec.ca1Score / 2 : termRec.ca1Score
                  ).toFixed(1)
                );
          ca2Score = Number(
            Math.min(
              ca2Max,
              termRec.ca2Score > ca2Max ? termRec.ca2Score / 2 : termRec.ca2Score
            ).toFixed(1)
          );
          examScore = Number(Math.min(examMax, termRec.examScore).toFixed(1));
        } else if (currentTerm.id === 1 && hasAnyLiveScore) {
          ca1Score = Number(Math.min(ca1Max, rawTotal / 2).toFixed(1));
          ca2Score = 0;
          examScore = 0;
        }
      }

      const cum100 = isIncluded
        ? Number(Math.min(100, ca1Score + ca2Score + examScore).toFixed(1))
        : 0;

      const gradeInfo = determineGrade(cum100, levelType);

      return {
        subjectId: sub.id,
        subject: sub.name,
        isIncluded,
        ca1Score,
        ca2Score,
        examScore,
        cum100,
        grade: isIncluded ? gradeInfo.grade : '-',
        remark: isIncluded ? gradeInfo.description.toUpperCase() : 'EXCLUDED'
      };
    });
  }, [
    activeStudentObj,
    applicableSubjects,
    enrollments,
    currentSheet,
    isSenior,
    levelType,
    levelComponents,
    scores,
    termSubjectRecords,
    currentTerm.id,
    termStructure,
    maxCaTotal
  ]);

  // Compute active term class average and student rank dynamically for currentTerm.id
  const activeClassTermStats = useMemo(() => {
    if (sectionStudents.length === 0) {
      return {
        classAvgTotal: 0,
        classAvgCum: 0,
        ranksByStudentId: {} as Record<number, number>
      };
    }

    const totalsPerStudent = sectionStudents.map(st => {
      let sum = 0;
      let count = 0;
      applicableSubjects.forEach(sub => {
        const enr = enrollments.find(
          e =>
            e.studentId === st.id &&
            e.subjectId === sub.id &&
            e.sectionId === st.currentSectionId
        );
        const inc = isSenior ? (enr ? enr.isIncluded : sub.category === 'CORE') : true;
        if (!inc) return;
        count++;
        const rec = termSubjectRecords.find(
          r => r.studentId === st.id && r.subjectId === sub.id && r.termId === currentTerm.id
        );
        if (rec) {
          sum += Number(rec.totalScore || 0);
        }
      });
      const cum = count > 0 ? Number((sum / count).toFixed(1)) : 0;
      return {
        studentId: st.id,
        totalObtained: Number(sum.toFixed(1)),
        cum
      };
    });

    const sorted = [...totalsPerStudent].sort((a, b) => b.totalObtained - a.totalObtained);
    const ranksByStudentId: Record<number, number> = {};
    sorted.forEach((item, idx) => {
      ranksByStudentId[item.studentId] = idx + 1;
    });

    const avgTotal = Number(
      (
        totalsPerStudent.reduce((acc, s) => acc + s.totalObtained, 0) /
        sectionStudents.length
      ).toFixed(1)
    );
    const avgCum = Number(
      (
        totalsPerStudent.reduce((acc, s) => acc + s.cum, 0) /
        sectionStudents.length
      ).toFixed(1)
    );

    return {
      classAvgTotal: avgTotal,
      classAvgCum: avgCum,
      ranksByStudentId
    };
  }, [
    sectionStudents,
    applicableSubjects,
    enrollments,
    isSenior,
    termSubjectRecords,
    currentTerm.id
  ]);

  // Compute live summary metrics for the selected student in the ACTIVE TERM
  const activeStudentSummary = useMemo(() => {
    const includedRows = studentSubjectScoreRows.filter(r => r.isIncluded);
    const totalObtained = Number(
      includedRows.reduce((acc, r) => acc + r.cum100, 0).toFixed(1)
    );
    const totalPossible = Number((includedRows.length * 100).toFixed(0));
    const cumulativePct =
      includedRows.length > 0
        ? Number((totalObtained / includedRows.length).toFixed(1))
        : 0;
    const gradeInfo = determineGrade(cumulativePct, levelType);

    const termSum = activeStudentObj
      ? termSummaries.find(
          ts =>
            ts.studentId === activeStudentObj.id &&
            ts.sectionId === activeStudentObj.currentSectionId &&
            ts.termId === currentTerm.id
        )
      : undefined;

    const computedRank = activeStudentObj
      ? activeClassTermStats.ranksByStudentId[activeStudentObj.id] || termSum?.classRank || 1
      : 1;

    return {
      name: activeStudentObj?.fullName || selectedStudentName,
      admissionNumber: activeStudentObj?.admissionNumber || '',
      includedCount: includedRows.length,
      totalSubjectsCount: studentSubjectScoreRows.length,
      totalObtained,
      totalPossible,
      cumulativePct,
      overallGrade: gradeInfo.grade,
      rank: `${computedRank} of ${sectionStudents.length || currentSheet.students.length}`
    };
  }, [
    studentSubjectScoreRows,
    levelType,
    activeStudentObj,
    selectedStudentName,
    termSummaries,
    currentTerm.id,
    activeClassTermStats.ranksByStudentId,
    sectionStudents.length,
    currentSheet.students.length
  ]);

  const handleScrollClasses = (direction: 'left' | 'right') => {
    if (!classScrollRef.current) return;
    const offset = direction === 'left' ? -280 : 280;
    classScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const masterStudentNames: string[] =
    sectionStudents.length > 0
      ? sectionStudents.map(st => st.fullName)
      : currentSheet.students;

  return (
    <div className="space-y-6">
      {/* Top Banner: Student Enrollment Matrix with Active Term Selector */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-800/50 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Interactive Class Roster &amp; Subject Inclusion Controller</span>
              </div>
              <span
                data-testid="matrix-banner-active-term"
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black uppercase"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Active: {currentTerm.name} TERM • {currentSession.name}</span>
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Student Enrollment Matrix
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl">
              Select any academic class below and click on any student in the Master Enrolled Students List to load their live score record (1st CA, 2nd CA, Exam, Cum 100%, Grade &amp; Remark) for the active <strong className="text-amber-300">{currentTerm.name} TERM</strong>. For Senior Secondary classes, click the Included/Excluded status button to add or remove subjects for that student in real time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {matchedSection && (
              <button
                type="button"
                onClick={() => onOpenClass(matchedSection.id)}
                className="flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <span>Open {matchedSection.name} in Score Grid</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {activeStudentObj && matchedSection && (
              <button
                type="button"
                onClick={() => onOpenReportCard(activeStudentObj.id, matchedSection.id)}
                className="flex items-center space-x-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                <Award className="w-4 h-4" />
                <span>View {activeStudentSummary.name.split(' ')[0]}&apos;s Report Card</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Term Switcher inside Student Enrollment Matrix */}
        <div className="pt-3 border-t border-indigo-800/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
              Active Academic Term:
            </span>
            <div className="flex items-center bg-slate-800/90 p-1 rounded-xl gap-1 border border-slate-700">
              {terms.map(t => {
                const isSelected = currentTerm.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`matrix-term-btn-${t.id}`}
                    onClick={() => setCurrentTerm(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {t.name} TERM
                  </button>
                );
              })}
            </div>
          </div>
          <span className="text-xs text-indigo-200 font-mono">
            Displaying live {currentTerm.name} Term records ({currentSession.name})
          </span>
        </div>
      </div>

      {/* Horizontal Class Selector Bar with Left and Right Scroll Arrows */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2.5 shadow-xs flex items-center gap-2">
        <button
          type="button"
          data-testid="class-scroll-left"
          aria-label="Scroll Classes Left"
          onClick={() => handleScrollClasses('left')}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white border border-slate-200 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          title="Scroll Classes Left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          ref={classScrollRef}
          data-testid="class-horizontal-scroll"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth flex-1 py-0.5"
        >
          {oldSheets.map((sheet, idx) => {
            const isSelected = idx === selectedSheetIndex;
            const sheetNumber = idx + 1;
            const secMatch = classSections.find(
              c => c.name.toUpperCase() === sheet.section.toUpperCase()
            );
            const liveCount = secMatch
              ? students.filter(st => st.currentSectionId === secMatch.id).length
              : sheet.students.length;
            const sheetIsSenior =
              (sheet.levelType ||
                (sheet.section.toUpperCase().includes('YEAR 10') ||
                sheet.section.toUpperCase().includes('YEAR 11') ||
                sheet.section.toUpperCase().includes('YEAR 12')
                  ? 'SENIOR'
                  : 'JUNIOR')) === 'SENIOR';

            return (
              <button
                key={sheet.fileName || sheetNumber}
                type="button"
                data-testid={`matrix-class-tab-${sheetNumber}`}
                onClick={() => setSelectedSheetIndex(idx)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-2 shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-black ${
                    isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {sheetNumber}
                </span>
                <span>{sheet.section}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    sheetIsSenior
                      ? isSelected
                        ? 'bg-indigo-500/30 text-indigo-200'
                        : 'bg-indigo-50 text-indigo-700'
                      : isSelected
                      ? 'bg-emerald-500/30 text-emerald-200'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {liveCount}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          data-testid="class-scroll-right"
          aria-label="Scroll Classes Right"
          onClick={() => handleScrollClasses('right')}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white border border-slate-200 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          title="Scroll Classes Right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Main Layout Grid: Left Column = Master Enrolled Students List; Right Column = 1) Selected Sheet Summary Card AT TOP ABOVE 2) Original Subject Scores Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Master Enrolled Students List (Clickable to load student score record) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-amber-400" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  Master Enrolled Students List
                </h3>
                <p className="text-[10px] text-slate-400">
                  Click any student to load their {currentTerm.name} Term score record
                </p>
              </div>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-800 text-amber-300">
              {masterStudentNames.length} Students
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
            {masterStudentNames.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No students enrolled in {matchedSection?.name || currentSheet.section} yet.
              </div>
            ) : (
              masterStudentNames.map((stName: string, sIdx: number) => {
                const isSelectedStudent =
                  stName.trim().toUpperCase() === activeStudentSummary.name.trim().toUpperCase();
                return (
                  <button
                    key={`${stName}-${sIdx}`}
                    type="button"
                    data-testid={`matrix-student-btn-${sIdx}`}
                    onClick={() => setSelectedStudentName(stName)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      isSelectedStudent
                        ? 'bg-indigo-50/90 font-bold text-indigo-950 border-l-4 border-indigo-600'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <span
                        className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                          isSelectedStudent
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {sIdx + 1}
                      </span>
                      <span className="truncate">{stName}</span>
                    </div>
                    {isSelectedStudent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 shrink-0">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Columns: 1) "Selected Sheet" Summary Card AT TOP ABOVE 2) "Original Subject Scores" Card */}
        <div
          data-testid="matrix-right-column"
          className="lg:col-span-2 flex flex-col gap-6"
        >
          {/* CARD 1 (TOP): Selected Sheet Summary Card (Displays ONLY Class Name — No File Name in Brackets, Reflects Active Term) */}
          <div
            data-testid="selected-sheet-summary-card"
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  Selected Sheet #{selectedSheetIndex + 1} • {isSenior ? 'SENIOR' : 'JUNIOR'} Level • {currentTerm.name} Term
                </span>
                <h3
                  data-testid="matrix-selected-class-heading"
                  className="text-lg font-black text-slate-900"
                >
                  {matchedSection?.name || currentSheet.section}
                </h3>
              </div>
              <div className="flex items-center space-x-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                  Class Average:{' '}
                  <strong className="text-indigo-700" data-testid="matrix-class-average">
                    {activeClassTermStats.classAvgTotal} ({activeClassTermStats.classAvgCum}%)
                  </strong>
                </span>
                <span
                  data-testid="matrix-selected-sheet-term-badge"
                  className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold"
                >
                  {currentTerm.name} TERM • {currentSession.name}
                </span>
              </div>
            </div>

            {/* Selected Student Summary Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Selected Student</div>
                <div className="font-black text-slate-900 mt-0.5 truncate">{activeStudentSummary.name}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">{currentTerm.name} Term Rank</div>
                <div className="font-black text-indigo-700 mt-0.5">{activeStudentSummary.rank}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">{currentTerm.name} Term Total</div>
                <div
                  data-testid="matrix-student-term-total"
                  className="font-black text-slate-900 mt-0.5"
                >
                  {activeStudentSummary.totalObtained} / {activeStudentSummary.totalPossible}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Cumulative % &amp; Grade</div>
                <div className="font-black text-emerald-700 mt-0.5">
                  {activeStudentSummary.cumulativePct}% ({activeStudentSummary.overallGrade})
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2 (BELOW): Original Subject Scores for Selected Student */}
          <div
            data-testid="original-subject-scores-card"
            className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
          >
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Original Subject Scores for {activeStudentSummary.name} — {currentTerm.name} Term
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isSenior
                      ? `Senior Secondary (${activeStudentSummary.includedCount} of ${activeStudentSummary.totalSubjectsCount} subjects included) — Click Included/Excluded to add or remove a subject`
                      : `Junior Secondary (${activeStudentSummary.totalSubjectsCount} compulsory subjects)`}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-600 font-semibold">
                {isSenior
                  ? '1st CA (15) + 2nd CA (15) + Exam (70) = 100%'
                  : '1st CA (20) + 2nd CA (20) + Exam (60) = 100%'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3 font-bold">#</th>
                    <th className="py-2.5 px-3 font-bold">Subject</th>
                    {isSenior && (
                      <th className="py-2.5 px-2.5 text-center font-bold">Status</th>
                    )}
                    <th className="py-2.5 px-2.5 text-center font-bold">
                      1st CA ({termStructure.ca1Max})
                    </th>
                    <th className="py-2.5 px-2.5 text-center font-bold">
                      2nd CA ({termStructure.ca2Max})
                    </th>
                    <th className="py-2.5 px-2.5 text-center font-bold">
                      Exam ({termStructure.examMax})
                    </th>
                    <th className="py-2.5 px-2.5 text-center font-bold bg-indigo-950 text-amber-300">
                      Cum 100%
                    </th>
                    <th className="py-2.5 px-2.5 text-center font-bold">Grade</th>
                    <th className="py-2.5 px-3 font-bold">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentSubjectScoreRows.map((row, idx) => {
                    const gradeText = row.grade || '-';
                    return (
                      <tr
                        key={row.subjectId || idx}
                        className={
                          !row.isIncluded
                            ? 'bg-slate-50/70 text-slate-400'
                            : 'hover:bg-slate-50/90 text-slate-800'
                        }
                      >
                        <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold">{row.subject}</td>
                        {isSenior && (
                          <td className="py-2 px-2.5 text-center">
                            <button
                              type="button"
                              data-testid={`toggle-subject-inclusion-${row.subjectId}`}
                              onClick={() => {
                                if (activeStudentObj) {
                                  toggleSubjectInclusion(
                                    activeStudentObj.id,
                                    row.subjectId,
                                    !row.isIncluded
                                  );
                                }
                              }}
                              title={
                                row.isIncluded
                                  ? `Click to exclude ${row.subject} for ${activeStudentSummary.name}`
                                  : `Click to include ${row.subject} for ${activeStudentSummary.name}`
                              }
                              className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer border ${
                                row.isIncluded
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-indigo-50 hover:text-indigo-700'
                              }`}
                            >
                              {row.isIncluded ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Included</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3 text-slate-400" />
                                  <span>Excluded</span>
                                </>
                              )}
                            </button>
                          </td>
                        )}
                        <td className="py-2 px-2.5 text-center font-mono font-semibold">
                          {row.isIncluded ? row.ca1Score.toFixed(1) : '-'}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono font-semibold">
                          {row.isIncluded ? row.ca2Score.toFixed(1) : '-'}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono font-semibold">
                          {row.isIncluded ? row.examScore.toFixed(1) : '-'}
                        </td>
                        <td className="py-2 px-2.5 text-center font-black bg-indigo-50/50 text-indigo-950 font-mono">
                          {row.isIncluded ? `${row.cum100.toFixed(1)}%` : '-'}
                        </td>
                        <td className="py-2 px-2.5 text-center font-black">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              !row.isIncluded
                                ? 'bg-slate-100 text-slate-400'
                                : gradeText === 'A'
                                ? 'bg-emerald-100 text-emerald-800'
                                : gradeText.startsWith('B')
                                ? 'bg-blue-100 text-blue-800'
                                : gradeText.startsWith('C')
                                ? 'bg-teal-100 text-teal-800'
                                : gradeText === 'F'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {gradeText}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[11px] font-medium">{row.remark}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
