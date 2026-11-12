/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Student, TermName, CaSubScoreDetails } from '../types/index';
import {
  FileSpreadsheet,
  PlusCircle,
  Edit2,
  Check,
  Search,
  Filter,
  Calculator,
  Award,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Layers,
  Sliders,
  CheckCircle2,
  X
} from 'lucide-react';
import { StudentEditModal } from './StudentEditModal';

interface ClassRegistryViewProps {
  onOpenReportCard: (studentId: number) => void;
}

export const ClassRegistryView: React.FC<ClassRegistryViewProps> = ({ onOpenReportCard }) => {
  const {
    currentSection,
    classSections,
    selectedSectionId,
    setSelectedSectionId,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    students,
    termSubjectRecords,
    updateTermSubjectScore,
    currentTerm,
    setCurrentTerm,
    terms,
    lastAutoSavedTime
  } = useApp();

  const [search, setSearch] = useState('');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showDetailedColumns, setShowDetailedColumns] = useState(false);

  // Sub-scores Modal State
  const [subScoreModal, setSubScoreModal] = useState<{
    student: Student;
    caType: 'ca1' | 'ca2' | 'exam';
  } | null>(null);

  // Sub-scores modal form state
  const [modalCw, setModalCw] = useState<number>(0);
  const [modalQz, setModalQz] = useState<number>(0);
  const [modalAss, setModalAss] = useState<number>(0);
  const [modalPj, setModalPj] = useState<number>(0);
  const [modalTest, setModalTest] = useState<number>(0);
  const [modalExam, setModalExam] = useState<number>(0);

  const isSenior = currentSection.levelType === 'SENIOR';

  // Component definition based on user specifications:
  // Junior: CW (5), QZ (5), ASS (5), PJ (5), TEST (20) -> Max CA: 40
  // Senior: CW (2), ASS (5), QZ (3), TEST (20) -> Max CA: 30
  const maxCa = isSenior ? 30 : 40;
  const maxExam = isSenior ? 70 : 60;

  // Applicable subjects for this level
  const applicableSubjects = useMemo(() => {
    return subjects.filter(sub => {
      if (isSenior) {
        return sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH';
      } else {
        return sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH';
      }
    });
  }, [subjects, isSenior]);

  const currentSubject = useMemo(() => {
    return applicableSubjects.find(s => s.id === selectedSubjectId) || applicableSubjects[0] || subjects[0];
  }, [applicableSubjects, selectedSubjectId, subjects]);

  // Section students
  const sectionStudents = useMemo(() => {
    return students.filter(st => st.currentSectionId === selectedSectionId);
  }, [students, selectedSectionId]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return sectionStudents;
    const q = search.toLowerCase();
    return sectionStudents.filter(
      s => s.fullName.toLowerCase().includes(q) || s.admissionNumber.toLowerCase().includes(q)
    );
  }, [sectionStudents, search]);

  // Retrieve score record for student
  const getRecord = (studentId: number) => {
    const found = termSubjectRecords.find(
      r => r.studentId === studentId && r.subjectId === currentSubject.id && r.termId === currentTerm.id
    );
    if (found) return found;

    // Default mock initialized sub-scores if not already present
    const defaultCw = isSenior ? 1.5 : 4.0;
    const defaultQz = isSenior ? 2.5 : 4.5;
    const defaultAss = isSenior ? 4.0 : 4.0;
    const defaultPj = isSenior ? 0 : 4.0;
    const defaultTest = 16.0;
    const defaultCa1 = isSenior ? (defaultCw + defaultQz + defaultAss + defaultTest) : (defaultCw + defaultQz + defaultAss + defaultPj + defaultTest);
    const defaultExam = isSenior ? 48 : 42;
    const defaultTotal = defaultCa1 + (defaultCa1 * 0.5) + defaultExam;

    return {
      id: 0,
      studentId,
      subjectId: currentSubject.id,
      termId: currentTerm.id,
      ca1Score: defaultCa1,
      ca2Score: Number((defaultCa1 * 0.75).toFixed(1)),
      examScore: defaultExam,
      totalScore: Math.min(100, Number(defaultTotal.toFixed(1))),
      grade: defaultTotal >= 75 ? 'A' : defaultTotal >= 60 ? 'C' : 'P',
      ca1Details: {
        cw: defaultCw,
        qz: defaultQz,
        ass: defaultAss,
        pj: isSenior ? undefined : defaultPj,
        test: defaultTest
      },
      ca2Details: {
        cw: Number((defaultCw * 0.8).toFixed(1)),
        qz: Number((defaultQz * 0.8).toFixed(1)),
        ass: Number((defaultAss * 0.8).toFixed(1)),
        pj: isSenior ? undefined : Number((defaultPj * 0.8).toFixed(1)),
        test: Number((defaultTest * 0.8).toFixed(1))
      }
    };
  };

  const handleOpenScoreModal = (student: Student, caType: 'ca1' | 'ca2' | 'exam') => {
    const rec = getRecord(student.id);
    const details = caType === 'ca1' ? rec.ca1Details : rec.ca2Details;

    if (caType === 'exam') {
      setModalExam(rec.examScore);
    } else {
      setModalCw(details?.cw ?? (isSenior ? 2 : 4));
      setModalQz(details?.qz ?? (isSenior ? 2.5 : 4.5));
      setModalAss(details?.ass ?? 4);
      setModalPj(details?.pj ?? (isSenior ? 0 : 4));
      setModalTest(details?.test ?? 16);
    }

    setSubScoreModal({ student, caType });
  };

  // Live computed total inside modal
  const modalCalculatedCaTotal = useMemo(() => {
    if (!subScoreModal) return 0;
    if (subScoreModal.caType === 'exam') return modalExam;
    const cw = Number(modalCw) || 0;
    const qz = Number(modalQz) || 0;
    const ass = Number(modalAss) || 0;
    const pj = isSenior ? 0 : (Number(modalPj) || 0);
    const test = Number(modalTest) || 0;
    return Number((cw + qz + ass + pj + test).toFixed(1));
  }, [subScoreModal, modalCw, modalQz, modalAss, modalPj, modalTest, modalExam, isSenior]);

  const handleSaveModalScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subScoreModal) return;

    const { student, caType } = subScoreModal;
    if (caType === 'exam') {
      const clamped = Math.max(0, Math.min(maxExam, modalExam));
      updateTermSubjectScore(student.id, currentSubject.id, currentTerm.id, {
        examScore: clamped
      });
    } else {
      const details: CaSubScoreDetails = {
        cw: Math.max(0, Math.min(isSenior ? 2 : 5, Number(modalCw) || 0)),
        qz: Math.max(0, Math.min(isSenior ? 3 : 5, Number(modalQz) || 0)),
        ass: Math.max(0, Math.min(5, Number(modalAss) || 0)),
        pj: isSenior ? undefined : Math.max(0, Math.min(5, Number(modalPj) || 0)),
        test: Math.max(0, Math.min(20, Number(modalTest) || 0))
      };

      if (caType === 'ca1') {
        updateTermSubjectScore(student.id, currentSubject.id, currentTerm.id, {
          ca1Details: details
        });
      } else {
        updateTermSubjectScore(student.id, currentSubject.id, currentTerm.id, {
          ca2Details: details
        });
      }
    }

    setSubScoreModal(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Term Selectors */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase flex items-center space-x-1">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Class Registry &amp; Term Exam Ledger</span>
              </span>
              <span className="text-xs text-slate-400 font-mono">• Formula: CA1 + CA2 + EXAM = TOTAL</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              {currentSection.name} Class Registry ({currentSection.levelType})
            </h2>
            <p className="text-xs text-slate-500">
              {isSenior
                ? 'Senior Secondary Assessment Ledger: CA1 & CA2 (CW: 2, ASS: 5, QZ: 3, TEST: 20 -> Max 30) + EXAM (Max 70) = 100%'
                : 'Junior Secondary Assessment Ledger: CA1 & CA2 (CW: 5, QZ: 5, ASS: 5, PJ: 5, TEST: 20 -> Max 40) + EXAM (Max 60) = 100%'}
            </p>
          </div>

          {/* Term Selector & View Options */}
          <div className="flex flex-wrap items-center gap-3">
            {lastAutoSavedTime && (
              <span className="hidden sm:inline-flex items-center space-x-1 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Auto-saved at {lastAutoSavedTime}</span>
              </span>
            )}

            {/* Terms: First, Second, Third */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              {terms.map(t => {
                const isSelected = currentTerm.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setCurrentTerm(t)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <span>{t.name} TERM</span>
                    {t.isActive && (
                      <span className="ml-1.5 text-[9px] bg-indigo-800 text-indigo-100 px-1 py-0.2 rounded uppercase">
                        Current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Detailed Sub-columns toggle */}
            <button
              type="button"
              onClick={() => setShowDetailedColumns(!showDetailedColumns)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                showDetailedColumns
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showDetailedColumns ? 'Collapse Sub-columns' : 'Expand Sub-scores (CW, QZ, ASS, TEST)'}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Class Section */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Class Section</label>
            <select
              aria-label="Class Section Selector"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {classSections.map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name} ({sec.levelType})
                </option>
              ))}
            </select>
          </div>

          {/* Subject Picker */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Subject</label>
            <select
              aria-label="Subject Selector"
              value={currentSubject.id}
              onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {applicableSubjects.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Find Student</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or admission..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Registry Table Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-xs">
            <span className="font-bold text-slate-900">{currentSection.name}</span>
            <span className="text-slate-400">•</span>
            <span className="font-semibold text-indigo-600">{currentSubject.name}</span>
            <span className="text-slate-400">•</span>
            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold uppercase">
              {currentTerm.name} TERM
            </span>
          </div>

          <div className="text-xs text-slate-500">
            Click on a <span className="font-bold text-slate-700">student's name</span> to edit details, or <span className="font-bold text-slate-700">+ icons</span> to record sub-scores.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              {/* Header row 1 */}
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 w-12 text-center border-r border-slate-200">S/N</th>
                <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 w-28 border-r border-slate-200">Adm. No</th>
                <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 border-r border-slate-200">Student Name (Click to Edit)</th>

                {/* CA 1 Column Header */}
                <th colSpan={showDetailedColumns ? (isSenior ? 5 : 6) : 1} className="py-2 px-3 text-center bg-blue-50/80 border-r border-slate-200">
                  <div className="flex items-center justify-center space-x-1.5">
                    <span className="text-blue-900 font-bold">CA 1</span>
                    <span className="text-[10px] text-blue-600 font-normal">({isSenior ? 'Max 30' : 'Max 40'})</span>
                  </div>
                </th>

                {/* CA 2 Column Header */}
                <th colSpan={showDetailedColumns ? (isSenior ? 5 : 6) : 1} className="py-2 px-3 text-center bg-emerald-50/80 border-r border-slate-200">
                  <div className="flex items-center justify-center space-x-1.5">
                    <span className="text-emerald-900 font-bold">CA 2</span>
                    <span className="text-[10px] text-emerald-600 font-normal">({isSenior ? 'Max 30' : 'Max 40'})</span>
                  </div>
                </th>

                {/* EXAM Column Header */}
                <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 text-center w-28 bg-purple-50/80 border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span className="text-purple-900 font-bold">EXAM</span>
                    <span className="text-[10px] text-purple-600 font-normal">(Max {maxExam})</span>
                  </div>
                </th>

                {/* TERM TOTAL */}
                <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 text-center w-28 bg-indigo-50 font-black text-indigo-950 border-r border-slate-200">
                  <div className="flex flex-col items-center">
                    <span>TERM TOTAL</span>
                    <span className="text-[10px] text-indigo-600 font-normal">(CA1+CA2+EXAM)</span>
                  </div>
                </th>

                <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 text-center w-20 border-r border-slate-200">Grade</th>
                <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 text-center w-24">Report</th>
              </tr>

              {/* Sub-header row for sub-components when expanded */}
              {showDetailedColumns && (
                <tr className="bg-slate-200/70 text-slate-600 font-semibold text-[10px] uppercase border-b border-slate-300">
                  {/* CA 1 Sub-columns */}
                  <th className="py-1 px-1.5 text-center bg-blue-50/60">CW ({isSenior ? 2 : 5})</th>
                  <th className="py-1 px-1.5 text-center bg-blue-50/60">{isSenior ? 'ASS (5)' : 'QZ (5)'}</th>
                  <th className="py-1 px-1.5 text-center bg-blue-50/60">{isSenior ? 'QZ (3)' : 'ASS (5)'}</th>
                  {!isSenior && <th className="py-1 px-1.5 text-center bg-blue-50/60">PJ (5)</th>}
                  <th className="py-1 px-1.5 text-center bg-blue-50/60">TEST (20)</th>
                  <th className="py-1 px-2 text-center bg-blue-100 font-bold text-blue-900 border-r border-slate-200">TOTAL</th>

                  {/* CA 2 Sub-columns */}
                  <th className="py-1 px-1.5 text-center bg-emerald-50/60">CW ({isSenior ? 2 : 5})</th>
                  <th className="py-1 px-1.5 text-center bg-emerald-50/60">{isSenior ? 'ASS (5)' : 'QZ (5)'}</th>
                  <th className="py-1 px-1.5 text-center bg-emerald-50/60">{isSenior ? 'QZ (3)' : 'ASS (5)'}</th>
                  {!isSenior && <th className="py-1 px-1.5 text-center bg-emerald-50/60">PJ (5)</th>}
                  <th className="py-1 px-1.5 text-center bg-emerald-50/60">TEST (20)</th>
                  <th className="py-1 px-2 text-center bg-emerald-100 font-bold text-emerald-900 border-r border-slate-200">TOTAL</th>
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((st, idx) => {
                const rec = getRecord(st.id);
                const ca1D = rec.ca1Details || {};
                const ca2D = rec.ca2Details || {};

                return (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* S/N */}
                    <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-xs border-r border-slate-100">
                      {idx + 1}
                    </td>

                    {/* Admission Number */}
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-600 border-r border-slate-100">
                      {st.admissionNumber}
                    </td>

                    {/* Student Name (Clickable) */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <button
                        type="button"
                        onClick={() => setEditingStudent(st)}
                        className="font-bold text-slate-900 hover:text-indigo-600 hover:underline flex items-center space-x-1.5 cursor-pointer text-left"
                        title="Click to Edit Student Details"
                      >
                        <span>{st.fullName}</span>
                        <Edit2 className="w-3 h-3 text-slate-400 opacity-60 hover:opacity-100" />
                      </button>
                      <div className="text-[10px] text-slate-400">{st.gender}</div>
                    </td>

                    {/* CA 1 COLUMNS */}
                    {showDetailedColumns ? (
                      <>
                        <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{ca1D.cw ?? '-'}</td>
                        <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{isSenior ? (ca1D.ass ?? '-') : (ca1D.qz ?? '-')}</td>
                        <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{isSenior ? (ca1D.qz ?? '-') : (ca1D.ass ?? '-')}</td>
                        {!isSenior && <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{ca1D.pj ?? '-'}</td>}
                        <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{ca1D.test ?? '-'}</td>
                        <td className="py-2 px-2 text-center bg-blue-50/50 font-bold font-mono text-blue-900 border-r border-slate-100">
                          <div className="flex items-center justify-center space-x-1">
                            <span>{rec.ca1Score.toFixed(1)}</span>
                            <button
                              type="button"
                              onClick={() => handleOpenScoreModal(st, 'ca1')}
                              className="p-0.5 text-blue-600 hover:text-blue-800 rounded cursor-pointer"
                              title="Edit CA1 Subcomponents"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <td className="py-2.5 px-3 text-center bg-blue-50/30 border-r border-slate-100">
                        <div className="inline-flex items-center space-x-1.5">
                          <span className="font-mono font-bold text-slate-800 text-sm">{rec.ca1Score.toFixed(1)}</span>
                          <button
                            type="button"
                            onClick={() => handleOpenScoreModal(st, 'ca1')}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded cursor-pointer"
                            title="Record / Edit CA 1 (CW, QZ, ASS, TEST)"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}

                    {/* CA 2 COLUMNS */}
                    {showDetailedColumns ? (
                      <>
                        <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{ca2D.cw ?? '-'}</td>
                        <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{isSenior ? (ca2D.ass ?? '-') : (ca2D.qz ?? '-')}</td>
                        <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{isSenior ? (ca2D.qz ?? '-') : (ca2D.ass ?? '-')}</td>
                        {!isSenior && <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{ca2D.pj ?? '-'}</td>}
                        <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{ca2D.test ?? '-'}</td>
                        <td className="py-2 px-2 text-center bg-emerald-50/50 font-bold font-mono text-emerald-900 border-r border-slate-100">
                          <div className="flex items-center justify-center space-x-1">
                            <span>{rec.ca2Score.toFixed(1)}</span>
                            <button
                              type="button"
                              onClick={() => handleOpenScoreModal(st, 'ca2')}
                              className="p-0.5 text-emerald-600 hover:text-emerald-800 rounded cursor-pointer"
                              title="Edit CA2 Subcomponents"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <td className="py-2.5 px-3 text-center bg-emerald-50/30 border-r border-slate-100">
                        <div className="inline-flex items-center space-x-1.5">
                          <span className="font-mono font-bold text-slate-800 text-sm">{rec.ca2Score.toFixed(1)}</span>
                          <button
                            type="button"
                            onClick={() => handleOpenScoreModal(st, 'ca2')}
                            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded cursor-pointer"
                            title="Record / Edit CA 2 (CW, QZ, ASS, TEST)"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}

                    {/* EXAM */}
                    <td className="py-2.5 px-3 text-center bg-purple-50/30 border-r border-slate-100">
                      <div className="inline-flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-slate-800 text-sm">{rec.examScore.toFixed(1)}</span>
                        <button
                          type="button"
                          onClick={() => handleOpenScoreModal(st, 'exam')}
                          className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded cursor-pointer"
                          title="Input / Edit Exam Score"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Term Total */}
                    <td className="py-2.5 px-3 text-center bg-indigo-50/60 font-mono font-black text-sm text-indigo-950 border-r border-slate-100">
                      {rec.totalScore.toFixed(1)}%
                    </td>

                    {/* Grade Pill */}
                    <td className="py-2.5 px-3 text-center border-r border-slate-100">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black shadow-2xs ${
                        rec.grade.startsWith('A')
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : rec.grade.startsWith('B')
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : rec.grade.startsWith('C')
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        {rec.grade}
                      </span>
                    </td>

                    {/* Action: Open Report Card */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenReportCard(st.id)}
                        className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                        title="View Official Report Card"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="hidden sm:inline">Report</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sub-Score Entry / Edit Modal */}
      {subScoreModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                  {subScoreModal.caType === 'exam'
                    ? 'Examination Score Entry'
                    : `${subScoreModal.caType.toUpperCase()} Component Breakdown`}
                </div>
                <h3 className="text-base font-bold text-white">{subScoreModal.student.fullName}</h3>
                <p className="text-xs text-slate-400">
                  {currentSubject.name} • {currentTerm.name} TERM
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubScoreModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModalScore} className="p-5 space-y-4">
              {subScoreModal.caType === 'exam' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Exam Score (Max: {maxExam})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={maxExam}
                    value={modalExam}
                    onChange={(e) => setModalExam(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-lg font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500 font-medium">
                    Enter individual scores. The total will auto-calculate according to the official weightings:
                  </div>

                  {/* Classwork */}
                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Classwork (CW)</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={isSenior ? 2 : 5}
                        value={modalCw}
                        onChange={(e) => setModalCw(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-slate-400">/ {isSenior ? 2 : 5}</span>
                    </div>
                  </div>

                  {/* Assignment */}
                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Assignment (ASS)</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={5}
                        value={modalAss}
                        onChange={(e) => setModalAss(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-slate-400">/ 5</span>
                    </div>
                  </div>

                  {/* Quiz */}
                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Quiz (QZ)</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={isSenior ? 3 : 5}
                        value={modalQz}
                        onChange={(e) => setModalQz(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-slate-400">/ {isSenior ? 3 : 5}</span>
                    </div>
                  </div>

                  {/* Project (Junior Only) */}
                  {!isSenior && (
                    <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-700">Project (PJ)</span>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={5}
                          value={modalPj}
                          onChange={(e) => setModalPj(parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                        />
                        <span className="text-xs text-slate-400">/ 5</span>
                      </div>
                    </div>
                  )}

                  {/* Test */}
                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Continuous Assessment Test</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={20}
                        value={modalTest}
                        onChange={(e) => setModalTest(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-slate-400">/ 20</span>
                    </div>
                  </div>

                  {/* Live Total Display */}
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-indigo-950">
                    <span className="text-xs font-bold">Computed {subScoreModal.caType.toUpperCase()} Total:</span>
                    <span className="text-lg font-black font-mono">
                      {modalCalculatedCaTotal} / {maxCa}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSubScoreModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  Save &amp; Commit Score
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Edit Modal */}
      {editingStudent && (
        <StudentEditModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
        />
      )}
    </div>
  );
};
