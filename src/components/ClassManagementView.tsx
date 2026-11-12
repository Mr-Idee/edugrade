/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { TermName, PromotionDecision, Student } from '../types/index';
import {
  determineGrade,
  checkDuplicateStudentsOnTransfer,
  TransferDuplicateConflict
} from '../utils/academicCalculations';
import {
  isYear12GraduationClass,
  validatePromotionSelection
} from '../utils/rbacAndAuth';
import { SchoolTestimonialModal } from './SchoolTestimonialModal';
import {
  ArrowRightLeft,
  GraduationCap,
  Users,
  CheckCircle2,
  AlertTriangle,
  Plus,
  History,
  UserCheck,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Calendar,
  Award,
  Lock,
  X,
  FileText
} from 'lucide-react';

interface ClassManagementViewProps {
  onOpenMasterSettings?: () => void;
}

export const ClassManagementView: React.FC<ClassManagementViewProps> = () => {
  const {
    schoolProfile,
    sessions,
    currentSession,
    createAcademicSession,
    selectActiveSession,
    classSections,
    students,
    scores,
    termSummaries,
    termSubjectRecords,
    transferStudentsBetweenClasses,
    promoteStudentsToDestinationClass,
    promotionLogs,
    studentTestimonials
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'transfer' | 'promotion' | 'history'>('promotion');
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  // =========================================================================
  // 1. PARALLEL CLASS TRANSFER STATE
  // =========================================================================
  const [transferSourceSectionId, setTransferSourceSectionId] = useState<number>(1);
  const [transferDestSectionId, setTransferDestSectionId] = useState<number>(2);
  const [selectedTransferStudentIds, setSelectedTransferStudentIds] = useState<number[]>([]);
  const [transferDuplicateWarning, setTransferDuplicateWarning] = useState<{
    conflicts: TransferDuplicateConflict[];
    safeStudentIds: number[];
    destinationSectionId: number;
    destinationSectionName: string;
  } | null>(null);

  const transferSourceSection = useMemo(
    () => classSections.find(s => s.id === transferSourceSectionId) || classSections[0],
    [classSections, transferSourceSectionId]
  );

  const transferDestSection = useMemo(
    () => classSections.find(s => s.id === transferDestSectionId) || classSections[1] || classSections[0],
    [classSections, transferDestSectionId]
  );

  const transferSourceStudents = useMemo(
    () => students.filter(st => st.currentSectionId === transferSourceSectionId),
    [students, transferSourceSectionId]
  );

  const toggleTransferStudent = (id: number) => {
    setSelectedTransferStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllTransferStudents = () => {
    if (selectedTransferStudentIds.length === transferSourceStudents.length) {
      setSelectedTransferStudentIds([]);
    } else {
      setSelectedTransferStudentIds(transferSourceStudents.map(s => s.id));
    }
  };

  const executeConfirmedTransfer = (studentIdsToMove: number[]) => {
    if (studentIdsToMove.length === 0) {
      setTransferDuplicateWarning(null);
      return;
    }
    const result = transferStudentsBetweenClasses(studentIdsToMove, transferDestSectionId);
    if (result.movedCount > 0) {
      setBannerMessage({
        type: 'success',
        text: `Moved ${result.movedCount} student(s) from ${transferSourceSection.name} to ${result.destinationSectionName}. All subject scores and records were transferred and Form Tutor "${result.formTutorName}" has been assigned.`
      });
      setSelectedTransferStudentIds([]);
    }
    setTransferDuplicateWarning(null);
  };

  const handleExecuteParallelTransfer = () => {
    if (selectedTransferStudentIds.length === 0) return;
    if (transferSourceSectionId === transferDestSectionId) return;

    const dupCheck = checkDuplicateStudentsOnTransfer({
      studentIdsToTransfer: selectedTransferStudentIds,
      destinationSectionId: transferDestSectionId,
      students,
      scores,
      termSubjectRecords
    });

    if (dupCheck.hasDuplicates) {
      setTransferDuplicateWarning({
        conflicts: dupCheck.conflicts,
        safeStudentIds: dupCheck.safeStudentIds,
        destinationSectionId: transferDestSectionId,
        destinationSectionName: transferDestSection.name
      });
      return;
    }

    executeConfirmedTransfer(selectedTransferStudentIds);
  };

  // =========================================================================
  // 2. ACADEMIC PROMOTION & YEAR 12 GRADUATION STATE
  // =========================================================================
  const [promoSourceSectionId, setPromoSourceSectionId] = useState<number>(1);
  const [promoDestSectionId, setPromoDestSectionId] = useState<number>(3); // Default Year 8 Excellence
  const [promoDestSessionId, setPromoDestSessionId] = useState<number>(() => {
    const nextSession = sessions.find(s => s.id !== currentSession.id);
    return nextSession ? nextSession.id : 0;
  });
  const [promoDestTermName, setPromoDestTermName] = useState<TermName>('FIRST');
  const [passMarkThreshold, setPassMarkThreshold] = useState<number>(50);
  const [probationThreshold, setProbationThreshold] = useState<number>(40);
  const [switchSessionAfterPromote, setSwitchSessionAfterPromote] = useState<boolean>(true);
  const [newSessionNameInput, setNewSessionNameInput] = useState<string>('2027/28');

  // Promotion Validation Modal State (Triggered when Next Session is not created/selected or Next Class is not selected)
  const [validationModalError, setValidationModalError] = useState<{
    title: string;
    message: string;
    missingSession: boolean;
    missingClass: boolean;
  } | null>(null);

  // Testimonial & Sealed Transcript Viewer Modal State
  const [activeTestimonialStudent, setActiveTestimonialStudent] = useState<Student | null>(null);

  const promoSourceSection = useMemo(
    () => classSections.find(s => s.id === promoSourceSectionId) || classSections[0],
    [classSections, promoSourceSectionId]
  );

  const isSourceYear12 = useMemo(
    () => isYear12GraduationClass(promoSourceSection?.name || ''),
    [promoSourceSection]
  );

  // Auto-suggest natural next class when source class changes
  useEffect(() => {
    const src = classSections.find(s => s.id === promoSourceSectionId);
    if (!src) return;
    if (isYear12GraduationClass(src.name)) {
      setPromoDestSectionId(src.id);
      return;
    }
    const nextLevelId = src.classLevelId + 1;
    const isExcellence = src.name.toUpperCase().includes('EXCELLENCE');
    const naturalNext =
      classSections.find(
        s =>
          s.classLevelId === nextLevelId &&
          (isExcellence
            ? s.name.toUpperCase().includes('EXCELLENCE')
            : s.name.toUpperCase().includes('RESILIENCE'))
      ) || classSections.find(s => s.classLevelId === nextLevelId);
    if (naturalNext) {
      setPromoDestSectionId(naturalNext.id);
    }
  }, [promoSourceSectionId, classSections]);

  // Keep promoDestSessionId synced if a new session is created
  useEffect(() => {
    const nonCurrent = sessions.find(s => s.id !== currentSession.id);
    if (nonCurrent && promoDestSessionId === 0) {
      setPromoDestSessionId(nonCurrent.id);
    }
  }, [sessions, currentSession.id, promoDestSessionId]);

  const promoSourceStudents = useMemo(
    () => students.filter(st => st.currentSectionId === promoSourceSectionId),
    [students, promoSourceSectionId]
  );

  // Compute 1st, 2nd, 3rd Term & Cumulative Average for every student in source class
  const studentPromotionMetrics = useMemo(() => {
    const levelType = promoSourceSection?.levelType || 'JUNIOR';
    return promoSourceStudents.map(st => {
      const computeTermPct = (termId: number): number => {
        const summary = termSummaries.find(s => s.studentId === st.id && s.termId === termId);
        if (summary && summary.cumulativePercentage > 0) {
          return Number(summary.cumulativePercentage.toFixed(1));
        }
        const recs = termSubjectRecords.filter(r => r.studentId === st.id && r.termId === termId && r.totalScore > 0);
        if (recs.length > 0) {
          const avg = recs.reduce((acc, r) => acc + r.totalScore, 0) / recs.length;
          return Number(avg.toFixed(1));
        }
        return 0;
      };

      const t1 = computeTermPct(1);
      const t2 = computeTermPct(2);
      const t3 = computeTermPct(3);
      const activeTerms = [t1, t2, t3].filter(v => v > 0);
      const cumAvg =
        activeTerms.length > 0
          ? Number((activeTerms.reduce((a, b) => a + b, 0) / activeTerms.length).toFixed(1))
          : 0;
      const finalGrade = determineGrade(cumAvg, levelType).grade;

      let recommendedDecision: PromotionDecision = isSourceYear12 ? 'GRADUATED' : 'PROMOTED';
      if (!isSourceYear12) {
        if (cumAvg > 0 && cumAvg < probationThreshold) {
          recommendedDecision = 'REPEATED';
        } else if (cumAvg > 0 && cumAvg < passMarkThreshold) {
          recommendedDecision = 'PROBATION';
        }
      }

      return {
        student: st,
        firstTermPct: t1,
        secondTermPct: t2,
        thirdTermPct: t3,
        cumulativeAvgPct: cumAvg,
        finalGrade,
        recommendedDecision
      };
    });
  }, [
    promoSourceStudents,
    promoSourceSection,
    termSummaries,
    termSubjectRecords,
    passMarkThreshold,
    probationThreshold,
    isSourceYear12
  ]);

  // Per-student decision overrides
  const [decisionOverrides, setDecisionOverrides] = useState<
    Record<number, PromotionDecision>
  >({});

  // Selected students for promotion
  const [selectedPromoStudentIds, setSelectedPromoStudentIds] = useState<number[]>([]);

  useEffect(() => {
    setSelectedPromoStudentIds(promoSourceStudents.map(s => s.id));
    setDecisionOverrides({});
  }, [promoSourceSectionId, promoSourceStudents.length]);

  const getEffectiveDecision = (
    studentId: number,
    recommended: PromotionDecision
  ): PromotionDecision => {
    return decisionOverrides[studentId] || recommended;
  };

  const handleCreateNextSession = () => {
    if (!newSessionNameInput.trim()) return;
    const created = createAcademicSession(newSessionNameInput.trim(), {
      copyStudents: true,
      makeActive: false
    });
    setPromoDestSessionId(created.id);
    setBannerMessage({
      type: 'info',
      text: `Created Academic Session "${created.name}" (${schoolProfile.name}). You can now promote students into ${created.name}.`
    });
  };

  const handleExecutePromotion = () => {
    const selectedMetrics = studentPromotionMetrics.filter(m =>
      selectedPromoStudentIds.includes(m.student.id)
    );
    if (selectedMetrics.length === 0) return;

    // Validate Next Session & Next Class before executing promotion (unless Year 12 Graduation)
    const validation = validatePromotionSelection({
      sourceSectionName: promoSourceSection?.name || '',
      destinationSectionId: isSourceYear12 ? promoSourceSectionId : promoDestSectionId,
      sourceSectionId: promoSourceSectionId,
      currentSessionId: currentSession.id,
      destinationSessionId: isSourceYear12
        ? promoDestSessionId || currentSession.id
        : promoDestSessionId,
      availableSessionsCount: sessions.length
    });

    if (!validation.valid) {
      setValidationModalError({
        title: validation.errorTitle || 'Promotion Requirements Incomplete',
        message:
          validation.errorMessage ||
          'Please create/select the Next Academic Session and select a Destination Class before promoting students.',
        missingSession: !promoDestSessionId || promoDestSessionId === currentSession.id,
        missingClass: !promoDestSectionId || promoDestSectionId === promoSourceSectionId
      });
      return;
    }

    const decisionsPayload = selectedMetrics.map(m => {
      const decision = getEffectiveDecision(m.student.id, m.recommendedDecision);
      const destSecId =
        decision === 'REPEATED' || decision === 'GRADUATED'
          ? promoSourceSectionId
          : promoDestSectionId;
      return {
        studentId: m.student.id,
        decision,
        destinationSectionId: destSecId,
        firstTermPct: m.firstTermPct,
        secondTermPct: m.secondTermPct,
        thirdTermPct: m.thirdTermPct,
        cumulativeAvgPct: m.cumulativeAvgPct,
        finalGrade: m.finalGrade
      };
    });

    const result = promoteStudentsToDestinationClass({
      decisions: decisionsPayload,
      destinationSessionId: isSourceYear12
        ? promoDestSessionId || currentSession.id
        : promoDestSessionId,
      destinationTermName: promoDestTermName,
      switchActiveSession: isSourceYear12 ? false : switchSessionAfterPromote
    });

    const destSec = classSections.find(s => s.id === promoDestSectionId);
    const destSess = sessions.find(s => s.id === promoDestSessionId);

    if (isSourceYear12 && result.graduatedCount > 0) {
      setBannerMessage({
        type: 'success',
        text: `Year 12 Graduation Completed! ${result.graduatedCount} student(s) signed as "GRADUATED", academic records permanently SEALED, and Official School Testimonials + Transcripts have been auto-generated.`
      });
      const firstGrad = selectedMetrics[0]?.student;
      if (firstGrad) {
        setActiveTestimonialStudent({
          ...firstGrad,
          promotionStatus: 'GRADUATED',
          isRecordSealed: true,
          recordSignature: 'GRADUATED',
          graduatedSessionName: currentSession.name
        });
      }
    } else {
      setBannerMessage({
        type: 'success',
        text: `Promotion Complete for ${destSess?.name || currentSession.name} (${promoDestTermName} TERM): ${result.promotedCount} Promoted to ${destSec?.name} (Tutor: ${destSec?.classTeacherName}), ${result.probationCount} Promoted on Trial/Probation, ${result.repeatedCount} Retained.`
      });
    }
  };

  // Graduated Year 12 students list for quick testimonial access
  const graduatedStudents = useMemo(
    () =>
      students.filter(
        st =>
          st.isRecordSealed ||
          st.promotionStatus === 'GRADUATED' ||
          studentTestimonials.some(t => t.studentId === st.id)
      ),
    [students, studentTestimonials]
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                  Class Management, Academic Promotion &amp; Year 12 Graduation
                </h1>
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Active Session: {currentSession.name}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                Promote students to the next class/session, graduate Year 12 students with sealed records &amp; School Testimonials, or move students between parallel classes.
              </p>
            </div>
          </div>

          {/* Sub-Navigation Pills */}
          <div className="flex bg-slate-800/90 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              data-testid="class-mgmt-tab-promotion"
              onClick={() => setActiveSubTab('promotion')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'promotion'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Promotion &amp; Year 12 Graduation</span>
            </button>
            <button
              type="button"
              data-testid="class-mgmt-tab-transfer"
              onClick={() => setActiveSubTab('transfer')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'transfer'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Parallel Class Transfer</span>
            </button>
            <button
              type="button"
              data-testid="class-mgmt-tab-history"
              onClick={() => setActiveSubTab('history')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Movement &amp; Graduation Log ({promotionLogs.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Notification */}
      {bannerMessage && (
        <div
          data-testid="class-mgmt-notification"
          className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-semibold ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-indigo-50 border-indigo-300 text-indigo-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-xs font-bold underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: ACADEMIC PROMOTION & YEAR 12 GRADUATION                      */}
      {/* =================================================================== */}
      {activeSubTab === 'promotion' && (
        <div className="space-y-6">
          {/* Session & Promotion Configuration Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>
                    {isSourceYear12
                      ? 'Year 12 Final Class Graduation & Official School Testimonial Engine'
                      : 'Cumulative 3-Term Academic Promotion Engine (Year 7 → Year 8 ... Year 11 → Year 12)'}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isSourceYear12
                    ? 'Year 12 is the final class: graduating students have their academic records permanently signed as "GRADUATED" and sealed, with an Official School Testimonial auto-generated alongside their transcript.'
                    : 'Requires Next Academic Session and Destination Class selection. Evaluates 1st, 2nd & 3rd Term cumulative percentages.'}
                </p>
              </div>

              {/* Quick Create Next Academic Session */}
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <Calendar className="w-4 h-4 text-indigo-600 ml-1" />
                <input
                  type="text"
                  data-testid="new-session-name-input"
                  value={newSessionNameInput}
                  onChange={e => setNewSessionNameInput(e.target.value)}
                  placeholder="e.g. 2027/28"
                  className="px-2.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg w-28"
                />
                <button
                  type="button"
                  data-testid="create-next-session-btn"
                  onClick={handleCreateNextSession}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Next Session</span>
                </button>
              </div>
            </div>

            {/* Configuration Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Source Class ({currentSession.name})
                </label>
                <select
                  aria-label="Promotion Source Class"
                  data-testid="promo-source-section-select"
                  value={promoSourceSectionId}
                  onChange={e => setPromoSourceSectionId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                >
                  {classSections.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.levelType})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                  {isSourceYear12 ? 'Graduation Status / Destination' : 'Promote To Destination Class *'}
                </label>
                {isSourceYear12 ? (
                  <div
                    data-testid="year12-graduation-dest-badge"
                    className="w-full px-3 py-2 bg-emerald-950 text-emerald-300 border border-emerald-700 rounded-xl text-xs font-black flex items-center space-x-1.5"
                  >
                    <Award className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>GRADUATION (SIGNED: GRADUATED)</span>
                  </div>
                ) : (
                  <select
                    aria-label="Promotion Destination Class"
                    data-testid="promo-dest-section-select"
                    value={promoDestSectionId}
                    onChange={e => setPromoDestSectionId(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-indigo-50/70 border border-indigo-300 rounded-xl text-xs font-bold text-indigo-950"
                  >
                    <option value={0}>-- Select Destination Class --</option>
                    {classSections.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Tutor: {s.classTeacherName})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {isSourceYear12 ? 'Graduation Academic Session' : 'Destination Academic Session *'}
                </label>
                <select
                  aria-label="Destination Academic Session"
                  data-testid="promo-dest-session-select"
                  value={promoDestSessionId}
                  onChange={e => setPromoDestSessionId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                >
                  <option value={0}>-- Select Next Session --</option>
                  {sessions.map(sess => (
                    <option key={sess.id} value={sess.id}>
                      {sess.name} {sess.isCurrent ? '(Current Active)' : '(Target Session)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Pass Cutoff (%) / Probation (%)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={passMarkThreshold}
                    onChange={e => setPassMarkThreshold(Number(e.target.value))}
                    className="w-1/2 px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-emerald-800"
                    title="Minimum cumulative % for automatic Promotion"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={probationThreshold}
                    onChange={e => setProbationThreshold(Number(e.target.value))}
                    className="w-1/2 px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-amber-800"
                    title="Minimum cumulative % for Promotion on Trial / Probation"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Target Term &amp; Auto-Switch
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={promoDestTermName}
                    onChange={e => setPromoDestTermName(e.target.value as TermName)}
                    className="flex-1 px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="FIRST">FIRST TERM</option>
                    <option value="SECOND">SECOND TERM</option>
                    <option value="THIRD">THIRD TERM</option>
                  </select>
                  <label className="flex items-center space-x-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={switchSessionAfterPromote}
                      onChange={e => setSwitchSessionAfterPromote(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Switch</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Destination Tutor & Promotion/Graduation Action Bar */}
            <div
              className={`rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 border ${
                isSourceYear12
                  ? 'bg-emerald-950 text-white border-emerald-700'
                  : 'bg-amber-50/80 border-amber-200 text-slate-900'
              }`}
            >
              <div className="flex items-center space-x-3 text-xs">
                {isSourceYear12 ? (
                  <Award className="w-5 h-5 text-amber-400 shrink-0" />
                ) : (
                  <UserCheck className="w-5 h-5 text-amber-700 shrink-0" />
                )}
                <div>
                  {isSourceYear12 ? (
                    <>
                      <span className="font-bold text-amber-300">
                        Year 12 Final Class Graduation Protocol:
                      </span>{' '}
                      <span>
                        Graduating students will have their records signed with{' '}
                        <strong className="underline">GRADUATED</strong>, permanently sealed against modification, and an Official School Testimonial generated.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-slate-800">
                        Destination Class Form Tutor Assignment:
                      </span>{' '}
                      <span className="text-slate-600">
                        Promoted students moving to{' '}
                        <strong>
                          {classSections.find(s => s.id === promoDestSectionId)?.name || 'Unselected'}
                        </strong>{' '}
                        will be automatically assigned to Form Tutor{' '}
                        <strong className="text-indigo-900">
                          {classSections.find(s => s.id === promoDestSectionId)?.classTeacherName || 'N/A'}
                        </strong>
                        .
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                data-testid="execute-promotion-btn"
                onClick={handleExecutePromotion}
                disabled={selectedPromoStudentIds.length === 0}
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-md transition-all cursor-pointer disabled:opacity-40 ${
                  isSourceYear12
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                {isSourceYear12 ? (
                  <>
                    <Award className="w-4 h-4 text-slate-950" />
                    <span>
                      Complete Year 12 Graduation &amp; Generate Testimonials ({selectedPromoStudentIds.length})
                    </span>
                  </>
                ) : (
                  <>
                    <GraduationCap className="w-4 h-4 text-amber-400" />
                    <span>
                      Execute Promotion ({selectedPromoStudentIds.length} Students)
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Promotion Evaluation Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          promoSourceStudents.length > 0 &&
                          selectedPromoStudentIds.length === promoSourceStudents.length
                        }
                        onChange={() => {
                          if (selectedPromoStudentIds.length === promoSourceStudents.length) {
                            setSelectedPromoStudentIds([]);
                          } else {
                            setSelectedPromoStudentIds(promoSourceStudents.map(s => s.id));
                          }
                        }}
                        className="rounded"
                      />
                    </th>
                    <th className="py-2.5 px-3">Student Name &amp; Adm No</th>
                    <th className="py-2.5 px-3 text-center">1st Term (%)</th>
                    <th className="py-2.5 px-3 text-center">2nd Term (%)</th>
                    <th className="py-2.5 px-3 text-center">3rd Term (%)</th>
                    <th className="py-2.5 px-3 text-center bg-indigo-950">Cumulative Avg (%)</th>
                    <th className="py-2.5 px-3 text-center">Grade</th>
                    <th className="py-2.5 px-3">
                      {isSourceYear12 ? 'Graduation / Record Status' : 'Promotion Decision'}
                    </th>
                    <th className="py-2.5 px-3">
                      {isSourceYear12 ? 'Testimonial & Transcript' : 'Destination Class & Tutor'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {studentPromotionMetrics.map(item => {
                    const effectiveDecision = getEffectiveDecision(
                      item.student.id,
                      item.recommendedDecision
                    );
                    const destSec =
                      effectiveDecision === 'REPEATED'
                        ? promoSourceSection
                        : classSections.find(s => s.id === promoDestSectionId) || promoSourceSection;
                    const isChecked = selectedPromoStudentIds.includes(item.student.id);

                    return (
                      <tr key={item.student.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedPromoStudentIds(prev =>
                                prev.includes(item.student.id)
                                  ? prev.filter(x => x !== item.student.id)
                                  : [...prev, item.student.id]
                              );
                            }}
                            className="rounded"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                            <span>{item.student.fullName}</span>
                            {item.student.isRecordSealed && (
                              <span
                                data-testid={`graduated-sealed-tag-${item.student.id}`}
                                className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black flex items-center space-x-1"
                              >
                                <Lock className="w-2.5 h-2.5" />
                                <span>{item.student.recordSignature || 'GRADUATED'}</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {item.student.admissionNumber}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {item.firstTermPct > 0 ? `${item.firstTermPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {item.secondTermPct > 0 ? `${item.secondTermPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {item.thirdTermPct > 0 ? `${item.thirdTermPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-black text-indigo-950 bg-indigo-50/50">
                          {item.cumulativeAvgPct.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-center font-black">
                          {item.finalGrade}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            aria-label={`Decision for ${item.student.fullName}`}
                            value={effectiveDecision}
                            onChange={e =>
                              setDecisionOverrides(prev => ({
                                ...prev,
                                [item.student.id]: e.target.value as PromotionDecision
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                              effectiveDecision === 'GRADUATED'
                                ? 'bg-emerald-950 border-emerald-700 text-amber-300'
                                : effectiveDecision === 'PROMOTED'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : effectiveDecision === 'PROBATION'
                                ? 'bg-amber-50 border-amber-300 text-amber-800'
                                : 'bg-rose-50 border-rose-300 text-rose-800'
                            }`}
                          >
                            {isSourceYear12 ? (
                              <>
                                <option value="GRADUATED">
                                  GRADUATED (Sign &amp; Seal Record)
                                </option>
                                <option value="REPEATED">RETAINED / REPEAT YEAR 12</option>
                              </>
                            ) : (
                              <>
                                <option value="PROMOTED">PROMOTED (Next Class)</option>
                                <option value="PROBATION">PROMOTED ON TRIAL (Probation)</option>
                                <option value="REPEATED">REPEATED (Retain in Class)</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td className="py-2.5 px-3">
                          {effectiveDecision === 'GRADUATED' || item.student.isRecordSealed ? (
                            <button
                              type="button"
                              data-testid={`view-testimonial-btn-${item.student.id}`}
                              onClick={() => setActiveTestimonialStudent(item.student)}
                              className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] cursor-pointer shadow-2xs"
                            >
                              <Award className="w-3.5 h-3.5" />
                              <span>School Testimonial &amp; Transcript</span>
                            </button>
                          ) : (
                            <>
                              <div className="font-bold text-slate-800">{destSec?.name}</div>
                              <div className="text-[11px] text-slate-500">
                                Tutor: {destSec?.classTeacherName}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Graduated Year 12 Students & Auto-Generated Testimonials Directory */}
          {graduatedStudents.length > 0 && (
            <div
              data-testid="graduated-testimonials-directory"
              className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Graduated Year 12 Alumni — Sealed Academic Records &amp; School Testimonials ({graduatedStudents.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      All graduated students have their records signed as &ldquo;GRADUATED&rdquo; and permanently sealed. Click any graduate to view or print their Official School Testimonial and Transcript.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {graduatedStudents.map(grad => (
                  <div
                    key={grad.id}
                    className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="font-black text-xs text-slate-900">{grad.fullName}</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-900 text-amber-300 text-[9px] font-black">
                          {grad.recordSignature || 'GRADUATED'}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {grad.admissionNumber} • Sealed Record
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTestimonialStudent(grad)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 text-xs font-bold cursor-pointer shrink-0 flex items-center space-x-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Open Testimonial</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: PARALLEL CLASS TRANSFER (E.G. YEAR 7 EXCELLENCE -> RESILIENCE) */}
      {/* =================================================================== */}
      {activeSubTab === 'transfer' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
              <span>Parallel Class Student Transfer (With Scores &amp; Form Tutor Reassignment)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Move students between parallel arms (e.g., from YEAR 7 EXCELLENCE to YEAR 7 RESILIENCE). Their subject enrollments, CA scores, exam marks, and Form Tutor assignment move seamlessly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                From Source Class Section
              </label>
              <select
                aria-label="Parallel Transfer Source Class"
                value={transferSourceSectionId}
                onChange={e => {
                  setTransferSourceSectionId(Number(e.target.value));
                  setSelectedTransferStudentIds([]);
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900"
              >
                {classSections.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Tutor: {s.classTeacherName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                To Destination Parallel Class Section
              </label>
              <select
                aria-label="Parallel Transfer Destination Class"
                value={transferDestSectionId}
                onChange={e => setTransferDestSectionId(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-indigo-50/70 border border-indigo-300 rounded-xl text-xs sm:text-sm font-bold text-indigo-950"
              >
                {classSections.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} (New Form Tutor: {s.classTeacherName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="button"
                data-testid="execute-parallel-transfer-btn"
                onClick={handleExecuteParallelTransfer}
                disabled={
                  selectedTransferStudentIds.length === 0 ||
                  transferSourceSectionId === transferDestSectionId
                }
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-black shadow-md transition-all cursor-pointer"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>
                  Move {selectedTransferStudentIds.length} Selected Student(s) to {transferDestSection.name}
                </span>
              </button>
            </div>
          </div>

          {/* Student Selection List */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        transferSourceStudents.length > 0 &&
                        selectedTransferStudentIds.length === transferSourceStudents.length
                      }
                      onChange={selectAllTransferStudents}
                      className="rounded"
                    />
                  </th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Admission No</th>
                  <th className="py-2.5 px-3">Current Class &amp; Tutor</th>
                  <th className="py-2.5 px-3">Destination Class &amp; New Form Tutor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transferSourceStudents.map(st => {
                  const checked = selectedTransferStudentIds.includes(st.id);
                  return (
                    <tr
                      key={st.id}
                      onClick={() => toggleTransferStudent(st.id)}
                      className={`cursor-pointer transition-colors ${
                        checked ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTransferStudent(st.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{st.fullName}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{st.admissionNumber}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-800">{transferSourceSection.name}</span>
                        <span className="text-slate-500 ml-1">({transferSourceSection.classTeacherName})</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-indigo-900">{transferDestSection.name}</span>
                        <span className="text-indigo-700 ml-1 font-semibold">
                          → Tutor: {transferDestSection.classTeacherName}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: MOVEMENT & PROMOTION / GRADUATION HISTORY LOG                */}
      {/* =================================================================== */}
      {activeSubTab === 'history' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Student Promotion, Graduation &amp; Parallel Transfer Audit Trail
              </h2>
              <p className="text-xs text-slate-500">
                Traceable record of all class movements, Year 12 graduations, session transitions, and Form Tutor assignments.
              </p>
            </div>
          </div>

          {promotionLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No student promotions, graduations, or parallel class transfers recorded yet in this session.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[10px]">
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Movement Type</th>
                    <th className="py-2.5 px-3">From Class (Session)</th>
                    <th className="py-2.5 px-3">To Class (Session)</th>
                    <th className="py-2.5 px-3">Assigned Form Tutor</th>
                    <th className="py-2.5 px-3 text-center">Cum. Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {promotionLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900">{log.studentName}</div>
                        <div className="text-[10px] font-mono text-slate-500">{log.admissionNumber}</div>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            log.decision === 'GRADUATED'
                              ? 'bg-emerald-950 text-amber-300'
                              : log.decision === 'PROMOTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.decision === 'PROBATION'
                              ? 'bg-amber-100 text-amber-800'
                              : log.decision === 'PARALLEL_TRANSFER'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {log.decision}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {log.fromSectionName} ({log.fromSessionName})
                      </td>
                      <td className="py-2 px-3 font-bold text-indigo-950">
                        {log.toSectionName} ({log.toSessionName})
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-800">
                        {log.toFormTutorName}
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        {log.cumulativeAvgPct > 0 ? `${log.cumulativeAvgPct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* PROMOTION VALIDATION MODAL (BLOCKS PROMOTION IF SESSION/CLASS UNSET)*/}
      {/* =================================================================== */}
      {validationModalError && (
        <div
          data-testid="promotion-validation-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {validationModalError.title}
                  </h3>
                  <p className="text-xs text-rose-600 font-bold">
                    Promotion Action Blocked Until Prerequisite Is Met
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="close-promotion-validation-modal-btn"
                onClick={() => setValidationModalError(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-950 leading-relaxed font-medium">
              {validationModalError.message}
            </div>

            {validationModalError.missingSession && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-[11px] font-black uppercase text-slate-700">
                  Quick-Create Next Academic Session Now:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSessionNameInput}
                    onChange={(e) => setNewSessionNameInput(e.target.value)}
                    placeholder="e.g. 2027/28"
                    className="flex-1 px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white"
                  />
                  <button
                    type="button"
                    data-testid="modal-quick-create-session-btn"
                    onClick={() => {
                      handleCreateNextSession();
                      setValidationModalError(null);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Create &amp; Select Session
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setValidationModalError(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DUPLICATE STUDENT WARNING MODAL ON PARALLEL ARM TRANSFER            */}
      {/* =================================================================== */}
      {transferDuplicateWarning && (
        <div
          data-testid="duplicate-transfer-warning-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-amber-300 overflow-hidden p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Duplicate Student Warning
                  </h3>
                  <p className="text-xs text-amber-700 font-bold">
                    Student Already Exists in {transferDuplicateWarning.destinationSectionName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferDuplicateWarning(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed space-y-2">
              <p className="font-bold">
                {transferDuplicateWarning.conflicts.length} selected student(s) you are trying to move from{' '}
                <strong>{transferSourceSection.name}</strong> already exist in{' '}
                <strong>{transferDuplicateWarning.destinationSectionName}</strong>:
              </p>
              <ul className="space-y-1.5 pl-1">
                {transferDuplicateWarning.conflicts.map(c => (
                  <li
                    key={c.sourceStudent.id}
                    className="p-2 rounded-lg bg-white border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                  >
                    <div>
                      <span className="font-black text-slate-900">{c.sourceStudent.fullName}</span>
                      <span className="text-[11px] text-slate-500 font-mono ml-1.5">
                        ({c.sourceStudent.admissionNumber})
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        c.hasIdenticalScores
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {c.hasIdenticalScores
                        ? 'Exact Same Name & Scores in Destination'
                        : 'Already Enrolled in Destination Class'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                data-testid="cancel-duplicate-transfer-btn"
                onClick={() => setTransferDuplicateWarning(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Cancel Transfer
              </button>
              {transferDuplicateWarning.safeStudentIds.length > 0 && (
                <button
                  type="button"
                  data-testid="skip-duplicates-transfer-btn"
                  onClick={() => executeConfirmedTransfer(transferDuplicateWarning.safeStudentIds)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                >
                  Skip Duplicate(s) &amp; Move Remaining ({transferDuplicateWarning.safeStudentIds.length})
                </button>
              )}
              <button
                type="button"
                data-testid="force-duplicate-transfer-btn"
                onClick={() => executeConfirmedTransfer(selectedTransferStudentIds)}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
              >
                Move Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* OFFICIAL SCHOOL TESTIMONIAL & SEALED TRANSCRIPT MODAL               */}
      {/* =================================================================== */}
      {activeTestimonialStudent && (
        <SchoolTestimonialModal
          student={activeTestimonialStudent}
          onClose={() => setActiveTestimonialStudent(null)}
        />
      )}
    </div>
  );
};
