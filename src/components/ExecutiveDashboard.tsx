/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Users,
  Award,
  TrendingUp,
  FileDown,
  CheckCircle,
  ChevronRight,
  BookOpen,
  Calendar,
  Sparkles
} from 'lucide-react';
import {
  determineGrade,
  divideRawCaByTwo,
  formatRankOrdinal
} from '../utils/academicCalculations';
import { downloadExecutiveClassRecordsPdf, downloadSubjectScoresPdf } from '../utils/pdfGenerator';
import { canPrintOrDownload } from '../utils/rbacAndAuth';

interface ExecutiveDashboardProps {
  onSelectStudent: (studentId: number) => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ onSelectStudent }) => {
  const {
    schoolProfile,
    currentRole,
    currentUser,
    currentSession,
    currentSection,
    classSections,
    selectedSectionId,
    setSelectedSectionId,
    students,
    subjects,
    termSummaries,
    termSubjectRecords,
    scores,
    assessmentComponents,
    enrollments,
    currentTerm,
    setCurrentTerm,
    terms
  } = useApp();

  const [pdfSavedNotice, setPdfSavedNotice] = useState(false);
  const [selectedExportSubjectId, setSelectedExportSubjectId] = useState<number | ''>('');

  const isSenior = currentSection.levelType === 'SENIOR';
  const maxCa = isSenior ? 30.0 : 40.0;
  const maxExam = isSenior ? 70.0 : 60.0;

  // Students in this section
  const sectionStudents = useMemo(() => {
    return students.filter(st => st.currentSectionId === selectedSectionId);
  }, [students, selectedSectionId]);

  // Applicable subjects for this class level
  const applicableSubjects = useMemo(() => {
    return subjects.filter(s =>
      isSenior
        ? s.applicableLevel === 'SENIOR' || s.applicableLevel === 'BOTH'
        : s.applicableLevel === 'JUNIOR' || s.applicableLevel === 'BOTH'
    );
  }, [subjects, isSenior]);

  const levelComponents = useMemo(() => {
    return assessmentComponents.filter(c => c.levelType === currentSection.levelType);
  }, [assessmentComponents, currentSection.levelType]);
  const exportComponents = useMemo(
    () =>
      levelComponents
        .filter(component => component.termId === currentTerm.id)
        .sort((a, b) => a.weightOrder - b.weightOrder),
    [levelComponents, currentTerm.id]
  );

  // Compute each student's Active Term Running Total Marks & Summary dynamically for currentTerm.id
  // Handles blank/missing scores in new sessions or new students gracefully with 0
  const studentRows = useMemo(() => {
    const computed = sectionStudents.map(student => {
      const existingSummary = termSummaries.find(
        s =>
          s.studentId === student.id &&
          s.sectionId === selectedSectionId &&
          s.termId === currentTerm.id
      );

      let runningTermTotalObtained = 0;
      let runningCa1Total = 0;
      let runningCa2Total = 0;
      let runningExamTotal = 0;
      let includedSubjectCount = 0;

      applicableSubjects.forEach(sub => {
        const enr = enrollments.find(
          e =>
            e.studentId === student.id &&
            e.subjectId === sub.id &&
            e.sectionId === selectedSectionId
        );
        const isIncluded =
          currentSection.levelType === 'JUNIOR' ? true : enr ? enr.isIncluded : true;
        if (!isIncluded) return;

        includedSubjectCount++;

        const termRec = termSubjectRecords.find(
          r =>
            r.studentId === student.id &&
            r.subjectId === sub.id &&
            r.termId === currentTerm.id
        );

        // Live CA1 raw score from Assessment Grid (for Term 1 or live edits)
        let rawCaFromGrid = 0;
        let hasLiveGridScore = false;
        levelComponents.forEach(comp => {
          const sc = scores.find(
            s =>
              s.studentId === student.id &&
              s.subjectId === sub.id &&
              s.componentId === comp.id
          );
          if (sc && sc.score !== null && !Number.isNaN(Number(sc.score))) {
            rawCaFromGrid += Number(sc.score);
            hasLiveGridScore = true;
          }
        });

        if (termRec) {
          const ca1Val =
            currentTerm.id === 1 && hasLiveGridScore
              ? divideRawCaByTwo(rawCaFromGrid, currentSection.levelType)
              : Number(termRec.ca1Score || 0);
          const ca2Val = Number(termRec.ca2Score || 0);
          const examVal = Number(termRec.examScore || 0);
          const subTotal = Number(
            Math.min(100, ca1Val + ca2Val + examVal).toFixed(1)
          );
          runningCa1Total += ca1Val;
          runningCa2Total += ca2Val;
          runningExamTotal += examVal;
          runningTermTotalObtained += subTotal;
        } else if (currentTerm.id === 1 && hasLiveGridScore) {
          const ca1Val = divideRawCaByTwo(rawCaFromGrid, currentSection.levelType);
          runningCa1Total += ca1Val;
          runningTermTotalObtained += ca1Val;
        }
      });

      const totalPossible = includedSubjectCount * 100;
      const totalObtained = Number(runningTermTotalObtained.toFixed(1));
      const cumulativePercentage =
        includedSubjectCount > 0
          ? Number((totalObtained / includedSubjectCount).toFixed(1))
          : existingSummary?.cumulativePercentage ?? 0;
      const gradeInfo = determineGrade(cumulativePercentage, currentSection.levelType);

      return {
        student,
        includedSubjectCount,
        runningCa1Total: Number(runningCa1Total.toFixed(1)),
        runningCa2Total: Number(runningCa2Total.toFixed(1)),
        runningExamTotal: Number(runningExamTotal.toFixed(1)),
        summary: {
          id: existingSummary?.id || student.id,
          studentId: student.id,
          sectionId: selectedSectionId,
          termId: currentTerm.id,
          totalScoreObtained: totalObtained,
          totalPossibleScore: totalPossible,
          cumulativePercentage,
          cumulativeGrade: gradeInfo.grade,
          classRank: existingSummary?.classRank || 1,
          totalStudentsInSection: sectionStudents.length,
          principalRemark: existingSummary?.principalRemark || '',
          teacherRemark: existingSummary?.teacherRemark || '',
          isPublished: existingSummary?.isPublished ?? true
        }
      };
    });

    // Sort by running total / cumulative percentage descending and assign rank
    const sorted = [...computed].sort(
      (a, b) => b.summary.totalScoreObtained - a.summary.totalScoreObtained
    );
    return sorted.map((row, idx) => ({
      ...row,
      summary: {
        ...row.summary,
        classRank: idx + 1
      }
    }));
  }, [
    sectionStudents,
    termSummaries,
    selectedSectionId,
    currentTerm.id,
    applicableSubjects,
    enrollments,
    currentSection.levelType,
    termSubjectRecords,
    levelComponents,
    scores,
    maxCa,
    maxExam
  ]);

  // Analytics Metrics for Active Term
  const metrics = useMemo(() => {
    if (studentRows.length === 0) {
      return {
        totalStudents: 0,
        averagePct: 0,
        classRunningTotalSum: 0,
        passRatePct: 0,
        topStudent: null,
        lowestStudent: null,
        gradeCounts: {} as Record<string, number>
      };
    }

    const totalStudents = studentRows.length;
    const sumPct = studentRows.reduce((acc, curr) => acc + curr.summary.cumulativePercentage, 0);
    const classRunningTotalSum = Number(
      studentRows.reduce((acc, curr) => acc + curr.summary.totalScoreObtained, 0).toFixed(1)
    );
    const averagePct = Number((sumPct / totalStudents).toFixed(1));

    const passCount = studentRows.filter(s => s.summary.cumulativePercentage >= 50.0).length;
    const passRatePct = Number(((passCount / totalStudents) * 100).toFixed(1));

    // Grade frequency distribution
    const gradeCounts: Record<string, number> = {};
    studentRows.forEach(s => {
      const g = s.summary.cumulativeGrade;
      gradeCounts[g] = (gradeCounts[g] || 0) + 1;
    });

    const topRow = studentRows[0];
    const lowestRow = studentRows[studentRows.length - 1];

    return {
      totalStudents,
      averagePct,
      classRunningTotalSum,
      passRatePct,
      topStudent: topRow ? { student: topRow.student, summary: topRow.summary } : null,
      lowestStudent: lowestRow ? { student: lowestRow.student, summary: lowestRow.summary } : null,
      gradeCounts
    };
  }, [studentRows]);

  // Subject Performance Ranking for Active Term
  const subjectAverages = useMemo(() => {
    const result = applicableSubjects
      .map(sub => {
        let sumPct = 0;
        let count = 0;

        sectionStudents.forEach(st => {
          const enr = enrollments.find(
            e => e.studentId === st.id && e.subjectId === sub.id && e.sectionId === selectedSectionId
          );
          const isIncluded =
            currentSection.levelType === 'JUNIOR' ? true : enr ? enr.isIncluded : true;
          if (isIncluded) {
            const termRec = termSubjectRecords.find(
              r => r.studentId === st.id && r.subjectId === sub.id && r.termId === currentTerm.id
            );
            if (termRec) {
              sumPct += Number(termRec.totalScore || 0);
              count++;
            } else {
              let raw = 0;
              levelComponents.forEach(c => {
                const sc = scores.find(
                  s => s.studentId === st.id && s.subjectId === sub.id && s.componentId === c.id
                );
                if (sc && sc.score !== null) raw += sc.score;
              });
              const pct = maxCa > 0 ? (raw / maxCa) * 100 : 0;
              sumPct += pct;
              count++;
            }
          }
        });

        const avgPct = count > 0 ? Number((sumPct / count).toFixed(1)) : 0;
        return {
          subject: sub,
          avgPct,
          studentCount: count
        };
      })
      .filter(r => r.studentCount > 0)
      .sort((a, b) => b.avgPct - a.avgPct);

    return result;
  }, [
    applicableSubjects,
    sectionStudents,
    enrollments,
    selectedSectionId,
    currentSection.levelType,
    termSubjectRecords,
    currentTerm.id,
    levelComponents,
    scores,
    maxCa
  ]);

  // Download Class Records in PDF format with Dashboard Formatting
  const handleDownloadClassPdf = () => {
    if (!canPrintOrDownload(currentRole)) return;
    downloadExecutiveClassRecordsPdf({
      schoolName: schoolProfile.name,
      sectionName: currentSection.name,
      levelType: currentSection.levelType,
      formTutorName: currentSection.classTeacherName,
      termName: currentTerm.name,
      sessionName: currentSession.name,
      totalStudents: metrics.totalStudents,
      averagePct: metrics.averagePct,
      passRatePct: metrics.passRatePct,
      topStudentName: metrics.topStudent?.student.fullName || 'N/A',
      topStudentScore: metrics.topStudent
        ? `${metrics.topStudent.summary.cumulativePercentage}% (${metrics.topStudent.summary.cumulativeGrade})`
        : 'N/A',
      subjectAverages: subjectAverages.map(s => ({
        name: s.subject.name,
        category: s.subject.category,
        avgPct: s.avgPct
      })),
      studentRows: studentRows.map(({ student, summary }) => ({
        rank: summary.classRank,
        admissionNumber: student?.admissionNumber || '',
        fullName: student?.fullName || '',
        gender: student?.gender || '',
        totalObtained: summary.totalScoreObtained,
        totalPossible: summary.totalPossibleScore,
        cumulativePercentage: summary.cumulativePercentage,
        cumulativeGrade: summary.cumulativeGrade
      }))
    });

    setPdfSavedNotice(true);
    setTimeout(() => setPdfSavedNotice(false), 3000);
  };

  const handleDownloadSubjectScores = () => {
    if (!canPrintOrDownload(currentRole)) return;
    const subject =
      applicableSubjects.find(item => item.id === selectedExportSubjectId) || applicableSubjects[0];
    if (!subject) return;

    downloadSubjectScoresPdf({
      schoolName: schoolProfile.name,
      sectionName: currentSection.name,
      sessionName: currentSession.name,
      termName: currentTerm.name,
      subjectName: subject.name,
      components: exportComponents.map(component => component.name),
      rows: sectionStudents
        .map(student => {
          const scoreValues = exportComponents.map(component =>
            scores.find(
              score =>
                score.studentId === student.id &&
                score.subjectId === subject.id &&
                score.componentId === component.id
            )?.score ?? null
          );
          const rawCaTotal = scoreValues.some(score => score !== null)
            ? Number(scoreValues.reduce<number>((sum, score) => sum + (score ?? 0), 0).toFixed(1))
            : null;
          const termRecord = termSubjectRecords.find(
            record =>
              record.studentId === student.id &&
              record.subjectId === subject.id &&
              record.termId === currentTerm.id
          );
          const ca1Score =
            termRecord?.ca1Score ??
            (currentTerm.id === 1 && rawCaTotal !== null
              ? divideRawCaByTwo(rawCaTotal, currentSection.levelType)
              : null              );

              return {
                admissionNumber: student.admissionNumber,
                fullName: student.fullName,
                componentScores: scoreValues,
                rawCaTotal,
            ca1Score,
            ca2Score: termRecord?.ca2Score ?? null,
            examScore: termRecord?.examScore ?? null,
            totalScore: termRecord?.totalScore ?? null,
            grade: termRecord?.grade || ''
          };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }))
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Section Picker, Prominent Active Term Display/Switcher, Active Username & PDF Download Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 uppercase">
                {currentSection.levelType} Secondary
              </span>
              <span
                data-testid="dashboard-active-term-badge"
                className="inline-flex items-center space-x-1.5 text-xs font-black px-3 py-0.5 rounded-full bg-amber-400 text-slate-950 shadow-2xs uppercase tracking-wide"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-900" />
                <span>
                  Active Term: {currentTerm.name} TERM ({currentSession.name})
                </span>
              </span>
              <span
                data-testid="dashboard-active-username"
                className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200"
              >
                User: @{currentUser.username || 'superadmin'} ({currentUser.fullName})
              </span>
              <span className="text-xs text-slate-400">
                • Form Tutor: {currentSection.classTeacherName}
              </span>
              {pdfSavedNotice && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  ✓ Saved Class Records in PDF!
                </span>
              )}
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              {currentSection.name} Academic Performance Dashboard — {currentTerm.name} Term
            </h2>
            <p className="text-xs text-slate-500">
              Live running total marks for each student in the active{' '}
              <strong className="text-slate-700">{currentTerm.name} TERM</strong> ({currentSession.name} Session), cumulative rankings, and subject performance averages.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick Section Picker */}
            <select
              aria-label="Select Class Section"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(Number(e.target.value))}
              className="px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {classSections.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.levelType})
                </option>
              ))}
            </select>

            {/* Download Class Records in PDF Button (Only for Super Admin, Principal & Vice Principal) */}
            {canPrintOrDownload(currentRole) && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadClassPdf}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Download Class Records (PDF)</span>
                </button>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                  <select
                    aria-label="Select subject for class score export"
                    data-testid="dashboard-export-subject-select"
                    value={
                      applicableSubjects.some(subject => subject.id === selectedExportSubjectId)
                        ? selectedExportSubjectId
                        : applicableSubjects[0]?.id ?? ''
                    }
                    onChange={event => setSelectedExportSubjectId(Number(event.target.value))}
                    className="max-w-48 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800"
                  >
                    {applicableSubjects.map(subject => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="dashboard-download-subject-scores"
                    onClick={handleDownloadSubjectScores}
                    disabled={applicableSubjects.length === 0}
                    className="flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileDown className="h-4 w-4" />
                    <span>Subject Scores (PDF)</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Active Term Visibility & Switcher Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Viewing Running Totals For Active Term:</span>
            </span>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
              {terms.map(t => {
                const isSelected = currentTerm.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`dashboard-term-btn-${t.id}`}
                    onClick={() => setCurrentTerm(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.name} TERM
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-xs text-slate-600 font-semibold">
            Session: <span className="font-black text-indigo-900">{currentSession.name}</span> •{' '}
            Institution: <span className="font-bold text-slate-800">{schoolProfile.name}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Registered Enrolled
            </div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{metrics.totalStudents}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Active in {currentTerm.name} Term ({currentSession.name})
            </div>
          </div>
        </div>

        {/* Class Average Cumulative */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {currentTerm.name} Term Class Avg
            </div>
            <div className="text-2xl font-black text-indigo-900 mt-0.5">{metrics.averagePct}%</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Class Running Total: {metrics.classRunningTotalSum} pts
            </div>
          </div>
        </div>

        {/* Pass Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Pass Rate (≥50%)
            </div>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">{metrics.passRatePct}%</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {Math.round((metrics.passRatePct / 100) * metrics.totalStudents)} of{' '}
              {metrics.totalStudents} students
            </div>
          </div>
        </div>

        {/* Top Performer */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
          <div className="truncate">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {currentTerm.name} Term Leader (1st)
            </div>
            <div className="text-sm font-black text-slate-900 mt-0.5 truncate">
              {metrics.topStudent?.student.fullName || 'N/A'}
            </div>
            <div className="text-xs font-semibold text-amber-600 mt-0.5">
              {metrics.topStudent
                ? `${metrics.topStudent.summary.totalScoreObtained} / ${metrics.topStudent.summary.totalPossibleScore} (${metrics.topStudent.summary.cumulativePercentage}%)`
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Charts & Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade Distribution Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {currentTerm.name} Term Grade Frequency Distribution
              </h3>
              <p className="text-xs text-slate-500">
                Student count distributed across official institutional grade boundaries
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
              {isSenior ? 'Senior Scale (A-F)' : 'Junior Scale (A-F)'}
            </span>
          </div>

          <div className="space-y-2.5 pt-2">
            {(isSenior
              ? ['A', 'B1', 'B2', 'C4', 'C5', 'C6', 'D', 'E', 'F']
              : ['A', 'B', 'C', 'D', 'E', 'F']
            ).map((grade) => {
              const count = metrics.gradeCounts[grade] || 0;
              const pct = metrics.totalStudents > 0 ? (count / metrics.totalStudents) * 100 : 0;

              return (
                <div key={grade} className="flex items-center space-x-3 text-xs">
                  <span className="w-8 font-black text-slate-700">{grade}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden flex items-center px-2 relative">
                    <div
                      className={`absolute left-0 top-0 bottom-0 rounded-lg transition-all duration-500 ${
                        grade === 'A'
                          ? 'bg-emerald-500'
                          : grade.startsWith('B')
                          ? 'bg-blue-500'
                          : grade.startsWith('C')
                          ? 'bg-teal-500'
                          : grade === 'D' || grade === 'E'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                    />
                    <span className="relative z-10 text-[11px] font-bold text-slate-900 ml-1">
                      {count > 0 ? `${count} students (${pct.toFixed(0)}%)` : '0'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subject Performance Leaderboard */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {currentTerm.name} Term Subject Performance Ranking
              </h3>
              <p className="text-xs text-slate-500">
                Subjects ranked by section average percentage in {currentTerm.name} Term
              </p>
            </div>
            <BookOpen className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[300px] pr-1">
            {subjectAverages.slice(0, 8).map((item, idx) => (
              <div
                key={item.subject.id}
                className="p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl flex items-center justify-between text-xs transition-colors"
              >
                <div className="flex items-center space-x-2.5">
                  <span className="w-5 text-center font-bold font-mono text-slate-400">
                    {idx + 1}
                  </span>
                  <div>
                    <span className="font-bold text-slate-900">{item.subject.name}</span>
                    <span className="ml-1.5 text-[10px] text-slate-400 uppercase">
                      ({item.subject.category})
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="font-mono font-black text-indigo-950">{item.avgPct}%</span>
                  <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{ width: `${Math.min(100, item.avgPct)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Class Student Leaderboard Table with Running Total Marks for Active Term */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Class Student Leaderboard &amp; Running Total Marks ({currentTerm.name} Term)
            </h3>
            <p className="text-xs text-slate-500">
              Displaying live running total marks (1st CA + 2nd CA + Exam) for each student in{' '}
              <strong className="text-indigo-700">{currentTerm.name} TERM</strong> ({currentSession.name})
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900">
              Active Term: {currentTerm.name} TERM
            </span>
            <span className="text-xs font-semibold text-slate-600">
              {studentRows.length} Students Ranked
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3 w-16 text-center">Rank</th>
                <th className="py-3 px-3 w-32">Adm. No</th>
                <th className="py-3 px-3">Student Full Name</th>
                <th className="py-3 px-3 text-center">CA + Exam Breakdown</th>
                <th
                  className="py-3 px-3 text-center bg-amber-50/70 text-slate-900"
                  data-testid="dashboard-running-total-header"
                >
                  {currentTerm.name} Term Running Total Marks
                </th>
                <th className="py-3 px-3 text-center">Cumulative %</th>
                <th className="py-3 px-3 text-center">Overall Grade</th>
                <th className="py-3 px-3 text-center w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {studentRows.map(
                ({
                  student,
                  summary,
                  runningCa1Total,
                  runningCa2Total,
                  runningExamTotal
                }) => {
                  if (!student) return null;

                  return (
                    <tr
                      key={`st-${student.id}-${summary.termId}`}
                      className="hover:bg-indigo-50/30 transition-colors"
                    >
                      {/* Rank */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs ${
                            summary.classRank === 1
                              ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-400'
                              : summary.classRank === 2
                              ? 'bg-slate-200 text-slate-800'
                              : summary.classRank === 3
                              ? 'bg-amber-700/20 text-amber-900'
                              : 'text-slate-600'
                          }`}
                        >
                          {formatRankOrdinal(summary.classRank)}
                        </span>
                      </td>

                      {/* Admission Number */}
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-600 font-medium">
                        {student.admissionNumber}
                      </td>

                      {/* Student Name */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{student.fullName}</div>
                        <div className="text-[10px] text-slate-400">
                          {student.gender} • {student.guardianEmail}
                        </div>
                      </td>

                      {/* CA1 + CA2 + Exam Breakdown */}
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-600">
                        <span>CA1: {runningCa1Total}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span>CA2: {runningCa2Total}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span>Ex: {runningExamTotal}</span>
                      </td>

                      {/* Running Total Marks for Active Term */}
                      <td
                        className="py-2.5 px-3 text-center font-mono font-black text-slate-900 bg-amber-50/40"
                        data-testid={`student-running-total-${student.id}`}
                      >
                        {summary.totalScoreObtained.toFixed(1)}{' '}
                        <span className="text-slate-400 font-normal">
                          / {summary.totalPossibleScore}
                        </span>
                      </td>

                      {/* Cumulative % */}
                      <td className="py-2.5 px-3 text-center font-mono font-black text-sm text-indigo-950">
                        {summary.cumulativePercentage.toFixed(1)}%
                      </td>

                      {/* Overall Grade */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs ${
                            summary.cumulativeGrade === 'A'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : summary.cumulativeGrade.startsWith('B')
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : summary.cumulativeGrade.startsWith('C')
                              ? 'bg-teal-100 text-teal-800 border-teal-300'
                              : summary.cumulativeGrade === 'D' || summary.cumulativeGrade === 'E'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          {summary.cumulativeGrade}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onSelectStudent(student.id)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <span>Transcript</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
