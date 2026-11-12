/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Student, StudentTestimonial } from '../types/index';
import {
  DEFAULT_INSTITUTION_LOGO_DATA_URI,
  resolveInstitutionLogoUrl,
  generateStudentTestimonialRecord
} from '../utils/rbacAndAuth';
import {
  X,
  Printer,
  Award,
  FileCheck,
  ShieldCheck,
  Edit3,
  Check,
  Lock
} from 'lucide-react';

interface SchoolTestimonialModalProps {
  student: Student;
  onClose: () => void;
}

export const SchoolTestimonialModal: React.FC<SchoolTestimonialModalProps> = ({
  student,
  onClose
}) => {
  const {
    schoolProfile,
    currentSession,
    classSections,
    subjects,
    enrollments,
    termSubjectRecords,
    studentTestimonials,
    updateStudentTestimonial,
    getStudentAnnualSummary,
    currentRole
  } = useApp();

  const [activeDocTab, setActiveDocTab] = useState<'TESTIMONIAL' | 'TRANSCRIPT' | 'BOTH'>('TESTIMONIAL');
  const [isEditingFields, setIsEditingFields] = useState(false);

  const section = classSections.find(s => s.id === student.currentSectionId);
  const annualSummary = useMemo(() => getStudentAnnualSummary(student.id), [getStudentAnnualSummary, student.id]);

  // Retrieve or synthesize the student's testimonial record
  const testimonial: StudentTestimonial = useMemo(() => {
    const existing = studentTestimonials.find(t => t.studentId === student.id);
    if (existing) return existing;

    const stEnrollments = enrollments.filter(e => e.studentId === student.id && e.isIncluded);
    const stSubjects = subjects
      .filter(sub =>
        stEnrollments.length > 0
          ? stEnrollments.some(e => e.subjectId === sub.id)
          : sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
      )
      .map(s => s.name);

    return generateStudentTestimonialRecord({
      student,
      schoolProfile,
      sectionName: section?.name || 'YEAR 12',
      sessionName: student.graduatedSessionName || currentSession.name,
      subjectsStudied: stSubjects,
      cumulativeAvgPct: annualSummary.yearlyAveragePct,
      finalGrade: annualSummary.yearlyGrade
    });
  }, [
    studentTestimonials,
    student,
    enrollments,
    subjects,
    schoolProfile,
    section,
    currentSession.name,
    annualSummary
  ]);

  const [draft, setDraft] = useState<StudentTestimonial>(testimonial);

  const canEdit =
    currentRole === 'SUPER_ADMIN' ||
    currentRole === 'PRINCIPAL' ||
    currentRole === 'HEAD_OF_SCHOOLS' ||
    currentRole === 'VICE_PRINCIPAL';

  const handleSaveEdits = () => {
    updateStudentTestimonial(student.id, draft);
    setIsEditingFields(false);
  };

  const logoSrc = resolveInstitutionLogoUrl(schoolProfile.logoUrl);

  // Split subjects across 2 lines like the reference Midtown College testimonial
  const subjectsLine1 = (isEditingFields ? draft.subjectsStudied : testimonial.subjectsStudied)
    .slice(0, 5)
    .map(s => s.toUpperCase())
    .join(', ');
  const subjectsLine2 = (isEditingFields ? draft.subjectsStudied : testimonial.subjectsStudied)
    .slice(5, 11)
    .map(s => s.toUpperCase())
    .join(', ');

  // Subject transcript rows for the student
  const transcriptRows = useMemo(() => {
    const stEnr = enrollments.filter(e => e.studentId === student.id && e.isIncluded);
    const applicableSubjects = subjects.filter(sub =>
      stEnr.length > 0
        ? stEnr.some(e => e.subjectId === sub.id)
        : sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
    );
    return applicableSubjects.map(sub => {
      const t1 = termSubjectRecords.find(r => r.studentId === student.id && r.subjectId === sub.id && r.termId === 1);
      const t2 = termSubjectRecords.find(r => r.studentId === student.id && r.subjectId === sub.id && r.termId === 2);
      const t3 = termSubjectRecords.find(r => r.studentId === student.id && r.subjectId === sub.id && r.termId === 3);
      const vals = [t1?.totalScore, t2?.totalScore, t3?.totalScore].filter(
        (v): v is number => v !== undefined && v > 0
      );
      const avg = vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0;
      const finalGrade = t3?.grade || t2?.grade || t1?.grade || (avg >= 75 ? 'A1' : avg >= 65 ? 'B' : avg >= 50 ? 'C' : avg > 0 ? 'D' : '-');
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        code: sub.code,
        t1Score: t1?.totalScore ?? 0,
        t2Score: t2?.totalScore ?? 0,
        t3Score: t3?.totalScore ?? 0,
        avgScore: avg,
        grade: finalGrade
      };
    });
  }, [enrollments, student.id, subjects, termSubjectRecords]);

  // Star border array for top/bottom & left/right decorative frame matching reference image
  const topBottomStars = Array.from({ length: 18 });
  const sideStars = Array.from({ length: 22 });

  return (
    <div
      data-testid="school-testimonial-modal"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:static print:bg-white print:p-0"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto print:border-none print:shadow-none print:bg-white print:max-w-none">
        {/* Top Action Bar (Hidden on Print) */}
        <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-black text-white">
                  Official School Testimonial &amp; Sealed Graduation Transcript
                </h3>
                <span
                  data-testid="sealed-record-badge"
                  className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center space-x-1"
                >
                  <Lock className="w-3 h-3" />
                  <span>SIGNED: {student.recordSignature || 'GRADUATED'} • RECORD SEALED</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {student.fullName} ({student.admissionNumber}) • Session {testimonial.graduatedSessionName}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Document View Switcher */}
            <div className="inline-flex rounded-xl bg-slate-800 p-1 border border-slate-700">
              <button
                type="button"
                data-testid="testimonial-tab-btn"
                onClick={() => setActiveDocTab('TESTIMONIAL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  activeDocTab === 'TESTIMONIAL'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                School Testimonial
              </button>
              <button
                type="button"
                data-testid="transcript-tab-btn"
                onClick={() => setActiveDocTab('TRANSCRIPT')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  activeDocTab === 'TRANSCRIPT'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Sealed Transcript
              </button>
              <button
                type="button"
                data-testid="both-docs-tab-btn"
                onClick={() => setActiveDocTab('BOTH')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  activeDocTab === 'BOTH'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Both (Print Pack)
              </button>
            </div>

            {canEdit && activeDocTab !== 'TRANSCRIPT' && (
              <button
                type="button"
                data-testid="edit-testimonial-fields-btn"
                onClick={() => {
                  if (isEditingFields) {
                    handleSaveEdits();
                  } else {
                    setDraft(testimonial);
                    setIsEditingFields(true);
                  }
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  isEditingFields
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                }`}
              >
                {isEditingFields ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Testimonial</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Remarks</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              type="button"
              data-testid="close-testimonial-modal-btn"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Canvas */}
        <div className="p-4 sm:p-8 bg-slate-200 max-h-[84vh] overflow-y-auto space-y-8 print:p-0 print:bg-white print:max-h-none print:overflow-visible">
          {/* ================================================================= */}
          {/* 1. OFFICIAL SCHOOL TESTIMONIAL (MATCHING ATTACHED CERTIFICATE)     */}
          {/* ================================================================= */}
          {(activeDocTab === 'TESTIMONIAL' || activeDocTab === 'BOTH') && (
            <div
              data-testid="official-school-testimonial-sheet"
              className="max-w-[760px] mx-auto bg-[#faf7ef] text-slate-900 shadow-2xl relative p-4 sm:p-6 border-4 border-slate-800 print:shadow-none"
            >
              {/* Outer Decorative Star Frame */}
              <div className="border-2 border-slate-800 relative p-5 sm:p-8 bg-[#fbf9f2]">
                {/* Top Star Pattern Bar */}
                <div
                  aria-hidden="true"
                  className="flex items-center justify-between bg-slate-800 text-[#faf7ef] px-2 py-0.5 mb-4 select-none text-[11px] tracking-widest"
                >
                  {topBottomStars.map((_, idx) => (
                    <span key={idx}>★</span>
                  ))}
                </div>

                {/* Left & Right Decorative Star Strips */}
                <div
                  aria-hidden="true"
                  className="hidden sm:flex flex-col justify-between items-center bg-slate-800 text-[#faf7ef] w-4 py-2 absolute left-1.5 top-10 bottom-10 select-none text-[9px]"
                >
                  {sideStars.map((_, idx) => (
                    <span key={idx}>★</span>
                  ))}
                </div>
                <div
                  aria-hidden="true"
                  className="hidden sm:flex flex-col justify-between items-center bg-slate-800 text-[#faf7ef] w-4 py-2 absolute right-1.5 top-10 bottom-10 select-none text-[9px]"
                >
                  {sideStars.map((_, idx) => (
                    <span key={idx}>★</span>
                  ))}
                </div>

                {/* Inner Certificate Content */}
                <div className="sm:px-6 space-y-4">
                  {/* School Crest / Logo at Top Center */}
                  <div className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-xl bg-white border-2 border-indigo-950 p-1.5 shadow-md flex items-center justify-center mb-2">
                      <img
                        src={logoSrc}
                        alt={schoolProfile.name}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = DEFAULT_INSTITUTION_LOGO_DATA_URI;
                        }}
                      />
                    </div>

                    {/* Bold Navy School Title */}
                    <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-[#26356b] uppercase leading-tight">
                      {schoolProfile.name}
                    </h1>

                    {/* Red Location / Address Subtitle */}
                    <p className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-[#b93829] mt-0.5">
                      {schoolProfile.address || 'VICTORIA DISTRICT • SECONDARY ACADEMIC WING, KADUNA'}
                    </p>

                    {/* Script / Cursive "School Testimonial" Heading */}
                    <div className="mt-3 inline-block border-b-2 border-slate-900 pb-0.5 px-3">
                      <h2
                        className="text-2xl sm:text-3xl font-black italic text-slate-900 tracking-wide"
                        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                      >
                        School Testimonial
                      </h2>
                    </div>

                    {/* Red Italic "This is to certify that" */}
                    <p
                      className="text-base sm:text-lg italic font-semibold text-[#b93829] mt-2"
                      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                    >
                      This is to certify that
                    </p>
                  </div>

                  {/* Lined Testimonial Fields Matching Reference Image */}
                  <div className="space-y-3 text-xs sm:text-sm font-bold text-slate-900 pt-2">
                    {/* Line 1: Name & Exam No. */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="shrink-0">Name</span>
                      <span
                        data-testid="testimonial-student-name"
                        className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs sm:text-sm uppercase tracking-wide text-center"
                      >
                        {student.fullName}
                      </span>
                      <span className="shrink-0">Exam No.</span>
                      {isEditingFields ? (
                        <input
                          type="text"
                          value={draft.examNumber}
                          onChange={(e) => setDraft({ ...draft, examNumber: e.target.value })}
                          className="w-40 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs uppercase text-center"
                        />
                      ) : (
                        <span className="w-40 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs sm:text-sm uppercase text-center">
                          {testimonial.examNumber}
                        </span>
                      )}
                    </div>

                    {/* Line 2: Has been a student of */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="shrink-0">Has been a student of</span>
                      <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs sm:text-sm uppercase tracking-wide text-center">
                        {schoolProfile.name}
                      </span>
                    </div>

                    {/* Line 3: From ... to ... */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="shrink-0">From</span>
                      {isEditingFields ? (
                        <input
                          type="text"
                          value={draft.fromYear}
                          onChange={(e) => setDraft({ ...draft, fromYear: e.target.value })}
                          className="flex-1 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs text-center"
                        />
                      ) : (
                        <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs sm:text-sm text-center">
                          {testimonial.fromYear}
                        </span>
                      )}
                      <span className="shrink-0">to</span>
                      {isEditingFields ? (
                        <input
                          type="text"
                          value={draft.toYear}
                          onChange={(e) => setDraft({ ...draft, toYear: e.target.value })}
                          className="flex-1 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs text-center"
                        />
                      ) : (
                        <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs sm:text-sm text-center">
                          {testimonial.toYear}
                        </span>
                      )}
                    </div>

                    {/* Line 4 & 5: Entered in Class ... and left in Class ... Subjects studied */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="shrink-0">He/She entered the College in Class</span>
                      {isEditingFields ? (
                        <input
                          type="text"
                          value={draft.enteredClass}
                          onChange={(e) => setDraft({ ...draft, enteredClass: e.target.value })}
                          className="flex-1 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs uppercase text-center"
                        />
                      ) : (
                        <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase text-center">
                          {testimonial.enteredClass}
                        </span>
                      )}
                      <span className="shrink-0">and left in</span>
                    </div>

                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="shrink-0">Class</span>
                      {isEditingFields ? (
                        <input
                          type="text"
                          value={draft.leftClass}
                          onChange={(e) => setDraft({ ...draft, leftClass: e.target.value })}
                          className="w-56 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs uppercase text-center"
                        />
                      ) : (
                        <span className="w-56 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase text-center">
                          {testimonial.leftClass}
                        </span>
                      )}
                      <span className="shrink-0">Subjects studied</span>
                    </div>

                    {/* Two Full Lines of Subjects Studied */}
                    <div className="border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase tracking-tight text-center min-h-[20px]">
                      {subjectsLine1 || 'MATHEMATICS, ENGLISH LANGUAGE, CIVIC EDUCATION, BIOLOGY, ECONOMICS'}
                    </div>
                    <div className="border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase tracking-tight text-center min-h-[20px]">
                      {subjectsLine2 || 'PHYSICS, CHEMISTRY, FURTHER MATHEMATICS, LITERATURE IN ENGLISH'}
                    </div>

                    {/* Character & Ability Lines */}
                    <div className="space-y-2.5 pt-1 max-w-xl">
                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0">Academic Ability</span>
                        {isEditingFields ? (
                          <input
                            type="text"
                            value={draft.academicAbility}
                            onChange={(e) => setDraft({ ...draft, academicAbility: e.target.value })}
                            className="flex-1 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs uppercase text-center"
                          />
                        ) : (
                          <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase text-center">
                            {testimonial.academicAbility}
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0">Co-Curricular Activities</span>
                        {isEditingFields ? (
                          <input
                            type="text"
                            value={draft.coCurricularActivities}
                            onChange={(e) => setDraft({ ...draft, coCurricularActivities: e.target.value })}
                            className="flex-1 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs uppercase text-center"
                          />
                        ) : (
                          <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase text-center">
                            {testimonial.coCurricularActivities}
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0">Post of Responsibility held</span>
                        {isEditingFields ? (
                          <input
                            type="text"
                            value={draft.postOfResponsibility}
                            onChange={(e) => setDraft({ ...draft, postOfResponsibility: e.target.value })}
                            className="flex-1 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs uppercase text-center"
                          />
                        ) : (
                          <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase text-center">
                            {testimonial.postOfResponsibility}
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0">Remarks on Attitude</span>
                        {isEditingFields ? (
                          <input
                            type="text"
                            value={draft.remarksOnAttitude}
                            onChange={(e) => setDraft({ ...draft, remarksOnAttitude: e.target.value })}
                            className="flex-1 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs uppercase text-center"
                          />
                        ) : (
                          <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase text-center">
                            {testimonial.remarksOnAttitude}
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0">General Remarks</span>
                        {isEditingFields ? (
                          <input
                            type="text"
                            value={draft.generalRemarks}
                            onChange={(e) => setDraft({ ...draft, generalRemarks: e.target.value })}
                            className="flex-1 border-b-2 border-indigo-600 bg-white px-2 py-0.5 font-mono text-xs uppercase text-center"
                          />
                        ) : (
                          <span className="flex-1 border-b border-slate-800 px-2 pb-0.5 font-mono text-xs uppercase text-center">
                            {testimonial.generalRemarks}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Seal & Principal Signature Row */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="text-[11px] font-mono text-slate-600">
                      <div>RECORD STATUS: <strong className="text-emerald-800">SIGNED &amp; SEALED ({testimonial.recordSignature})</strong></div>
                      <div>SESSION: {testimonial.graduatedSessionName}</div>
                    </div>

                    {/* Serrated Red/Orange Official Seal (like reference image) */}
                    <div className="relative flex items-center justify-center">
                      <div
                        className="w-24 h-24 rounded-full bg-gradient-to-br from-[#ea580c] to-[#c2410c] text-white flex flex-col items-center justify-center shadow-lg border-4 border-dashed border-[#fed7aa] select-none"
                        title="Official School Graduation Seal"
                      >
                        <ShieldCheck className="w-6 h-6 text-amber-200 mb-0.5" />
                        <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                          OFFICIAL SEAL
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider mt-0.5 text-amber-100">
                          {testimonial.recordSignature}
                        </span>
                      </div>
                    </div>

                    {/* Principal Signature & Date */}
                    <div className="text-center sm:text-right min-w-[200px]">
                      <div
                        className="text-lg italic font-serif text-slate-900 border-b border-slate-800 pb-0.5 px-3"
                        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                      >
                        {testimonial.principalName || schoolProfile.principalName}
                      </div>
                      <div className="text-xs font-black uppercase tracking-wider text-slate-800 mt-1">
                        PRINCIPAL
                      </div>
                      <div className="text-xs font-bold text-slate-800 mt-1 flex items-center justify-center sm:justify-end space-x-1">
                        <span>Date</span>
                        <span className="border-b border-slate-800 px-2 font-mono">
                          {testimonial.issueDate}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Star Pattern Bar */}
                <div
                  aria-hidden="true"
                  className="flex items-center justify-between bg-slate-800 text-[#faf7ef] px-2 py-0.5 mt-5 select-none text-[11px] tracking-widest"
                >
                  {topBottomStars.map((_, idx) => (
                    <span key={idx}>★</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* 2. SEALED GRADUATION ACADEMIC TRANSCRIPT                          */}
          {/* ================================================================= */}
          {(activeDocTab === 'TRANSCRIPT' || activeDocTab === 'BOTH') && (
            <div
              data-testid="sealed-academic-transcript-sheet"
              className="max-w-[760px] mx-auto bg-white text-slate-900 shadow-2xl border-2 border-slate-900 p-6 space-y-4 print:shadow-none"
            >
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
                <div className="flex items-center space-x-3">
                  <img
                    src={logoSrc}
                    alt={schoolProfile.name}
                    className="w-14 h-14 object-contain"
                  />
                  <div>
                    <h2 className="text-lg font-black uppercase text-slate-900">
                      {schoolProfile.name}
                    </h2>
                    <p className="text-xs font-bold text-slate-600 uppercase">
                      OFFICIAL SENIOR SECONDARY GRADUATION TRANSCRIPT (SEALED RECORD)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded bg-emerald-900 text-white text-xs font-black uppercase tracking-wider">
                    SIGNED: {student.recordSignature || 'GRADUATED'}
                  </span>
                  <div className="text-[11px] font-mono text-slate-600 mt-1">
                    Session: {testimonial.graduatedSessionName}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-100 p-3 rounded-lg border border-slate-300 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold block">Graduate Name:</span>
                  <span className="font-black text-slate-900">{student.fullName}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block">Admission / Exam No:</span>
                  <span className="font-mono font-bold text-slate-900">{student.admissionNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block">Graduating Class:</span>
                  <span className="font-bold text-slate-900">{section?.name || 'YEAR 12'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block">Record Status:</span>
                  <span className="font-black text-emerald-700">SEALED • IMMUTABLE</span>
                </div>
              </div>

              <table className="w-full text-xs border-collapse border border-slate-800">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase">
                    <th className="border border-slate-700 px-2.5 py-2 text-left">Subject</th>
                    <th className="border border-slate-700 px-2 py-2 text-center">1st Term</th>
                    <th className="border border-slate-700 px-2 py-2 text-center">2nd Term</th>
                    <th className="border border-slate-700 px-2 py-2 text-center">3rd Term</th>
                    <th className="border border-slate-700 px-2 py-2 text-center">Cumulative Avg</th>
                    <th className="border border-slate-700 px-2 py-2 text-center">Final Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {transcriptRows.map(row => (
                    <tr key={row.subjectId} className="odd:bg-white even:bg-slate-50">
                      <td className="border border-slate-300 px-2.5 py-1.5 font-bold text-slate-800">
                        {row.subjectName}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                        {row.t1Score > 0 ? row.t1Score.toFixed(1) : '-'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                        {row.t2Score > 0 ? row.t2Score.toFixed(1) : '-'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                        {row.t3Score > 0 ? row.t3Score.toFixed(1) : '-'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-bold text-indigo-950">
                        {row.avgScore > 0 ? `${row.avgScore.toFixed(1)}%` : '-'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black">
                        {row.grade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between pt-3 border-t border-slate-300 text-xs">
                <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                  <FileCheck className="w-4 h-4" />
                  <span>
                    Certified True Copy • Academic Record Permanently Sealed Upon Year 12 Graduation
                  </span>
                </div>
                <div className="font-bold text-slate-900">
                  Principal: {schoolProfile.principalName} ({testimonial.issueDate})
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
