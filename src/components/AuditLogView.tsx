/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  auditClassStudentCompleteness,
  detectDuplicateStudents
} from '../utils/academicCalculations';
import {
  downloadAuditTrailPdf,
  downloadClassCompletenessAuditPdf
} from '../utils/pdfGenerator';
import { canPrintOrDownload } from '../utils/rbacAndAuth';
import {
  Search,
  Download,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Users,
  BookOpen,
  FileDown,
  ClipboardCheck,
  History,
  Copy,
  Trash2
} from 'lucide-react';

interface AuditLogViewProps {
  onOpenScoreGrid?: (sectionId: number, subjectId: number) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ onOpenScoreGrid }) => {
  const {
    schoolProfile,
    currentRole,
    currentSession,
    currentTerm,
    classSections,
    selectedSectionId,
    setSelectedSectionId,
    currentSection,
    students,
    deleteStudent,
    subjects,
    assessmentComponents,
    enrollments,
    scores,
    termSubjectRecords,
    auditLogs
  } = useApp();

  const [activeAuditTab, setActiveAuditTab] = useState<'completeness' | 'duplicates' | 'ledger'>('completeness');
  const [completenessFilter, setCompletenessFilter] = useState<'ALL' | 'INCOMPLETE' | 'COMPLETE'>('ALL');
  const [studentSearch, setStudentSearch] = useState('');

  // Duplicate students state
  const [duplicateScope, setDuplicateScope] = useState<'ACTIVE_CLASS' | 'ALL'>('ALL');
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  // Ledger state
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  const duplicateGroups = useMemo(() => {
    return detectDuplicateStudents({
      students,
      classSections,
      scores,
      termSubjectRecords,
      sectionIdFilter: duplicateScope === 'ACTIVE_CLASS' ? selectedSectionId : 'ALL',
      strictExactScoresOnly: true
    });
  }, [students, classSections, scores, termSubjectRecords, duplicateScope, selectedSectionId]);

  const totalDuplicateGroupsAllClasses = useMemo(() => {
    return detectDuplicateStudents({
      students,
      classSections,
      scores,
      termSubjectRecords,
      sectionIdFilter: 'ALL',
      strictExactScoresOnly: true
    }).length;
  }, [students, classSections, scores, termSubjectRecords]);

  const isSenior = currentSection.levelType === 'SENIOR';

  // Applicable subjects for the selected class section
  const applicableSubjects = useMemo(() => {
    return subjects.filter(sub => {
      if (isSenior) {
        return sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH';
      } else {
        return sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH';
      }
    });
  }, [subjects, isSenior]);

  // Active CA components for this class level
  const activeComponents = useMemo(() => {
    return assessmentComponents.filter(c => c.levelType === currentSection.levelType);
  }, [assessmentComponents, currentSection.levelType]);

  // Students in the selected class
  const sectionStudents = useMemo(() => {
    return students.filter(st => st.currentSectionId === selectedSectionId);
  }, [students, selectedSectionId]);

  // Run the Class Student Completeness Audit
  const classAuditRows = useMemo(() => {
    return auditClassStudentCompleteness({
      students: sectionStudents,
      levelType: currentSection.levelType,
      applicableSubjects,
      components: activeComponents,
      enrollments,
      scores,
      sectionId: selectedSectionId
    });
  }, [
    sectionStudents,
    currentSection.levelType,
    applicableSubjects,
    activeComponents,
    enrollments,
    scores,
    selectedSectionId
  ]);

  // Filtered completeness rows
  const filteredCompletenessRows = useMemo(() => {
    return classAuditRows.filter(row => {
      const matchesStatus =
        completenessFilter === 'ALL'
          ? true
          : completenessFilter === 'INCOMPLETE'
          ? !row.isComplete
          : row.isComplete;

      const matchesQuery =
        !studentSearch.trim() ||
        row.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
        row.admissionNumber.toLowerCase().includes(studentSearch.toLowerCase()) ||
        row.missingSubjects.some(m => m.subjectName.toLowerCase().includes(studentSearch.toLowerCase()));

      return matchesStatus && matchesQuery;
    });
  }, [classAuditRows, completenessFilter, studentSearch]);

  // Summary metrics for the completeness checker
  const completenessStats = useMemo(() => {
    const totalStudents = classAuditRows.length;
    const completeStudents = classAuditRows.filter(r => r.isComplete).length;
    const incompleteStudents = totalStudents - completeStudents;
    const totalMissingGrades = classAuditRows.reduce((acc, r) => acc + r.missingSubjectsCount, 0);
    const completionRate = totalStudents > 0 ? Number(((completeStudents / totalStudents) * 100).toFixed(1)) : 100;

    return {
      totalStudents,
      completeStudents,
      incompleteStudents,
      totalMissingGrades,
      completionRate
    };
  }, [classAuditRows]);

  // Filtered Modification Logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const matchesSearch =
        log.studentName.toLowerCase().includes(search.toLowerCase()) ||
        log.subjectName.toLowerCase().includes(search.toLowerCase()) ||
        log.changedBy.toLowerCase().includes(search.toLowerCase()) ||
        log.changeReason.toLowerCase().includes(search.toLowerCase());

      const matchesRole = selectedRole === 'ALL' || log.changedByRole === selectedRole;
      return matchesSearch && matchesRole;
    });
  }, [auditLogs, search, selectedRole]);

  const handleDownloadCompletenessPdf = () => {
    downloadClassCompletenessAuditPdf({
      schoolName: schoolProfile.name,
      sectionName: currentSection.name,
      levelType: currentSection.levelType,
      termName: currentTerm.name,
      sessionName: currentSession.name,
      formTutorName: currentSection.classTeacherName,
      auditRows: filteredCompletenessRows
    });
    setPdfNotice(`Downloaded ${currentSection.name} Completeness Audit (PDF)`);
    setTimeout(() => setPdfNotice(null), 3000);
  };

  const handleDownloadAuditLedgerPdf = () => {
    downloadAuditTrailPdf({
      schoolName: schoolProfile.name,
      sessionName: currentSession.name,
      termName: currentTerm.name,
      logs: filteredLogs
    });
    setPdfNotice('Downloaded Score Audit Trail Ledger (PDF)');
    setTimeout(() => setPdfNotice(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner with Mode Switcher & PDF Download Actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-purple-100 text-purple-800 uppercase flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Academic Quality Assurance &amp; Audit</span>
            </span>
            {pdfNotice && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                ✓ {pdfNotice}
              </span>
            )}
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1">
            Class Missing Results Checker &amp; Score Audit Trail
          </h2>
          <p className="text-xs text-slate-500">
            Verify class result completeness, identify students with missing or incomplete subject grades, and inspect the immutable score modification ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sub-view Switcher */}
          <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              data-testid="audit-tab-completeness"
              onClick={() => setActiveAuditTab('completeness')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeAuditTab === 'completeness'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Missing / Incomplete Results Checker</span>
            </button>
            <button
              type="button"
              data-testid="audit-tab-duplicates"
              onClick={() => setActiveAuditTab('duplicates')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeAuditTab === 'duplicates'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate Students ({totalDuplicateGroupsAllClasses})</span>
            </button>
            <button
              type="button"
              data-testid="audit-tab-ledger"
              onClick={() => setActiveAuditTab('ledger')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeAuditTab === 'ledger'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Score Edit Ledger ({auditLogs.length})</span>
            </button>
          </div>

          {/* PDF Download Button matching current view (Restricted to Super Admin, Principal & Vice Principal) */}
          {canPrintOrDownload(currentRole) && (
            activeAuditTab === 'completeness' ? (
              <button
                type="button"
                onClick={handleDownloadCompletenessPdf}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>Download Class Completeness Audit (PDF)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadAuditLedgerPdf}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Audit Trail (PDF)</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CLASS MISSING / INCOMPLETE RESULTS CHECKER                         */}
      {/* ========================================================================= */}
      {activeAuditTab === 'completeness' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Students in Class</div>
                <div className="text-2xl font-black text-slate-900 mt-0.5">{completenessStats.totalStudents}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{currentSection.name}</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Complete Records</div>
                <div className="text-2xl font-black text-emerald-700 mt-0.5">
                  {completenessStats.completeStudents}{' '}
                  <span className="text-sm font-bold text-slate-400">({completenessStats.completionRate}%)</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">All included subjects graded</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Incomplete Students</div>
                <div className="text-2xl font-black text-rose-600 mt-0.5">{completenessStats.incompleteStudents}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Students with missing grades</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Missing Subject Entries</div>
                <div className="text-2xl font-black text-amber-700 mt-0.5">{completenessStats.totalMissingGrades}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Empty / unentered subject cells</div>
              </div>
            </div>
          </div>

          {/* Class Filter & Status Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Select Class to Check
                </label>
                <select
                  aria-label="Select Class to Check for Missing Results"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(Number(e.target.value))}
                  className="px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-black text-slate-900 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {classSections.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.levelType})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Result Status Filter
                </label>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setCompletenessFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      completenessFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Students ({classAuditRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletenessFilter('INCOMPLETE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      completenessFilter === 'INCOMPLETE'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    Missing / Incomplete ({completenessStats.incompleteStudents})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletenessFilter('COMPLETE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      completenessFilter === 'COMPLETE'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    Complete ({completenessStats.completeStudents})
                  </button>
                </div>
              </div>
            </div>

            <div className="relative min-w-[240px] flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search student or missing subject name..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Student Result Completeness Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  {currentSection.name} — Student Subject Inclusion &amp; Missing Grades Report
                </h3>
                <p className="text-xs text-slate-500">
                  Lists every student in the class, total number of subjects included, and any subjects with empty (unentered) score cells. <span className="font-bold text-slate-700">Note: 0 is a valid entered score; only empty cells are flagged as missing.</span>
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800">
                Form Tutor: {currentSection.classTeacherName}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 w-12 text-center">S/N</th>
                    <th className="py-3 px-3 w-32">Adm. No</th>
                    <th className="py-3 px-3 min-w-[190px]">Student Full Name</th>
                    <th className="py-3 px-3 text-center w-36">Subjects Included</th>
                    <th className="py-3 px-3 text-center w-36">Graded Status</th>
                    <th className="py-3 px-3 min-w-[320px]">Subjects With Missing / Incomplete Grades</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredCompletenessRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No student records match the selected completeness filter.
                      </td>
                    </tr>
                  ) : (
                    filteredCompletenessRows.map((row, idx) => (
                      <tr
                        key={row.studentId}
                        className={`transition-colors ${
                          !row.isComplete ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-slate-600">
                          {row.admissionNumber}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-black text-slate-900 text-xs">{row.fullName}</div>
                          <div className="text-[10px] text-slate-400 font-semibold">{row.gender}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-black text-xs border border-indigo-200">
                            {row.includedSubjectsCount} Subjects Included
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {row.isComplete ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{row.completedSubjectsCount}/{row.includedSubjectsCount} Complete</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px] border border-rose-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              <span>{row.missingSubjectsCount} Missing</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {row.isComplete ? (
                            <span className="text-emerald-700 font-semibold text-xs flex items-center space-x-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>All {row.includedSubjectsCount} included subjects have complete grades recorded.</span>
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {row.missingSubjects.map(m => (
                                <button
                                  key={m.subjectId}
                                  type="button"
                                  onClick={() => onOpenScoreGrid && onOpenScoreGrid(selectedSectionId, m.subjectId)}
                                  title="Click to open this subject in the Assessment Grid"
                                  className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                    m.status === 'NO_GRADE'
                                      ? 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200'
                                      : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                  }`}
                                >
                                  <span>{m.subjectName}:</span>
                                  <span className="font-mono text-[10px] underline">
                                    {m.status === 'NO_GRADE'
                                      ? 'Not Entered (Empty)'
                                      : `Empty Cell: ${m.missingComponents.join(', ')}`}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SCORE MODIFICATION AUDIT TRAIL LEDGER                              */}
      {/* ========================================================================= */}
      {activeAuditTab === 'ledger' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3 flex-1 min-w-[260px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by student, subject, teacher name or reason..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                aria-label="Filter by Role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="PRINCIPAL">Principal</option>
                <option value="VICE_PRINCIPAL">Vice Principal</option>
                <option value="CLASS_TEACHER">Class Teacher</option>
                <option value="SUBJECT_TEACHER">Subject Teacher</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{filteredLogs.length}</span> of {auditLogs.length} total edits
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 w-40">Timestamp</th>
                    <th className="py-3 px-3">Student</th>
                    <th className="py-3 px-3">Subject &amp; Component</th>
                    <th className="py-3 px-3 text-center w-36">Score Change</th>
                    <th className="py-3 px-3">Modified By</th>
                    <th className="py-3 px-3 min-w-[220px]">Reason / Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No score modification logs match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const delta =
                        log.previousScore !== null && log.newScore !== null
                          ? Number((log.newScore - log.previousScore).toFixed(1))
                          : null;

                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                            {new Date(log.createdAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{log.studentName}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-800">{log.subjectName}</span>
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                              {log.componentName}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center space-x-1.5 font-mono">
                              <span className="text-slate-400">
                                {log.previousScore !== null ? log.previousScore : 'Empty'}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-300" />
                              <span className="font-bold text-slate-900">
                                {log.newScore !== null ? log.newScore : 'Empty'}
                              </span>
                              {delta !== null && delta !== 0 && (
                                <span
                                  className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                                    delta > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {delta > 0 ? `+${delta}` : delta}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{log.changedBy}</div>
                            <span className="text-[10px] font-medium text-slate-400">{log.changedByRole}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {log.changeReason}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DUPLICATE STUDENTS CHECKER (EXACT SAME NAME & SCORES IN CLASS)     */}
      {/* ========================================================================= */}
      {activeAuditTab === 'duplicates' && (
        <div data-testid="duplicate-students-audit-panel" className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] font-black uppercase">
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate Students Scanner</span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Duplicate Students Detection (Identical Name &amp; Scores in Same Class)
                </h3>
                <p className="text-xs text-slate-500">
                  Automatically scans classes for duplicate student records sharing the exact same full name and identical assessment scores within the same class arm.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="duplicate-scope-all"
                  onClick={() => setDuplicateScope('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    duplicateScope === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All Classes ({totalDuplicateGroupsAllClasses})
                </button>
                <button
                  type="button"
                  data-testid="duplicate-scope-active"
                  onClick={() => setDuplicateScope('ACTIVE_CLASS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    duplicateScope === 'ACTIVE_CLASS'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Active Class: {currentSection.name}
                </button>
              </div>
            </div>

            {duplicateNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
                <span>✓ {duplicateNotice}</span>
                <button
                  type="button"
                  onClick={() => setDuplicateNotice(null)}
                  className="text-emerald-700 hover:text-emerald-950 font-black"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {duplicateGroups.length === 0 ? (
            <div
              data-testid="no-duplicate-students-state"
              className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2 shadow-xs"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-900">
                No Duplicate Students Detected
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                All student records in {duplicateScope === 'ACTIVE_CLASS' ? currentSection.name : 'all classes'} are unique. No students share both the exact same name and identical scores in the same class.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {duplicateGroups.map(group => (
                <div
                  key={group.groupId}
                  data-testid={`duplicate-group-${group.groupId}`}
                  className="bg-white rounded-2xl border border-amber-300 shadow-xs overflow-hidden"
                >
                  <div className="p-4 bg-amber-50/90 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-900">
                            {group.normalizedName}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold text-[10px]">
                            {group.sectionName}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-black text-[10px] uppercase">
                            {group.students.length} Duplicate Records
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-900 font-medium mt-0.5">
                          {group.scoreSignatureSummary}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {group.students.map((st, idx) => (
                      <div
                        key={st.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 text-xs"
                      >
                        <div className="flex items-center space-x-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              idx === 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {idx === 0 ? 'Primary Record' : `Duplicate #${idx}`}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">{st.fullName}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              Admission No: {st.admissionNumber} • Gender: {st.gender} • Score Entries: {st.recordedEntriesCount} (Sum: {st.totalScoreSum})
                            </div>
                          </div>
                        </div>

                        {idx > 0 && (
                          <button
                            type="button"
                            data-testid={`remove-duplicate-student-btn-${st.id}`}
                            onClick={() => {
                              deleteStudent(st.id);
                              setDuplicateNotice(
                                `Removed duplicate student record "${st.fullName}" (${st.admissionNumber}) from ${group.sectionName}.`
                              );
                            }}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center space-x-1.5 cursor-pointer self-start sm:self-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove Duplicate Entry</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
