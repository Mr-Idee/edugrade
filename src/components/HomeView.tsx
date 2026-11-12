/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ClassSection, Subject } from '../types/index';
import {
  Users,
  GraduationCap,
  BookOpen,
  School,
  ArrowRight,
  Search,
  X,
  CheckCircle2,
  Layers,
  ShieldCheck
} from 'lucide-react';
import {
  ALLOWED_ROLES,
  hasAllSubjectsClearance,
  getTeacherAssignedSubjectIdsForSection
} from '../utils/rbacAndAuth';

interface HomeViewProps {
  onSelectClassAndSubject: (sectionId: number, subjectId: number) => void;
  onNavigateTab: (tab: 'grid' | 'dashboard' | 'report' | 'audit' | 'settings') => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onSelectClassAndSubject,
  onNavigateTab
}) => {
  const {
    schoolProfile,
    currentSession,
    currentTerm,
    currentRole,
    currentUser,
    isStaffLoggedIn,
    openAuthModal,
    teachers,
    students,
    subjects,
    classSections
  } = useApp();

  const [levelFilter, setLevelFilter] = useState<'ALL' | 'JUNIOR' | 'SENIOR'>('ALL');
  const [classSearch, setClassSearch] = useState('');
  const [modalClassSection, setModalClassSection] = useState<ClassSection | null>(null);
  const [subjectSearch, setSubjectSearch] = useState('');

  const fullSubjectClearance = hasAllSubjectsClearance(currentRole);

  const activeTeacherAssignedSubjects = useMemo(() => {
    const matchedTeacher = teachers.find(
      t =>
        t.id === currentUser.id ||
        (currentUser.username && t.username?.toLowerCase() === currentUser.username.toLowerCase())
    );
    return matchedTeacher?.assignedSubjects || currentUser.assignedSubjects || [];
  }, [teachers, currentUser]);

  const filteredClasses = useMemo(() => {
    return classSections.filter(sec => {
      const matchLevel = levelFilter === 'ALL' || sec.levelType === levelFilter;
      const matchQuery =
        !classSearch.trim() ||
        sec.name.toLowerCase().includes(classSearch.toLowerCase()) ||
        sec.classTeacherName.toLowerCase().includes(classSearch.toLowerCase());
      return matchLevel && matchQuery;
    });
  }, [classSections, levelFilter, classSearch]);

  // Applicable subjects for the selected class in the modal (respecting teacher subject clearance)
  const modalApplicableSubjects = useMemo(() => {
    if (!modalClassSection) return [];
    const isSenior = modalClassSection.levelType === 'SENIOR';
    const levelFiltered = subjects.filter(sub => {
      const matchesLevel = isSenior
        ? sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
        : sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH';
      const matchesQuery =
        !subjectSearch.trim() ||
        sub.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
        sub.code.toLowerCase().includes(subjectSearch.toLowerCase());
      return matchesLevel && matchesQuery;
    });

    if (fullSubjectClearance) {
      return levelFiltered;
    }

    const assignedIds = getTeacherAssignedSubjectIdsForSection(
      activeTeacherAssignedSubjects,
      modalClassSection.id
    );
    const teacherSubjects = levelFiltered.filter(sub => assignedIds.includes(sub.id));
    return teacherSubjects.length > 0 ? teacherSubjects : levelFiltered.slice(0, 1);
  }, [modalClassSection, subjects, subjectSearch, fullSubjectClearance, activeTeacherAssignedSubjects]);

  const activeRoleMeta = ALLOWED_ROLES.find(r => r.role === currentRole);

  const handleClassCardClick = (sec: ClassSection) => {
    if (!isStaffLoggedIn) {
      openAuthModal(() => {
        setModalClassSection(sec);
        setSubjectSearch('');
      });
      return;
    }
    setModalClassSection(sec);
    setSubjectSearch('');
  };

  const handleChooseSubject = (subject: Subject) => {
    if (!modalClassSection) return;
    const targetSectionId = modalClassSection.id;
    setModalClassSection(null);
    setSubjectSearch('');
    onSelectClassAndSubject(targetSectionId, subject.id);
  };

  return (
    <div className="space-y-6">
      {/* Institutional Welcome & Active Role / Lock Status Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
              Institutional Command Center
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Session {currentSession.name} • {currentTerm.name} TERM
            </span>
            {isStaffLoggedIn ? (
              <span
                data-testid="home-status-unlocked-badge"
                className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold"
              >
                UNLOCKED • @{currentUser.username || 'superadmin'}
              </span>
            ) : (
              <span
                data-testid="home-status-locked-badge"
                className="px-2.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/40 text-rose-300 text-[11px] font-bold"
              >
                SYSTEM LOCKED • Sign In Required to Access Classes &amp; Tabs
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            {schoolProfile.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
            {isStaffLoggedIn
              ? 'Select any class below to choose a curriculum subject and open the student assessment grid directly.'
              : 'System is currently locked (Home Overview Status Mode). Click any class card or navigation tab to sign in and continue.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-800/90 border border-slate-700 px-4 py-3 rounded-xl">
          <ShieldCheck className={`w-5 h-5 shrink-0 ${isStaffLoggedIn ? 'text-emerald-400' : 'text-amber-400'}`} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {isStaffLoggedIn ? `Signed In: @${currentUser.username || 'staff'}` : 'System Status: Locked'}
            </div>
            <div className="text-xs sm:text-sm font-bold text-white">
              {isStaffLoggedIn ? `${currentUser.fullName} (${activeRoleMeta?.label || currentRole})` : 'Authentication Required'}
            </div>
            <div className="text-[11px] text-slate-400">
              {isStaffLoggedIn
                ? 'Auto-locks after 30 minutes of inactivity'
                : 'Click any class or tab to sign in with username & PIN/password'}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Core Institutional Summary KPI Cards: Staff, Students, Subjects, Classes */}
      <div
        data-testid="home-kpi-grid"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <div
          data-testid="home-stat-staff"
          className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex items-center justify-between"
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Staff
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tabular-nums mt-1 block">
              {teachers.length}
            </span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Form Tutors &amp; Subject Teachers
            </span>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div
          data-testid="home-stat-students"
          className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex items-center justify-between"
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Students
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tabular-nums mt-1 block">
              {students.length}
            </span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Active across Junior &amp; Senior
            </span>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div
          data-testid="home-stat-subjects"
          className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex items-center justify-between"
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Subjects
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tabular-nums mt-1 block">
              {subjects.length}
            </span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Core &amp; Elective Curriculum
            </span>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div
          data-testid="home-stat-classes"
          className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex items-center justify-between"
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Classes
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tabular-nums mt-1 block">
              {classSections.length}
            </span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Click any class to load scores
            </span>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <School className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Interactive Classes Directory */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>Academic Classes Directory ({filteredClasses.length})</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tap or click on any class card to choose a subject and jump directly to its Student Assessment Grid
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Level Filter */}
            <div className="flex items-center bg-slate-200/80 p-1 rounded-xl text-xs font-bold">
              {(['ALL', 'JUNIOR', 'SENIOR'] as const).map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(lvl)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer min-h-[36px] ${
                    levelFilter === lvl
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lvl === 'ALL' ? 'All Levels' : lvl}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={classSearch}
                onChange={e => setClassSearch(e.target.value)}
                placeholder="Search class or tutor..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[38px]"
              />
            </div>
          </div>
        </div>

        {/* Classes Grid */}
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClasses.map(sec => {
            const classStudentCount = students.filter(st => st.currentSectionId === sec.id).length;
            const isSenior = sec.levelType === 'SENIOR';
            const classSubjectCount = subjects.filter(sub =>
              isSenior
                ? sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
                : sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH'
            ).length;

            return (
              <button
                key={sec.id}
                type="button"
                data-testid={`home-class-card-${sec.id}`}
                onClick={() => handleClassCardClick(sec)}
                className="group text-left bg-white hover:bg-indigo-50/40 border-2 border-slate-200 hover:border-indigo-500 rounded-2xl p-4 transition-all shadow-2xs hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[136px]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${
                        isSenior
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {sec.levelType} SECONDARY
                    </span>
                    <span className="text-[13px] font-mono font-bold text-slate-500 tabular-nums">
                      {classStudentCount} Students
                    </span>
                  </div>

                  <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-700 mt-2.5 transition-colors">
                    {sec.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Form Tutor: <span className="font-semibold text-slate-700">{sec.classTeacherName}</span>
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600 group-hover:text-indigo-800">
                  <span>{classSubjectCount} Subjects Available</span>
                  <span className="inline-flex items-center space-x-1">
                    <span>Select Subject</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Modal to Select Subject when a Class is Clicked */}
      {modalClassSection && (
        <div
          data-testid="home-subject-modal"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase">
                    {modalClassSection.levelType} LEVEL
                  </span>
                  <span className="text-xs text-slate-300 font-mono">
                    {students.filter(s => s.currentSectionId === modalClassSection.id).length} Enrolled Students
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black mt-1">
                  Select Subject for {modalClassSection.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Choose a subject below to open the Assessment Grid with {modalClassSection.name} students loaded
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Subject Selector Modal"
                onClick={() => setModalClassSection(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search bar inside Modal */}
            <div className="p-3.5 bg-slate-50 border-b border-slate-200">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={subjectSearch}
                  onChange={e => setSubjectSearch(e.target.value)}
                  placeholder={`Search ${modalApplicableSubjects.length} subjects for ${modalClassSection.name}...`}
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Subject List */}
            <div className="p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
              {modalApplicableSubjects.map(sub => (
                <button
                  key={sub.id}
                  type="button"
                  data-testid={`modal-subject-option-${sub.id}`}
                  onClick={() => handleChooseSubject(sub)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/50 text-left flex items-center justify-between gap-3 transition-all cursor-pointer group min-h-[56px]"
                >
                  <div>
                    <div className="font-bold text-xs sm:text-sm text-slate-900 group-hover:text-indigo-900">
                      {sub.name}
                    </div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {sub.code}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          sub.category === 'CORE' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {sub.category}
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-indigo-600 text-slate-500 group-hover:text-white flex items-center justify-center transition-colors shrink-0">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </button>
              ))}

              {modalApplicableSubjects.length === 0 && (
                <div className="col-span-2 py-8 text-center text-xs text-slate-500">
                  No subjects match &ldquo;{subjectSearch}&rdquo;.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                Form Tutor: <strong className="text-slate-800">{modalClassSection.classTeacherName}</strong>
              </span>
              <button
                type="button"
                onClick={() => setModalClassSection(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-colors cursor-pointer min-h-[40px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
