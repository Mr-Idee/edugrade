/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ReportCardView } from './ReportCardView';
import {
  calculateCumulativePercentage,
  determineGrade
} from '../utils/academicCalculations';
import {
  Printer,
  TrendingUp,
  BarChart3,
  LineChart,
  Layers,
  Calendar,
  Award,
  CheckCircle2
} from 'lucide-react';

export const StudentPortalView: React.FC = () => {
  const {
    students,
    selectedStudentId,
    setSelectedStudentId,
    classSections,
    selectedSectionId,
    setSelectedSectionId,
    schoolProfile,
    currentTerm,
    setCurrentTerm,
    terms,
    activeReportType,
    setActiveReportType,
    includedTermsForAnnual,
    toggleAnnualTermInclusion,
    subjects,
    assessmentComponents,
    enrollments,
    scores,
    termSubjectRecords,
    getStudentAnnualSummary
  } = useApp();

  const [showProgressCharts, setShowProgressCharts] = useState(false);

  const sectionStudents = useMemo(() => {
    return students.filter(st => st.currentSectionId === selectedSectionId);
  }, [students, selectedSectionId]);

  const activeStudent = useMemo(() => {
    return sectionStudents.find(s => s.id === selectedStudentId) || sectionStudents[0] || students[0];
  }, [sectionStudents, selectedStudentId, students]);

  const activeSection = useMemo(() => {
    return classSections.find(sec => sec.id === activeStudent?.currentSectionId) || classSections[0];
  }, [classSections, activeStudent]);

  const annualSummary = useMemo(() => {
    return getStudentAnnualSummary(activeStudent.id);
  }, [getStudentAnnualSummary, activeStudent]);

  const isSenior = activeSection?.levelType === 'SENIOR';
  const sortedIncludedTerms = useMemo(() => {
    return [...includedTermsForAnnual].sort((a, b) => a - b);
  }, [includedTermsForAnnual]);

  // Compute subject-level progress data using the exact same settings as the Report Sheet
  const subjectProgressData = useMemo(() => {
    if (!activeStudent || !activeSection) return [];

    const activeComponents = assessmentComponents.filter(c => c.levelType === activeSection.levelType);
    const maxCa = activeComponents.reduce((acc, c) => acc + c.maxScore, 0) || (isSenior ? 30 : 40);

    const applicableSubjects = subjects.filter(sub =>
      isSenior
        ? sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
        : sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH'
    );

    return applicableSubjects
      .map(sub => {
        const enr = enrollments.find(
          e =>
            e.studentId === activeStudent.id &&
            e.subjectId === sub.id &&
            e.sectionId === activeSection.id
        );
        const isIncluded = activeSection.levelType === 'JUNIOR' ? true : (enr !== undefined ? enr.isIncluded : true);

        let baseRawTotal = 0;
        activeComponents.forEach(comp => {
          const sc = scores.find(
            s => s.studentId === activeStudent.id && s.subjectId === sub.id && s.componentId === comp.id
          );
          if (sc && sc.score !== null) baseRawTotal += sc.score;
        });
        baseRawTotal = Number(baseRawTotal.toFixed(1));
        const baseCum100 = calculateCumulativePercentage(baseRawTotal, maxCa);

        const rec1 = termSubjectRecords.find(
          r => r.studentId === activeStudent.id && r.subjectId === sub.id && r.termId === 1
        );
        const rec2 = termSubjectRecords.find(
          r => r.studentId === activeStudent.id && r.subjectId === sub.id && r.termId === 2
        );
        const rec3 = termSubjectRecords.find(
          r => r.studentId === activeStudent.id && r.subjectId === sub.id && r.termId === 3
        );

        const term1Pct = activeReportType === 'MID_TERM'
          ? baseCum100
          : (rec1?.totalScore ?? baseCum100);
        const term2Pct = activeReportType === 'MID_TERM'
          ? calculateCumulativePercentage(rec2?.ca1Score ?? Math.min(maxCa, baseRawTotal + 1), maxCa)
          : (rec2?.totalScore ?? Math.min(100, baseCum100 + 2));
        const term3Pct = activeReportType === 'MID_TERM'
          ? calculateCumulativePercentage(rec3?.ca1Score ?? Math.min(maxCa, baseRawTotal + 2), maxCa)
          : (rec3?.totalScore ?? Math.min(100, baseCum100 + 4));

        const termMap: Record<number, number> = {
          1: Number(term1Pct.toFixed(1)),
          2: Number(term2Pct.toFixed(1)),
          3: Number(term3Pct.toFixed(1))
        };

        const selectedVals = sortedIncludedTerms.map(tId => termMap[tId] ?? 0);
        const selectedCumulativeAvg = selectedVals.length > 0
          ? Number((selectedVals.reduce((a, b) => a + b, 0) / selectedVals.length).toFixed(1))
          : baseCum100;

        const activeScore =
          activeReportType === 'ANNUAL' || sortedIncludedTerms.length > 1
            ? selectedCumulativeAvg
            : termMap[currentTerm.id] ?? baseCum100;

        const gradeInfo = determineGrade(activeScore, activeSection.levelType);

        return {
          subjectId: sub.id,
          subjectName: sub.name,
          shortName: sub.code || sub.name.slice(0, 6).toUpperCase(),
          isIncluded,
          term1Pct: termMap[1],
          term2Pct: termMap[2],
          term3Pct: termMap[3],
          selectedCumulativeAvg,
          activeScore,
          grade: gradeInfo.grade
        };
      })
      .filter(item => item.isIncluded);
  }, [
    activeStudent,
    activeSection,
    assessmentComponents,
    isSenior,
    subjects,
    enrollments,
    scores,
    termSubjectRecords,
    activeReportType,
    sortedIncludedTerms,
    currentTerm.id
  ]);

  // Term averages across included subjects for the Line Graph
  const termProgressionTotals = useMemo(() => {
    const count = subjectProgressData.length || 1;
    const t1 = Number((subjectProgressData.reduce((a, b) => a + b.term1Pct, 0) / count).toFixed(1));
    const t2 = Number((subjectProgressData.reduce((a, b) => a + b.term2Pct, 0) / count).toFixed(1));
    const t3 = Number((subjectProgressData.reduce((a, b) => a + b.term3Pct, 0) / count).toFixed(1));
    const cum = Number((subjectProgressData.reduce((a, b) => a + b.selectedCumulativeAvg, 0) / count).toFixed(1));
    return { t1, t2, t3, cum };
  }, [subjectProgressData]);

  // SVG Line Chart coordinates for Subject-by-Subject Multi-Term Trajectory
  const svgWidth = 860;
  const svgHeight = 250;
  const padLeft = 45;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 55;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getPointCoords = (index: number, total: number, value: number) => {
    const x = total > 1 ? padLeft + (index / (total - 1)) * plotW : padLeft + plotW / 2;
    const clamped = Math.max(0, Math.min(100, value));
    const y = padTop + plotH - (clamped / 100) * plotH;
    return { x, y };
  };

  return (
    <div className="space-y-6">
      {/* Student Profile & Mode Selector Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black text-xl shadow-md">
              {activeStudent.fullName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 uppercase">
                  Student / Parent Portal
                </span>
                <span className="text-xs text-slate-400 font-mono">• {activeStudent.admissionNumber}</span>
              </div>
              <h2 className="text-xl font-black text-slate-900 mt-1">{activeStudent.fullName}</h2>
              <p className="text-xs text-slate-500">
                {activeSection?.name} • Session {schoolProfile.currentSession} • {schoolProfile.name}
              </p>
            </div>
          </div>

          {/* Action Buttons & Progress Charts Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Button to load Line Graphs and Bar Charts of Student Progress */}
            <button
              type="button"
              onClick={() => setShowProgressCharts(prev => !prev)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all shadow-sm cursor-pointer ${
                showProgressCharts
                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
              }`}
            >
              <LineChart className="w-4 h-4" />
              <span>
                {showProgressCharts
                  ? 'Hide Progress Line & Bar Charts'
                  : 'Load Progress Charts (Line & Bar)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Transcript</span>
            </button>
          </div>
        </div>

        {/* Quick Annual Summary Strip */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
            <div className="text-[10px] font-bold text-slate-400 uppercase">First Term Avg</div>
            <div className="text-base font-black text-slate-900 mt-0.5">{termProgressionTotals.t1}%</div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Second Term Avg</div>
            <div className="text-base font-black text-slate-900 mt-0.5">{termProgressionTotals.t2}%</div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Third Term Avg</div>
            <div className="text-base font-black text-slate-900 mt-0.5">{termProgressionTotals.t3}%</div>
          </div>
          <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
            <div className="text-[10px] font-bold text-indigo-700 uppercase">
              Selected Terms Cumulative ({sortedIncludedTerms.length}T)
            </div>
            <div className="text-base font-black text-indigo-950 mt-0.5">
              {termProgressionTotals.cum}% ({determineGrade(termProgressionTotals.cum, activeSection?.levelType || 'JUNIOR').grade})
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* INTERACTIVE STUDENT PROGRESS ANALYTICS (LINE GRAPHS & BAR CHARTS)          */}
      {/* Synchronized with the exact Report Sheet settings (Term, Report Type, etc.) */}
      {/* ========================================================================= */}
      {showProgressCharts && (
        <div
          data-testid="student-progress-charts"
          className="bg-white rounded-2xl shadow-sm border border-indigo-200 p-5 space-y-6 print:hidden"
        >
          {/* Synced Report Settings Control Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 flex items-center space-x-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Synchronized with Report Sheet Settings</span>
                </span>
                <span className="text-xs font-bold text-slate-500">
                  • {activeReportType === 'MID_TERM' ? 'Mid-Term (CA1)' : activeReportType === 'EXAM_TERM' ? 'Term Exam (CA+Exam)' : 'Yearly Cumulative'}
                </span>
              </div>
              <h3 className="text-lg font-black text-slate-900 mt-1">
                {activeStudent.fullName} — Visual Academic Progress (Line Graphs &amp; Bar Charts)
              </h3>
              <p className="text-xs text-slate-500">
                Showing {subjectProgressData.length} included subjects for {activeSection?.name} • Active Term: {currentTerm.name} TERM • Included Cumulative Terms:{' '}
                {sortedIncludedTerms.map(t => `${t === 1 ? '1st' : t === 2 ? '2nd' : '3rd'} Term`).join(', ')}
              </p>
            </div>

            {/* Quick Synchronized Term & Cumulative Checkboxes inside Chart Panel */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                {terms.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCurrentTerm(t)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase transition-all cursor-pointer ${
                      currentTerm.id === t.id
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-2.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl text-xs">
                <Layers className="w-3.5 h-3.5 text-amber-700" />
                {[
                  { id: 1, label: '1st Term' },
                  { id: 2, label: '2nd Term' },
                  { id: 3, label: '3rd Term' }
                ].map(t => (
                  <label key={t.id} className="flex items-center space-x-1 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includedTermsForAnnual.includes(t.id)}
                      onChange={() => toggleAnnualTermInclusion(t.id)}
                      className="rounded text-indigo-600 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* 1. LINE GRAPH: Multi-Term & Cumulative Subject Trajectory */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <LineChart className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-black text-slate-900 uppercase">
                  1. Student Progress Line Graph — Subject Trajectory Across Selected Terms
                </h4>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                {includedTermsForAnnual.includes(1) && (
                  <span className="flex items-center space-x-1.5 text-blue-600">
                    <span className="w-3 h-1 bg-blue-600 inline-block rounded"></span>
                    <span>1st Term (%)</span>
                  </span>
                )}
                {includedTermsForAnnual.includes(2) && (
                  <span className="flex items-center space-x-1.5 text-amber-600">
                    <span className="w-3 h-1 bg-amber-500 inline-block rounded"></span>
                    <span>2nd Term (%)</span>
                  </span>
                )}
                {includedTermsForAnnual.includes(3) && (
                  <span className="flex items-center space-x-1.5 text-emerald-600">
                    <span className="w-3 h-1 bg-emerald-600 inline-block rounded"></span>
                    <span>3rd Term (%)</span>
                  </span>
                )}
                <span className="flex items-center space-x-1.5 text-indigo-900">
                  <span className="w-3 h-1.5 bg-indigo-900 inline-block rounded"></span>
                  <span>Cumulative Avg Line</span>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full min-w-[680px] h-64 bg-white rounded-xl border border-slate-200"
              >
                {/* Horizontal Grid Lines (0%, 25%, 50%, 75%, 100%) */}
                {[0, 25, 50, 75, 100].map(val => {
                  const y = padTop + plotH - (val / 100) * plotH;
                  const isPassLine = val === 50;
                  return (
                    <g key={val}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={svgWidth - padRight}
                        y2={y}
                        stroke={isPassLine ? '#f43f5e' : '#e2e8f0'}
                        strokeWidth={isPassLine ? 1.5 : 1}
                        strokeDasharray={isPassLine ? '5,4' : undefined}
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[10px] fill-slate-500 font-mono font-bold"
                      >
                        {val}%
                      </text>
                    </g>
                  );
                })}

                {/* Term 1 Line (if checked) */}
                {includedTermsForAnnual.includes(1) && subjectProgressData.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeOpacity="0.65"
                    points={subjectProgressData
                      .map((d, i) => {
                        const pt = getPointCoords(i, subjectProgressData.length, d.term1Pct);
                        return `${pt.x},${pt.y}`;
                      })
                      .join(' ')}
                  />
                )}

                {/* Term 2 Line (if checked) */}
                {includedTermsForAnnual.includes(2) && subjectProgressData.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeOpacity="0.7"
                    points={subjectProgressData
                      .map((d, i) => {
                        const pt = getPointCoords(i, subjectProgressData.length, d.term2Pct);
                        return `${pt.x},${pt.y}`;
                      })
                      .join(' ')}
                  />
                )}

                {/* Term 3 Line (if checked) */}
                {includedTermsForAnnual.includes(3) && subjectProgressData.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeOpacity="0.75"
                    points={subjectProgressData
                      .map((d, i) => {
                        const pt = getPointCoords(i, subjectProgressData.length, d.term3Pct);
                        return `${pt.x},${pt.y}`;
                      })
                      .join(' ')}
                  />
                )}

                {/* Primary Cumulative / Active Score Bold Trajectory Line */}
                {subjectProgressData.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#312e81"
                    strokeWidth="3"
                    points={subjectProgressData
                      .map((d, i) => {
                        const pt = getPointCoords(i, subjectProgressData.length, d.activeScore);
                        return `${pt.x},${pt.y}`;
                      })
                      .join(' ')}
                  />
                )}

                {/* Data Points & X-Axis Subject Labels */}
                {subjectProgressData.map((d, i) => {
                  const pt = getPointCoords(i, subjectProgressData.length, d.activeScore);
                  return (
                    <g key={d.subjectId}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={4.5}
                        fill={d.activeScore >= 50 ? '#4f46e5' : '#e11d48'}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                      <text
                        x={pt.x}
                        y={pt.y - 8}
                        textAnchor="middle"
                        className="text-[9px] font-mono font-bold fill-slate-900"
                      >
                        {d.activeScore}%
                      </text>
                      <text
                        x={pt.x}
                        y={svgHeight - 22}
                        textAnchor="middle"
                        className="text-[9px] font-bold fill-slate-700"
                      >
                        {d.subjectName.slice(0, 10)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* 2. BAR CHART: Subject-by-Subject Comparative Bar Chart */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-black text-slate-900 uppercase">
                  2. Subject Performance Bar Chart — Scores &amp; Term Comparison
                </h4>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                Bars reflect selected terms ({sortedIncludedTerms.map(t => `${t}T`).join(' + ')}) &amp; cumulative grade
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {subjectProgressData.map(item => {
                const isPass = item.activeScore >= 50;
                return (
                  <div
                    key={item.subjectId}
                    className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-slate-900 uppercase truncate pr-2">
                        {item.subjectName}
                      </span>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="font-mono font-black text-indigo-950 text-xs">
                          {item.activeScore.toFixed(1)}%
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            item.grade === 'F'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          Grade {item.grade}
                        </span>
                      </div>
                    </div>

                    {/* Primary Cumulative Bar */}
                    <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isPass ? 'bg-indigo-600' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.max(4, Math.min(100, item.activeScore))}%` }}
                      />
                    </div>

                    {/* Sub-bars for each checked term */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-0.5">
                      {includedTermsForAnnual.includes(1) && (
                        <span>1st Term: <strong className="text-blue-700">{item.term1Pct}%</strong></span>
                      )}
                      {includedTermsForAnnual.includes(2) && (
                        <span>2nd Term: <strong className="text-amber-700">{item.term2Pct}%</strong></span>
                      )}
                      {includedTermsForAnnual.includes(3) && (
                        <span>3rd Term: <strong className="text-emerald-700">{item.term3Pct}%</strong></span>
                      )}
                      <span>Cum Avg: <strong className="text-slate-900">{item.selectedCumulativeAvg}%</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Render the Official Report Card matching PDF */}
      <ReportCardView />
    </div>
  );
};
