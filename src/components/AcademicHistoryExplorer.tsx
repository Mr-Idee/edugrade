/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  History,
  Building,
  Calendar,
  BookOpen,
  Users,
  UserCheck,
  Search,
  Plus,
  CheckCircle2,
  Layers
} from 'lucide-react';

export const AcademicHistoryExplorer: React.FC = () => {
  const {
    schoolProfile,
    sessions,
    currentSession,
    terms,
    currentTerm,
    setCurrentTerm,
    classSections,
    subjects,
    teachers,
    sessionArchives,
    createAcademicSession,
    selectActiveSession
  } = useApp();

  // Filter states for loading historical records by Session, Term, Class, Subject, Student, or Staff
  const [selectedSessionId, setSelectedSessionId] = useState<number>(currentSession.id);
  const [selectedTermFilter, setSelectedTermFilter] = useState<number | 'ALL'>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<number | 'ALL'>('ALL');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<number | 'ALL'>('ALL');
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<number | 'ALL'>('ALL');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Create new session input state
  const [newSessionInput, setNewSessionInput] = useState('');
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Sync selectedSessionId if currentSession changes
  React.useEffect(() => {
    setSelectedSessionId(currentSession.id);
  }, [currentSession.id]);

  // Active archive being inspected
  const targetArchive = useMemo(() => {
    return (
      sessionArchives.find(a => a.sessionId === selectedSessionId) ||
      sessionArchives[0] || {
        sessionId: currentSession.id,
        sessionName: currentSession.name,
        institutionName: currentSession.institutionName || schoolProfile.name,
        savedAt: new Date().toISOString(),
        students: [],
        enrollments: [],
        scores: [],
        termSubjectRecords: [],
        termSummaries: []
      }
    );
  }, [sessionArchives, selectedSessionId, currentSession, schoolProfile.name]);

  const handleCreateNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionInput.trim()) return;
    const created = createAcademicSession(newSessionInput.trim());
    setNewSessionInput('');
    setSessionNotice(
      `Created new Academic Session "${created.name}" with Institution Name "${created.institutionName}". Select it to load or promote students into it.`
    );
    setTimeout(() => setSessionNotice(null), 5000);
  };

  const handleActivateSession = (sessId: number) => {
    selectActiveSession(sessId);
    setSelectedSessionId(sessId);
    const sess = sessions.find(s => s.id === sessId);
    setSessionNotice(
      `Switched Active Academic Session to "${sess?.name}". Student records for "${sess?.name}" are now loaded across the system.`
    );
    setTimeout(() => setSessionNotice(null), 5000);
  };

  // Students in the selected session archive (filtered by class if selected)
  const archiveStudents = useMemo(() => {
    const list = targetArchive.students || [];
    if (selectedClassFilter === 'ALL') return list;
    return list.filter(st => st.currentSectionId === Number(selectedClassFilter));
  }, [targetArchive.students, selectedClassFilter]);

  // Build flat searchable/filterable academic records across terms, classes, subjects, students & staff
  const filteredAcademicRecords = useMemo(() => {
    const records = targetArchive.termSubjectRecords || [];
    const studentsMap = new Map(
      (targetArchive.students || []).map(st => [st.id, st])
    );
    const sectionsMap = new Map(classSections.map(c => [c.id, c]));
    const subjectsMap = new Map(subjects.map(s => [s.id, s]));

    // Determine staff filter constraints if a staff member is selected
    const selectedTeacher =
      selectedStaffFilter !== 'ALL'
        ? teachers.find(t => t.id === Number(selectedStaffFilter))
        : undefined;

    const rows: Array<{
      id: string;
      sessionName: string;
      institutionName: string;
      termId: number;
      termName: string;
      studentId: number;
      studentName: string;
      admissionNumber: string;
      sectionId: number;
      sectionName: string;
      subjectId: number;
      subjectName: string;
      staffName: string;
      ca1Score: number;
      ca2Score: number;
      examScore: number;
      totalScore: number;
      grade: string;
      remark: string;
    }> = [];

    // If termSubjectRecords has entries, iterate over them; if empty (e.g., brand new session with blank scores),
    // generate safe blank (0.0) rows for enrolled students so the session can still be inspected without errors!
    if (records.length > 0) {
      records.forEach(rec => {
        if (selectedTermFilter !== 'ALL' && rec.termId !== Number(selectedTermFilter)) {
          return;
        }
        if (selectedSubjectFilter !== 'ALL' && rec.subjectId !== Number(selectedSubjectFilter)) {
          return;
        }
        if (selectedStudentFilter !== 'ALL' && rec.studentId !== Number(selectedStudentFilter)) {
          return;
        }

        const st = studentsMap.get(rec.studentId);
        if (!st) return;

        if (
          selectedClassFilter !== 'ALL' &&
          st.currentSectionId !== Number(selectedClassFilter)
        ) {
          return;
        }

        const sec = sectionsMap.get(st.currentSectionId);
        const sub = subjectsMap.get(rec.subjectId);
        if (!sec || !sub) return;

        // Resolve Subject Teacher or Form Tutor for this class/subject
        const subjectTeacher = teachers.find(t =>
          (t.assignedSubjects || []).some(
            a => a.sectionId === sec.id && a.subjectId === sub.id
          )
        );
        const tutorName = sec.classTeacherName || st.assignedTutorName || 'Unassigned';
        const staffLabel = subjectTeacher
          ? `${subjectTeacher.fullName} (Subj) / ${tutorName} (Tutor)`
          : `${tutorName} (Form Tutor)`;

        if (selectedTeacher) {
          const isFormTutor =
            sec.classTeacherName.toLowerCase() === selectedTeacher.fullName.toLowerCase() ||
            selectedTeacher.assignedSectionId === sec.id;
          const isSubjTeacher = (selectedTeacher.assignedSubjects || []).some(
            a => a.sectionId === sec.id && a.subjectId === sub.id
          );
          if (!isFormTutor && !isSubjTeacher) return;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            st.fullName.toLowerCase().includes(q) ||
            st.admissionNumber.toLowerCase().includes(q) ||
            sub.name.toLowerCase().includes(q) ||
            sec.name.toLowerCase().includes(q) ||
            staffLabel.toLowerCase().includes(q);
          if (!match) return;
        }

        const termObj = terms.find(t => t.id === rec.termId);

        rows.push({
          id: `${rec.studentId}-${rec.subjectId}-${rec.termId}`,
          sessionName: targetArchive.sessionName,
          institutionName: targetArchive.institutionName || schoolProfile.name,
          termId: rec.termId,
          termName: termObj ? `${termObj.name} TERM` : `TERM ${rec.termId}`,
          studentId: st.id,
          studentName: st.fullName,
          admissionNumber: st.admissionNumber,
          sectionId: sec.id,
          sectionName: sec.name,
          subjectId: sub.id,
          subjectName: sub.name,
          staffName: staffLabel,
          ca1Score: Number(rec.ca1Score ?? 0),
          ca2Score: Number(rec.ca2Score ?? 0),
          examScore: Number(rec.examScore ?? 0),
          totalScore: Number(rec.totalScore ?? 0),
          grade: rec.grade || 'F',
          remark: rec.grade || 'Recorded'
        });
      });
    } else {
      // Safe fallback for a newly created session with blank scores
      (targetArchive.students || []).forEach(st => {
        if (
          selectedClassFilter !== 'ALL' &&
          st.currentSectionId !== Number(selectedClassFilter)
        ) {
          return;
        }
        if (selectedStudentFilter !== 'ALL' && st.id !== Number(selectedStudentFilter)) {
          return;
        }
        const sec = sectionsMap.get(st.currentSectionId);
        if (!sec) return;
        const tutorName = sec.classTeacherName || st.assignedTutorName || 'Unassigned';
        if (selectedTeacher) {
          const isFormTutor =
            sec.classTeacherName.toLowerCase() === selectedTeacher.fullName.toLowerCase() ||
            selectedTeacher.assignedSectionId === sec.id;
          if (!isFormTutor) return;
        }
        rows.push({
          id: `blank-${st.id}`,
          sessionName: targetArchive.sessionName,
          institutionName: targetArchive.institutionName || schoolProfile.name,
          termId: currentTerm.id,
          termName: `${currentTerm.name} TERM`,
          studentId: st.id,
          studentName: st.fullName,
          admissionNumber: st.admissionNumber,
          sectionId: sec.id,
          sectionName: sec.name,
          subjectId: 0,
          subjectName: 'All Enrolled Subjects (Blank New Session)',
          staffName: `${tutorName} (Form Tutor)`,
          ca1Score: 0,
          ca2Score: 0,
          examScore: 0,
          totalScore: 0,
          grade: '-',
          remark: 'New Session (Blank Scores)'
        });
      });
    }

    return rows;
  }, [
    targetArchive,
    classSections,
    subjects,
    teachers,
    terms,
    currentTerm,
    schoolProfile.name,
    selectedTermFilter,
    selectedClassFilter,
    selectedSubjectFilter,
    selectedStudentFilter,
    selectedStaffFilter,
    searchQuery
  ]);

  return (
    <div className="space-y-6" data-testid="academic-history-explorer">
      {/* Top Card: Academic Session Manager & Active Session Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wider flex items-center space-x-1">
                <History className="w-3.5 h-3.5" />
                <span>Academic Session &amp; Historical Records Engine</span>
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
              Academic Sessions, Institution Name History &amp; Multi-Filter Record Loader
            </h3>
            <p className="text-xs text-slate-500">
              Create new academic sessions, select the active session to load student records from the database, and trace historical records across any Class, Subject, Student, or Staff member with preserved institution names.
            </p>
          </div>

          {/* Create New Academic Session Form */}
          <form onSubmit={handleCreateNewSession} className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              data-testid="settings-new-session-input"
              value={newSessionInput}
              onChange={e => setNewSessionInput(e.target.value)}
              placeholder="New Session (e.g. 2027/28)"
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              data-testid="settings-create-session-btn"
              className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Session</span>
            </button>
          </form>
        </div>

        {sessionNotice && (
          <div
            data-testid="academic-session-notice"
            className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-bold flex items-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{sessionNotice}</span>
          </div>
        )}

        {/* Saved Sessions List & Active Session Switcher */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sessions.map(sess => {
            const isCurrentActive = sess.id === currentSession.id;
            const archive = sessionArchives.find(a => a.sessionId === sess.id);
            const savedInstName =
              archive?.institutionName || sess.institutionName || schoolProfile.name;

            return (
              <div
                key={sess.id}
                data-testid={`session-card-${sess.name}`}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  isCurrentActive
                    ? 'bg-indigo-50/70 border-2 border-indigo-600 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-900">
                      Session {sess.name}
                    </span>
                    {isCurrentActive && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase">
                        Active Session
                      </span>
                    )}
                  </div>
                  <div
                    data-testid={`session-institution-name-${sess.name}`}
                    className="flex items-center space-x-1.5 text-[11px] text-slate-600 font-semibold mt-1"
                  >
                    <Building className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate" title={savedInstName}>
                      Institution: <strong>{savedInstName}</strong>
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">
                    {archive
                      ? `${archive.students.length} Students • ${archive.termSubjectRecords.length} Term Subject Records`
                      : 'Ready for enrollment'}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200/70">
                  <button
                    type="button"
                    data-testid={`activate-session-btn-${sess.name}`}
                    onClick={() => handleActivateSession(sess.id)}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      isCurrentActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {isCurrentActive ? '✓ Loaded as Active Session' : 'Set as Active & Load Records'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSessionId(sess.id)}
                    className="py-1.5 px-2.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Multi-Dimensional Filter Bar: Load Academic Records for Any Class, Subject, Student, or Staff */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>
                Trace &amp; Load Academic Records (By Session, Term, Class, Subject, Student, or Staff)
              </span>
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspecting Session <strong>{targetArchive.sessionName}</strong> • Saved Institution Name:{' '}
              <strong
                data-testid="history-saved-institution-name"
                className="text-indigo-900 underline"
              >
                {targetArchive.institutionName || schoolProfile.name}
              </strong>
            </p>
          </div>

          <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-black">
            {filteredAcademicRecords.length} Matching Records
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          {/* 1. Session Filter */}
          <div>
            <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
              1. Academic Session
            </label>
            <select
              aria-label="Filter History by Session"
              data-testid="history-filter-session"
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(Number(e.target.value))}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 cursor-pointer"
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  Session {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Term Filter */}
          <div>
            <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
              2. Term
            </label>
            <select
              aria-label="Filter History by Term"
              data-testid="history-filter-term"
              value={selectedTermFilter}
              onChange={e =>
                setSelectedTermFilter(
                  e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                )
              }
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 cursor-pointer"
            >
              <option value="ALL">All 3 Terms (1st, 2nd, 3rd)</option>
              {terms.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} TERM
                </option>
              ))}
            </select>
          </div>

          {/* 3. Class Filter */}
          <div>
            <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
              3. Class Section
            </label>
            <select
              aria-label="Filter History by Class"
              data-testid="history-filter-class"
              value={selectedClassFilter}
              onChange={e => {
                setSelectedClassFilter(
                  e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                );
                setSelectedStudentFilter('ALL');
              }}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 cursor-pointer"
            >
              <option value="ALL">All Classes ({classSections.length})</option>
              {classSections.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Subject Filter */}
          <div>
            <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
              4. Subject
            </label>
            <select
              aria-label="Filter History by Subject"
              data-testid="history-filter-subject"
              value={selectedSubjectFilter}
              onChange={e =>
                setSelectedSubjectFilter(
                  e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                )
              }
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 cursor-pointer"
            >
              <option value="ALL">All Subjects ({subjects.length})</option>
              {subjects.map(sub => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Student Filter */}
          <div>
            <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
              5. Student
            </label>
            <select
              aria-label="Filter History by Student"
              data-testid="history-filter-student"
              value={selectedStudentFilter}
              onChange={e =>
                setSelectedStudentFilter(
                  e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                )
              }
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 cursor-pointer"
            >
              <option value="ALL">All Students ({archiveStudents.length})</option>
              {archiveStudents.map(st => (
                <option key={st.id} value={st.id}>
                  {st.fullName} ({st.admissionNumber})
                </option>
              ))}
            </select>
          </div>

          {/* 6. Staff (Form Tutor / Subject Teacher) Filter */}
          <div>
            <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
              6. Staff / Teacher
            </label>
            <select
              aria-label="Filter History by Staff"
              data-testid="history-filter-staff"
              value={selectedStaffFilter}
              onChange={e =>
                setSelectedStaffFilter(
                  e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                )
              }
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 cursor-pointer"
            >
              <option value="ALL">All Staff ({teachers.length})</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search academic history by student name, admission number, class, subject, or staff name..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Results Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[520px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Session &amp; Institution</th>
                <th className="py-2.5 px-2.5">Term</th>
                <th className="py-2.5 px-3">Student</th>
                <th className="py-2.5 px-2.5">Class</th>
                <th className="py-2.5 px-3">Subject</th>
                <th className="py-2.5 px-3">Staff (Tutor / Teacher)</th>
                <th className="py-2.5 px-2 text-center">1st CA</th>
                <th className="py-2.5 px-2 text-center">2nd CA</th>
                <th className="py-2.5 px-2 text-center">Exam</th>
                <th className="py-2.5 px-2.5 text-center bg-indigo-950 text-amber-300">
                  Total (100%)
                </th>
                <th className="py-2.5 px-2 text-center">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAcademicRecords.slice(0, 150).map(row => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3">
                    <div className="font-black text-indigo-900">{row.sessionName}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[180px]" title={row.institutionName}>
                      {row.institutionName}
                    </div>
                  </td>
                  <td className="py-2 px-2.5 font-bold text-slate-700">{row.termName}</td>
                  <td className="py-2 px-3">
                    <div className="font-bold text-slate-900">{row.studentName}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {row.admissionNumber}
                    </div>
                  </td>
                  <td className="py-2 px-2.5 font-semibold text-slate-800">{row.sectionName}</td>
                  <td className="py-2 px-3 font-bold text-slate-900">{row.subjectName}</td>
                  <td className="py-2 px-3 text-[11px] text-slate-600">{row.staffName}</td>
                  <td className="py-2 px-2 text-center font-mono">{row.ca1Score.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center font-mono">{row.ca2Score.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center font-mono">{row.examScore.toFixed(1)}</td>
                  <td className="py-2 px-2.5 text-center font-mono font-black bg-indigo-50/40 text-indigo-950">
                    {row.totalScore.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-center font-black">{row.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
