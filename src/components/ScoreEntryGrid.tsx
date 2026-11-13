/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Student, CaSubScoreDetails } from '../types/index';
import {
  calculateCumulativePercentage,
  determineGrade,
  divideRawCaByTwo,
  calculateOfficialTermRecord,
  resolveActiveGradingScaleBands,
  sortStudentsForGridAndRegistry,
  resolveExpandedCaComponentScores,
  StudentSortMode
} from '../utils/academicCalculations';
import { resolveCustomReportColumnScore } from '../utils/customReportEngine';
import {
  hasAllSubjectsClearance,
  getTeacherAssignedSubjectIdsForSection
} from '../utils/rbacAndAuth';
import {
  Search,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  AlertTriangle,
  ExternalLink,
  Edit2,
  PlusCircle,
  Check,
  Sliders,
  Table,
  Layers,
  BookOpen,
  Calendar,
  ArrowUpAZ,
  ArrowDownZA,
  ArrowUpDown,
  X,
  ClipboardList
} from 'lucide-react';
import { CsvImportExportModal } from './CsvImportExportModal';
import { StudentEditModal } from './StudentEditModal';

interface ScoreEntryGridProps {
  onViewReportCard: (studentId: number) => void;
}

export const ScoreEntryGrid: React.FC<ScoreEntryGridProps> = ({ onViewReportCard }) => {
  const {
    currentSection,
    classSections,
    selectedSectionId,
    setSelectedSectionId,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    students,
    assessmentComponents,
    enrollments,
    scores,
    updateScore,
    toggleSubjectInclusion,
    termSubjectRecords,
    updateTermSubjectScore,
    currentTerm,
    setCurrentTerm,
    terms,
    lastAutoSavedTime,
    currentRole,
    currentUser,
    teachers,
    customReportTemplates,
    updateStudentCustomReportScore,
    gradingScalePresets
  } = useApp();

  const [ledgerMode, setLedgerMode] = useState<'ca_grid' | 'term_registry' | 'custom_report'>('ca_grid');
  const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useState('');
  const [customScoreErrors, setCustomScoreErrors] = useState<Record<string, string>>({});
  const [showDetailedColumns, setShowDetailedColumns] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [studentSortMode, setStudentSortMode] = useState<StudentSortMode>(() => {
    try {
      const saved = localStorage.getItem('edugrade_grid_student_sort_order_v1') as StudentSortMode | null;
      if (saved === 'AZ' || saved === 'ZA' || saved === 'ADM_ASC' || saved === 'ADM_DESC' || saved === 'DEFAULT') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'AZ';
  });

  const handleUpdateStudentSortMode = (mode: StudentSortMode) => {
    setStudentSortMode(mode);
    try {
      localStorage.setItem('edugrade_grid_student_sort_order_v1', mode);
    } catch {
      // ignore
    }
  };

  const handleToggleAlphabeticalSort = () => {
    handleUpdateStudentSortMode(studentSortMode === 'AZ' ? 'ZA' : 'AZ');
  };

  const handleToggleAdmissionSort = () => {
    handleUpdateStudentSortMode(studentSortMode === 'ADM_ASC' ? 'ADM_DESC' : 'ADM_ASC');
  };

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isCsvCredentialModalOpen, setIsCsvCredentialModalOpen] = useState(false);
  const [csvCredentialUsername, setCsvCredentialUsername] = useState(currentUser.username || '');
  const [csvCredential, setCsvCredential] = useState('');
  const [csvCredentialError, setCsvCredentialError] = useState<string | null>(null);
  const [isVerifyingCsvCredential, setIsVerifyingCsvCredential] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [auditReason] = useState('Assessment score entry');

  const handleVerifyCsvAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    setCsvCredentialError(null);
    setIsVerifyingCsvCredential(true);
    try {
      const response = await fetch('/api/auth/verify-super-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: csvCredentialUsername,
          password: csvCredential,
          initialPin: csvCredential
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Super Admin credentials could not be verified.');
      }
      setIsCsvCredentialModalOpen(false);
      setCsvCredential('');
      setIsCsvModalOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCsvCredentialError(message);
    } finally {
      setIsVerifyingCsvCredential(false);
    }
  };

  // Sub-scores Modal State for Registry Mode (blank string '' when no score entered)
  const [subScoreModal, setSubScoreModal] = useState<{
    student: Student;
    caType: 'ca1' | 'ca2' | 'exam';
  } | null>(null);
  const [modalCw, setModalCw] = useState<string>('');
  const [modalQz, setModalQz] = useState<string>('');
  const [modalAss, setModalAss] = useState<string>('');
  const [modalPj, setModalPj] = useState<string>('');
  const [modalTest, setModalTest] = useState<string>('');
  const [modalExam, setModalExam] = useState<string>('');

  // Input refs for keyboard navigation
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isSenior = currentSection.levelType === 'SENIOR';
  const maxCa = isSenior ? 30.0 : 40.0;
  const maxCaDivided = isSenior ? 15.0 : 20.0;
  const maxExam = isSenior ? 70.0 : 60.0;

  const fullSubjectClearance = hasAllSubjectsClearance(currentRole);

  // Active teacher's assigned subjects across classes
  const activeTeacherAssignedSubjects = useMemo(() => {
    const matchedTeacher = teachers.find(
      t =>
        t.id === currentUser.id ||
        (currentUser.username && t.username?.toLowerCase() === currentUser.username.toLowerCase())
    );
    return matchedTeacher?.assignedSubjects || currentUser.assignedSubjects || [];
  }, [teachers, currentUser]);

  // Filter applicable subjects for this section (enforcing strict subject clearance for teachers)
  const availableSubjects = useMemo(() => {
    const levelSubjects = subjects.filter(sub => {
      if (isSenior) {
        return sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH';
      } else {
        return sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH';
      }
    });

    if (fullSubjectClearance) {
      return levelSubjects;
    }

    const assignedIdsForClass = getTeacherAssignedSubjectIdsForSection(
      activeTeacherAssignedSubjects,
      selectedSectionId
    );
    const filteredForTeacher = levelSubjects.filter(sub => assignedIdsForClass.includes(sub.id));
    return filteredForTeacher.length > 0 ? filteredForTeacher : levelSubjects.slice(0, 1);
  }, [subjects, isSenior, fullSubjectClearance, activeTeacherAssignedSubjects, selectedSectionId]);

  const currentSubject = useMemo(() => {
    return availableSubjects.find(s => s.id === selectedSubjectId) || availableSubjects[0] || subjects[0];
  }, [availableSubjects, selectedSubjectId, subjects]);

  // Components for this section's level
  const activeComponents = useMemo(() => {
    return assessmentComponents.filter(c => c.levelType === currentSection.levelType);
  }, [assessmentComponents, currentSection]);

  const sectionCustomTemplates = useMemo(
    () => customReportTemplates.filter(template =>
      (template.sectionIds?.length ? template.sectionIds : [template.sectionId])
        .includes(selectedSectionId)
    ),
    [customReportTemplates, selectedSectionId]
  );
  const activeCustomTemplate = useMemo(
    () => sectionCustomTemplates.find(template => template.id === selectedCustomTemplateId)
      || sectionCustomTemplates[0],
    [sectionCustomTemplates, selectedCustomTemplateId]
  );

  useEffect(() => {
    if (!sectionCustomTemplates.some(template => template.id === selectedCustomTemplateId)) {
      setSelectedCustomTemplateId(sectionCustomTemplates[0]?.id || '');
    }
    setCustomScoreErrors({});
  }, [sectionCustomTemplates, selectedCustomTemplateId]);

  const customReportSubjects = useMemo(
    () => activeCustomTemplate
      ? availableSubjects.filter(subject => (activeCustomTemplate.selectedSubjectIds || []).includes(subject.id))
      : [],
    [activeCustomTemplate, availableSubjects]
  );
  const customReportTotalMax = useMemo(
    () => (activeCustomTemplate?.columns || []).reduce(
      (total, column) => total + Math.max(0, Number(column.maxScore) || 0),
      0
    ),
    [activeCustomTemplate]
  );
  const customEnrollmentLookup = useMemo(
    () => new Map(enrollments.map(enrollment => [
      `${enrollment.studentId}_${enrollment.subjectId}_${enrollment.sectionId}`,
      enrollment
    ])),
    [enrollments]
  );
  const customTermRecordLookup = useMemo(
    () => new Map(
      termSubjectRecords
        .filter(record => record.termId === currentTerm.id)
        .map(record => [`${record.studentId}_${record.subjectId}`, record])
    ),
    [currentTerm.id, termSubjectRecords]
  );
  const customReportGradingBands = useMemo(
    () => resolveActiveGradingScaleBands({
      levelType: currentSection.levelType,
      presets: gradingScalePresets,
      isCustomReport: true,
      customTemplateId: activeCustomTemplate?.id
    }),
    [activeCustomTemplate?.id, currentSection.levelType, gradingScalePresets]
  );

  // Students in current section
  const sectionStudents = useMemo(() => {
    return students.filter(st => st.currentSectionId === selectedSectionId);
  }, [students, selectedSectionId]);

  // Filtered by search and arranged according to active alphabetical / admission sort mode
  const filteredStudents = useMemo(() => {
    const searched = !searchQuery.trim()
      ? sectionStudents
      : sectionStudents.filter(st => {
          const q = searchQuery.toLowerCase();
          return st.fullName.toLowerCase().includes(q) || st.admissionNumber.toLowerCase().includes(q);
        });
    return sortStudentsForGridAndRegistry(searched, studentSortMode);
  }, [sectionStudents, searchQuery, studentSortMode]);

  const customReportRows = useMemo(() => {
    if (!activeCustomTemplate) return [];
    return filteredStudents.map(student => {
      const studentRows = customReportSubjects
        .filter(subject => {
          if (currentSection.levelType === 'JUNIOR') return true;
          const enrollment = customEnrollmentLookup.get(
            `${student.id}_${subject.id}_${selectedSectionId}`
          );
          return enrollment ? enrollment.isIncluded : true;
        })
        .map(subject => {
          const termRecord = customTermRecordLookup.get(`${student.id}_${subject.id}`);
          const customScores = activeCustomTemplate.studentCustomScores?.[
            `${student.id}_${subject.id}`
          ];
          const columnScores = activeCustomTemplate.columns.map(column => ({
            column,
            score: resolveCustomReportColumnScore(column, customScores, termRecord)
          }));
          const total = Number(columnScores.reduce((sum, item) => sum + item.score, 0).toFixed(1));
          const percentage = customReportTotalMax > 0
            ? Number(((total / customReportTotalMax) * 100).toFixed(1))
            : 0;
          const grade = determineGrade(
            percentage,
            currentSection.levelType,
            customReportGradingBands
          );
          return { subject, columnScores, total, percentage, grade };
        });
      return { student, subjects: studentRows };
    });
  }, [
    activeCustomTemplate,
    customReportSubjects,
    currentSection.levelType,
    currentTerm.id,
    filteredStudents,
    customEnrollmentLookup,
    customTermRecordLookup,
    customReportGradingBands,
    selectedSectionId,
    customReportTotalMax
  ]);
  const customRowsByStudent = useMemo(
    () => new Map(customReportRows.map(row => [row.student.id, row.subjects])),
    [customReportRows]
  );

  const handleCustomReportScoreChange = (
    studentId: number,
    subjectId: number,
    columnId: string,
    maxScore: number,
    rawValue: string
  ) => {
    const errorKey = `${studentId}-${subjectId}-${columnId}`;
    if (!rawValue.trim()) {
      setCustomScoreErrors(previous => {
        const next = { ...previous };
        delete next[errorKey];
        return next;
      });
      if (activeCustomTemplate) {
        updateStudentCustomReportScore(activeCustomTemplate.id, studentId, subjectId, columnId, null);
      }
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0 || value > maxScore) {
      setCustomScoreErrors(previous => ({
        ...previous,
        [errorKey]: `Enter a score from 0 to ${maxScore}`
      }));
      return;
    }
    setCustomScoreErrors(previous => {
      const next = { ...previous };
      delete next[errorKey];
      return next;
    });
    if (activeCustomTemplate) {
      updateStudentCustomReportScore(activeCustomTemplate.id, studentId, subjectId, columnId, value);
    }
  };

  // Read score value for a student, subject, and component
  // Term-aware: Term 1 reads base scores or term-adjusted; Term Subject Records store per-term details
  const getScoreValue = (studentId: number, componentId: number): number | null => {
    // Check if there is a term-specific override in termSubjectRecords for Term 2 or 3
    if (currentTerm.id !== 1) {
      const rec = termSubjectRecords.find(
        r => r.studentId === studentId && r.subjectId === currentSubject.id && r.termId === currentTerm.id
      );
      if (rec && rec.ca1Details) {
        const comp = activeComponents.find(c => c.id === componentId);
        if (comp) {
          const code = comp.shortCode.toUpperCase();
          if (code === 'CW' && rec.ca1Details.cw !== undefined) return rec.ca1Details.cw;
          if (code === 'QZ' && rec.ca1Details.qz !== undefined) return rec.ca1Details.qz;
          if (code === 'ASS' && rec.ca1Details.ass !== undefined) return rec.ca1Details.ass;
          if (code === 'PJ' && rec.ca1Details.pj !== undefined) return rec.ca1Details.pj;
          if (code === 'TEST' && rec.ca1Details.test !== undefined) return rec.ca1Details.test;
        }
      }
    }
    const found = scores.find(
      s => s.studentId === studentId && s.subjectId === currentSubject.id && s.componentId === componentId
    );
    return found !== undefined && found.score !== null ? found.score : null;
  };

  // Check if subject is included for this student (Junior: all subjects are Core!)
  const isSubjectIncluded = (studentId: number): boolean => {
    if (!isSenior) return true;
    const enr = enrollments.find(
      e => e.studentId === studentId && e.subjectId === currentSubject.id && e.sectionId === selectedSectionId
    );
    return enr !== undefined ? enr.isIncluded : true;
  };

  // Calculate raw total for student in current subject
  const getStudentRawTotal = (studentId: number): number => {
    if (!isSubjectIncluded(studentId)) return 0;
    let sum = 0;
    activeComponents.forEach(comp => {
      const val = getScoreValue(studentId, comp.id);
      if (val !== null && !isNaN(val)) sum += val;
    });
    return Number(sum.toFixed(1));
  };

  // Get full Term Subject Record (CA1 + CA2 + EXAM) for a student in active term
  const getTermRecord = (studentId: number) => {
    const found = termSubjectRecords.find(
      r => r.studentId === studentId && r.subjectId === currentSubject.id && r.termId === currentTerm.id
    );
    const rawCa1 = getStudentRawTotal(studentId);
    const dividedCa1 = divideRawCaByTwo(rawCa1, currentSection.levelType);
    if (found) {
      return {
        ...found,
        ca1Score: found.ca1Score !== undefined ? found.ca1Score : dividedCa1
      };
    }

    const official = calculateOfficialTermRecord(
      currentSection.levelType,
      rawCa1,
      0,
      0,
      { ca1IsRaw: true, ca2IsRaw: true }
    );
    const grade = determineGrade(official.totalScore, currentSection.levelType).grade;

    return {
      id: 0,
      studentId,
      subjectId: currentSubject.id,
      termId: currentTerm.id,
      ca1RawScore: official.ca1RawScore,
      ca2RawScore: 0,
      ca1Score: official.ca1Score,
      ca2Score: 0,
      examScore: 0,
      totalScore: official.totalScore,
      grade,
      ca1Details: {
        cw: null,
        qz: null,
        ass: null,
        pj: isSenior ? undefined : null,
        test: null
      },
      ca2Details: {
        cw: null,
        qz: null,
        ass: null,
        pj: isSenior ? undefined : null,
        test: null
      }
    };
  };

  // Handle score change in CA1 Grid (AUTO-COMMITS IMMEDIATELY)
  const handleScoreChange = (studentId: number, componentId: number, rawInput: string) => {
    const comp = activeComponents.find(c => c.id === componentId);
    if (!comp) return;

    const cellKey = `${studentId}-${componentId}`;

    // If cell is cleared (empty), store null (missing score) — NOT 0!
    if (rawInput.trim() === '') {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
      updateScore(studentId, currentSubject.id, componentId, null, `${auditReason} (${currentTerm.name} TERM)`);
      const rec = getTermRecord(studentId);
      const code = comp.shortCode.toUpperCase();
      const updatedDetails: CaSubScoreDetails = {
        ...(rec.ca1Details || {}),
        ...(code === 'CW' ? { cw: null } : {}),
        ...(code === 'QZ' ? { qz: null } : {}),
        ...(code === 'ASS' ? { ass: null } : {}),
        ...(code === 'PJ' ? { pj: null } : {}),
        ...(code === 'TEST' ? { test: null } : {})
      };
      updateTermSubjectScore(studentId, currentSubject.id, currentTerm.id, {
        ca1Details: updatedDetails
      });
      return;
    }

    const parsed = parseFloat(rawInput);

    if (isNaN(parsed)) return;

    if (parsed < 0 || parsed > comp.maxScore) {
      setValidationErrors(prev => ({
        ...prev,
        [cellKey]: `Max ${comp.maxScore}`
      }));
      return;
    }

    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[cellKey];
      return next;
    });

    // Save to base assessment scores (0 is a valid entered score!)
    updateScore(studentId, currentSubject.id, componentId, parsed, `${auditReason} (${currentTerm.name} TERM)`);

    // Also sync to termSubjectRecords for the active term
    const rec = getTermRecord(studentId);
    const code = comp.shortCode.toUpperCase();
    const updatedDetails: CaSubScoreDetails = {
      ...(rec.ca1Details || {}),
      ...(code === 'CW' ? { cw: parsed } : {}),
      ...(code === 'QZ' ? { qz: parsed } : {}),
      ...(code === 'ASS' ? { ass: parsed } : {}),
      ...(code === 'PJ' ? { pj: parsed } : {}),
      ...(code === 'TEST' ? { test: parsed } : {})
    };
    updateTermSubjectScore(studentId, currentSubject.id, currentTerm.id, {
      ca1Details: updatedDetails
    });
  };

  // Keyboard navigation across grid cells
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    studentIdx: number,
    compIdx: number
  ) => {
    const totalStudents = filteredStudents.length;
    const totalComps = activeComponents.length;

    let targetStudentIdx = studentIdx;
    let targetCompIdx = compIdx;

    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      targetStudentIdx = Math.min(totalStudents - 1, studentIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      targetStudentIdx = Math.max(0, studentIdx - 1);
    } else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      e.preventDefault();
      if (compIdx + 1 < totalComps) {
        targetCompIdx = compIdx + 1;
      } else if (studentIdx + 1 < totalStudents) {
        targetStudentIdx = studentIdx + 1;
        targetCompIdx = 0;
      }
    } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      e.preventDefault();
      if (compIdx - 1 >= 0) {
        targetCompIdx = compIdx - 1;
      } else if (studentIdx - 1 >= 0) {
        targetStudentIdx = studentIdx - 1;
        targetCompIdx = totalComps - 1;
      }
    } else {
      return;
    }

    const targetStudent = filteredStudents[targetStudentIdx];
    const targetComp = activeComponents[targetCompIdx];
    if (targetStudent && targetComp) {
      const refKey = `${targetStudent.id}-${targetComp.id}`;
      const el = inputRefs.current[refKey];
      if (el) {
        el.focus();
        el.select();
      }
    }
  };

  // Sub-scores modal handlers — only load scores if already entered; otherwise leave blank ('')
  const getEnteredComponentScoreByCode = (studentId: number, shortCode: string): number | null => {
    const comp = activeComponents.find(c => c.shortCode.toUpperCase() === shortCode.toUpperCase());
    if (!comp) return null;
    return getScoreValue(studentId, comp.id);
  };

  const handleOpenScoreModal = (student: Student, caType: 'ca1' | 'ca2' | 'exam') => {
    const existingRec = termSubjectRecords.find(
      r => r.studentId === student.id && r.subjectId === currentSubject.id && r.termId === currentTerm.id
    );
    const details = caType === 'ca1' ? existingRec?.ca1Details : existingRec?.ca2Details;

    if (caType === 'exam') {
      const hasExam =
        existingRec !== undefined &&
        existingRec.examScore !== null &&
        existingRec.examScore !== undefined &&
        existingRec.examScore > 0;
      setModalExam(hasExam ? String(existingRec.examScore) : '');
    } else {
      const resolveField = (
        detailVal: number | null | undefined,
        shortCode: string
      ): string => {
        if (detailVal !== null && detailVal !== undefined) {
          return String(detailVal);
        }
        if (caType === 'ca1') {
          const gridVal = getEnteredComponentScoreByCode(student.id, shortCode);
          if (gridVal !== null && gridVal !== undefined) {
            return String(gridVal);
          }
        }
        return '';
      };

      setModalCw(resolveField(details?.cw, 'CW'));
      setModalQz(resolveField(details?.qz, 'QZ'));
      setModalAss(resolveField(details?.ass, 'ASS'));
      setModalPj(isSenior ? '' : resolveField(details?.pj, 'PJ'));
      setModalTest(resolveField(details?.test, 'TEST'));
    }

    setSubScoreModal({ student, caType });
  };

  const modalCalculatedCaTotal = useMemo(() => {
    if (!subScoreModal) return 0;
    if (subScoreModal.caType === 'exam') {
      const parsedExam = parseFloat(modalExam);
      return isNaN(parsedExam) ? 0 : parsedExam;
    }
    const cw = parseFloat(modalCw) || 0;
    const qz = parseFloat(modalQz) || 0;
    const ass = parseFloat(modalAss) || 0;
    const pj = isSenior ? 0 : (parseFloat(modalPj) || 0);
    const test = parseFloat(modalTest) || 0;
    return Number((cw + qz + ass + pj + test).toFixed(1));
  }, [subScoreModal, modalCw, modalQz, modalAss, modalPj, modalTest, modalExam, isSenior]);

  const handleSaveModalScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subScoreModal) return;

    const parseOptionalScore = (raw: string, max: number): number | null => {
      if (raw.trim() === '') return null;
      const num = parseFloat(raw);
      if (isNaN(num)) return null;
      return Math.max(0, Math.min(max, num));
    };

    const { student, caType } = subScoreModal;
    if (caType === 'exam') {
      const parsedExam = parseOptionalScore(modalExam, maxExam);
      updateTermSubjectScore(student.id, currentSubject.id, currentTerm.id, {
        examScore: parsedExam ?? 0
      });
    } else {
      const cwVal = parseOptionalScore(modalCw, isSenior ? 2 : 5);
      const qzVal = parseOptionalScore(modalQz, isSenior ? 3 : 5);
      const assVal = parseOptionalScore(modalAss, 5);
      const pjVal = isSenior ? undefined : parseOptionalScore(modalPj, 5);
      const testVal = parseOptionalScore(modalTest, 20);

      const details: CaSubScoreDetails = {
        cw: cwVal,
        qz: qzVal,
        ass: assVal,
        pj: pjVal,
        test: testVal
      };

      if (caType === 'ca1') {
        // Also synchronize individual CA1 assessment component cells (keeping blank fields null)
        const syncMap: Array<{ code: string; val: number | null | undefined }> = [
          { code: 'CW', val: cwVal },
          { code: 'QZ', val: qzVal },
          { code: 'ASS', val: assVal },
          { code: 'PJ', val: pjVal ?? null },
          { code: 'TEST', val: testVal }
        ];
        syncMap.forEach(({ code, val }) => {
          const comp = activeComponents.find(c => c.shortCode.toUpperCase() === code);
          if (comp && val !== undefined) {
            updateScore(
              student.id,
              currentSubject.id,
              comp.id,
              val,
              `${auditReason} (${currentTerm.name} TERM)`
            );
          }
        });
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

  // Summary statistics for current subject & class
  const subjectStats = useMemo(() => {
    const includedStudents = sectionStudents.filter(st => isSubjectIncluded(st.id));
    if (includedStudents.length === 0) {
      return { avgPct: 0, avgGrade: 'N/A', highestPct: 0, lowestPct: 0, includedCount: 0 };
    }

    const percentages = includedStudents.map(st => {
      if (ledgerMode === 'term_registry') {
        return getTermRecord(st.id).totalScore;
      }
      const raw = getStudentRawTotal(st.id);
      return calculateCumulativePercentage(raw, maxCa);
    });

    const sum = percentages.reduce((acc, val) => acc + val, 0);
    const avgPct = Number((sum / percentages.length).toFixed(1));
    const avgGrade = determineGrade(avgPct, currentSection.levelType).grade;
    const highestPct = Math.max(...percentages);
    const lowestPct = Math.min(...percentages);

    return {
      avgPct,
      avgGrade,
      highestPct,
      lowestPct,
      includedCount: includedStudents.length
    };
  }, [sectionStudents, scores, enrollments, currentSubject, selectedSectionId, maxCa, currentSection, ledgerMode, termSubjectRecords, currentTerm.id]);

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* HIGH-VISIBILITY SUBJECT & TERM BANNER (Prevents Entry Mistakes!)      */}
      {/* ===================================================================== */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white rounded-2xl shadow-lg border-2 border-indigo-500/40 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Prominent Active Subject & Term Display */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[11px] font-black uppercase tracking-wider">
                Active Recording Context
              </span>
              <span className="text-xs text-indigo-200 font-medium">
                {ledgerMode === 'custom_report'
                  ? 'Enter scores using the selected custom report sheet'
                  : 'Verify Subject & Term before entering student scores'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1">
              {/* Giant Subject Highlight */}
              <div className="flex items-center space-x-2.5 bg-white text-slate-950 px-4 py-2.5 rounded-xl shadow-md border-2 border-amber-400">
                {ledgerMode === 'custom_report'
                  ? <ClipboardList className="w-6 h-6 text-amber-600 shrink-0" />
                  : <BookOpen className="w-6 h-6 text-indigo-600 shrink-0" />}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-none">
                    {ledgerMode === 'custom_report' ? 'ACTIVE CUSTOM REPORT' : 'ACTIVE SUBJECT'}
                  </div>
                  <div className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-indigo-950 leading-tight">
                    {ledgerMode === 'custom_report'
                      ? activeCustomTemplate?.title || 'Select a custom report'
                      : currentSubject.name}
                  </div>
                </div>
              </div>

              {/* Giant Term Highlight */}
              <div className="flex items-center space-x-2.5 bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-md border-2 border-indigo-300">
                <Calendar className="w-6 h-6 text-amber-300 shrink-0" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200 leading-none">
                    ACTIVE TERM
                  </div>
                  <div className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white leading-tight">
                    {currentTerm.name} TERM
                  </div>
                </div>
              </div>

              {/* Class Section Pill */}
              <div className="bg-slate-800/90 border border-slate-700 px-4 py-2.5 rounded-xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                  CLASS SECTION ({currentSection.levelType})
                </div>
                <div className="text-base sm:text-xl font-black text-amber-300 leading-tight mt-0.5">
                  {currentSection.name}
                </div>
              </div>
            </div>
          </div>

          {/* Right Controls: Term Switcher & Mode Switcher */}
          <div className="flex flex-col sm:items-end justify-between gap-3">
            {/* Term Selector Buttons (FIRST, SECOND, THIRD TERM) */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 mb-1 sm:text-right">
                Switch Academic Term:
              </div>
              <div className="inline-flex flex-wrap bg-slate-800/90 p-1 rounded-xl border border-slate-700">
                {terms.map(t => {
                  const isSelected = currentTerm.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCurrentTerm(t)}
                      className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 shadow-md scale-[1.02]'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                      }`}
                    >
                      {t.name} TERM
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ledger View Switcher */}
            <div className="inline-flex bg-slate-800/90 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setLedgerMode('ca_grid')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  ledgerMode === 'ca_grid'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>CA1 Assessment Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setLedgerMode('term_registry')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  ledgerMode === 'term_registry'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Full Term Registry (CA1+CA2+Exam)</span>
              </button>
              <button
                type="button"
                onClick={() => setLedgerMode('custom_report')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  ledgerMode === 'custom_report'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Custom Report Scores</span>
              </button>
            </div>
            {ledgerMode === 'custom_report' && (
              <div className="w-full sm:max-w-sm">
                <label
                  htmlFor="custom-report-template-selector"
                  className="block text-[10px] font-bold uppercase tracking-wider text-amber-200 mb-1 sm:text-right"
                >
                  Custom Report Sheet
                </label>
                <select
                  id="custom-report-template-selector"
                  aria-label="Select custom report sheet"
                  value={activeCustomTemplate?.id || ''}
                  onChange={event => setSelectedCustomTemplateId(event.target.value)}
                  disabled={!sectionCustomTemplates.length}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-xs font-bold text-white disabled:opacity-60"
                >
                  {!sectionCustomTemplates.length && <option value="">No custom report sheet for this class</option>}
                  {sectionCustomTemplates.map(template => (
                    <option key={template.id} value={template.id}>{template.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* FILTER & ACTION TOOLBAR                                               */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Class Section Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Class Section
            </label>
            <select
              aria-label="Select Class Section"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {classSections.map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name} ({sec.levelType})
                </option>
              ))}
            </select>
          </div>

          {/* Subject Selector (Large & Bold, filtered by Teacher Subject Clearance) */}
          {ledgerMode !== 'custom_report' && <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-indigo-700 mb-1">
              {fullSubjectClearance
                ? `All Curriculum Subjects (${availableSubjects.length})`
                : `Assigned Subjects Only (${availableSubjects.length})`}
            </label>
            <select
              aria-label="Select Curriculum Subject"
              data-testid="grid-subject-selector"
              value={currentSubject.id}
              onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-indigo-50/70 border-2 border-indigo-400 rounded-xl text-sm font-black text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
            >
              {availableSubjects.map(sub => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} {isSenior ? `(${sub.category})` : ''}
                </option>
              ))}
            </select>
            <div
              data-testid="subject-clearance-badge"
              className="text-[10px] font-semibold text-slate-500 mt-1"
            >
              {fullSubjectClearance
                ? 'Executive Clearance: Viewing all subjects across all classes'
                : `Teacher Restriction: Showing only subjects assigned to @${currentUser.username || currentUser.fullName}`}
            </div>
          </div>}

          {/* Student Search */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Find Student in Class
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name or admission..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2">
            {ledgerMode === 'term_registry' && (
              <button
                type="button"
                onClick={() => setShowDetailedColumns(!showDetailedColumns)}
                className={`flex items-center space-x-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  showDetailedColumns
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>{showDetailedColumns ? 'Collapse Sub-scores' : 'Expand CW/QZ/ASS/TEST'}</span>
              </button>
            )}

            {currentRole === 'SUPER_ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  setCsvCredentialUsername(currentUser.username || '');
                  setCsvCredentialError(null);
                  setIsCsvCredentialModalOpen(true);
                }}
                className="flex items-center space-x-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Bulk CSV Import / Export</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* KPI SUMMARY STRIP                                                     */}
      {/* ===================================================================== */}
      {ledgerMode !== 'custom_report' && <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Class Average</div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-xl font-black text-slate-900">{subjectStats.avgPct}%</span>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
              {subjectStats.avgGrade}
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">
            {ledgerMode === 'ca_grid' ? 'Max Possible CA' : 'Max Term Score'}
          </div>
          <div className="mt-1 text-xl font-black text-indigo-600">
            {ledgerMode === 'ca_grid' ? `${maxCa.toFixed(1)} marks` : '100.0%'}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Enrolled Students</div>
          <div className="mt-1 text-xl font-black text-slate-900">
            {subjectStats.includedCount} <span className="text-xs font-normal text-slate-400">/ {sectionStudents.length}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Highest Scaled %</div>
          <div className="mt-1 text-xl font-black text-emerald-600">{subjectStats.highestPct}%</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Lowest Scaled %</div>
          <div className="mt-1 text-xl font-black text-rose-600">{subjectStats.lowestPct}%</div>
        </div>
      </div>}

      {/* ===================================================================== */}
      {/* UNIFIED TABLE CONTAINER                                               */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Table Context Bar */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-slate-900 uppercase">{currentSection.name}</span>
            <span className="text-slate-300">•</span>
            {ledgerMode === 'custom_report' ? (
              <span className="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 text-sm font-black uppercase shadow-2xs">
                {activeCustomTemplate?.title || 'Custom Report'}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-sm font-black uppercase shadow-2xs">
                {currentSubject.name}
              </span>
            )}
            <span className="text-slate-300">•</span>
            <span className="px-3 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-sm font-black uppercase">
              {currentTerm.name} TERM
            </span>
            <span className="text-xs text-slate-500 ml-1">
              {ledgerMode === 'ca_grid'
                ? `(${activeComponents.map(c => `${c.shortCode}: ${c.maxScore}`).join(' + ')} = ${maxCa} Max CA)`
                : ledgerMode === 'term_registry'
                ? `(CA1 [${maxCa}] + CA2 [${maxCa}] + EXAM [${maxExam}] = 100%)`
                : `${activeCustomTemplate?.columns.length || 0} configured score columns • max ${customReportTotalMax}`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Alphabetical Student Sort & Arrangement Controls */}
            <div className="inline-flex items-center bg-white border border-slate-300 rounded-xl p-1 shadow-2xs">
              <button
                type="button"
                data-testid="grid-sort-az-btn"
                onClick={() => handleUpdateStudentSortMode('AZ')}
                title="Arrange Student Names Alphabetically (A → Z)"
                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  studentSortMode === 'AZ'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ArrowUpAZ className="w-3.5 h-3.5" />
                <span>Sort A–Z</span>
              </button>
              <button
                type="button"
                data-testid="grid-sort-za-btn"
                onClick={() => handleUpdateStudentSortMode('ZA')}
                title="Arrange Student Names Reverse Alphabetically (Z → A)"
                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  studentSortMode === 'ZA'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ArrowDownZA className="w-3.5 h-3.5" />
                <span>Z–A</span>
              </button>
              <select
                data-testid="grid-student-sort-select"
                value={studentSortMode}
                onChange={e => handleUpdateStudentSortMode(e.target.value as StudentSortMode)}
                className="ml-1 pl-2 pr-5 py-1 text-xs font-bold text-slate-700 bg-transparent border-l border-slate-200 focus:outline-none cursor-pointer"
                aria-label="Sort and arrange students"
              >
                <option value="AZ">Name: A → Z (Alphabetical)</option>
                <option value="ZA">Name: Z → A (Reverse)</option>
                <option value="ADM_ASC">Admission No: Ascending</option>
                <option value="ADM_DESC">Admission No: Descending</option>
                <option value="DEFAULT">Original Entry Order</option>
              </select>
            </div>

            {lastAutoSavedTime ? (
              <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Auto-saved at {lastAutoSavedTime}</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                <span>⚡ Scores auto-save instantly on input</span>
              </span>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* MOBILE-FIRST SCORE MANIPULATION CARDS (Phone View < md)             */}
        {/* =================================================================== */}
        <div className="md:hidden divide-y divide-slate-200" data-testid="mobile-score-cards">
          {filteredStudents.map((st, sIdx) => {
            const included = isSubjectIncluded(st.id);
            const rawTotal = getStudentRawTotal(st.id);
            const cum100 = included ? calculateCumulativePercentage(rawTotal, maxCa) : 0;
            const gradeObj = determineGrade(cum100, currentSection.levelType);
            const rec = getTermRecord(st.id);

            return (
              <div
                key={`mob-${st.id}`}
                className={`p-4 space-y-3 ${ledgerMode !== 'custom_report' && !included ? 'bg-slate-50/80 opacity-75' : 'bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold text-slate-400">#{sIdx + 1}</span>
                      <button
                        type="button"
                        onClick={() => setEditingStudent(st)}
                        className="font-black text-slate-900 text-sm hover:text-indigo-600 text-left"
                      >
                        {st.fullName}
                      </button>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">{st.admissionNumber}</div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {ledgerMode !== 'custom_report' && (
                      <button
                        type="button"
                        onClick={() => toggleSubjectInclusion(st.id, currentSubject.id, !included)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          included
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-200 text-slate-600 border-slate-300'
                        }`}
                      >
                        {included ? 'Included' : 'Excluded'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onViewReportCard(st.id)}
                      className="p-2 bg-indigo-50 text-indigo-700 rounded-lg"
                      title="Open Report Card"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {ledgerMode === 'custom_report' ? (
                  activeCustomTemplate ? (
                    (customRowsByStudent.get(st.id) || []).length ? (
                      <div className="space-y-3">
                        {(customRowsByStudent.get(st.id) || []).map(row => (
                          <section key={row.subject.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <h4 className="text-xs font-black uppercase text-slate-800">{row.subject.name}</h4>
                              <span className="text-[10px] font-bold text-slate-600">
                                {row.total.toFixed(1)} / {customReportTotalMax} · {row.percentage.toFixed(1)}% · {row.grade.grade}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {row.columnScores.map(({ column, score }) => {
                                const errorKey = `${st.id}-${row.subject.id}-${column.id}`;
                                const error = customScoreErrors[errorKey];
                                return (
                                  <label key={column.id} className="rounded-lg border border-slate-200 bg-white p-2">
                                    <span className="mb-1 block truncate text-[10px] font-bold text-slate-600">
                                      {column.header} <span className="text-slate-400">/{column.maxScore}</span>
                                    </span>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      step="0.1"
                                      min={0}
                                      max={column.maxScore}
                                      disabled={Boolean(st.isRecordSealed)}
                                      value={score}
                                      onChange={event => handleCustomReportScoreChange(
                                        st.id,
                                        row.subject.id,
                                        column.id,
                                        column.maxScore,
                                        event.target.value
                                      )}
                                      aria-label={`${st.fullName} ${row.subject.name} ${column.header}`}
                                      className={`w-full rounded-md border px-2 py-1.5 text-center font-mono text-sm font-bold ${
                                        error ? 'border-rose-500 bg-rose-50 text-rose-900' : 'border-slate-300'
                                      }`}
                                    />
                                    {error && <span className="mt-1 block text-[9px] font-bold text-rose-700">{error}</span>}
                                  </label>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                        This custom report has no selected subjects available for this class or your subject assignment.
                      </p>
                    )
                  ) : (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                      No custom report sheet is configured for this class. Create one in Settings → Custom Report Sheet.
                    </p>
                  )
                ) : ledgerMode === 'ca_grid' ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {activeComponents.map((comp) => {
                        const val = getScoreValue(st.id, comp.id);
                        const cellKey = `${st.id}-${comp.id}`;
                        const err = validationErrors[cellKey];
                        return (
                          <div key={comp.id} className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                              {comp.shortCode} <span className="text-slate-400">(/{comp.maxScore})</span>
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              min={0}
                              max={comp.maxScore}
                              disabled={!included}
                              value={val !== null ? val : ''}
                              onChange={(e) => handleScoreChange(st.id, comp.id, e.target.value)}
                              placeholder="-"
                              className={`w-full min-h-[40px] px-2.5 py-1.5 text-center font-mono font-bold rounded-lg border text-sm ${
                                err
                                  ? 'border-rose-500 bg-rose-50 text-rose-900'
                                  : val === null
                                  ? 'border-amber-300 bg-amber-50/40 text-slate-900'
                                  : 'border-slate-300 bg-white text-slate-900'
                              }`}
                            />
                            {err && <div className="text-[10px] text-rose-600 font-bold mt-0.5">{err}</div>}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between bg-indigo-50/70 px-3 py-2 rounded-xl border border-indigo-100 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">CA Total: </span>
                        <span className="font-mono font-black text-indigo-950">
                          {included ? `${rawTotal.toFixed(1)} / ${maxCa}` : 'EXCL'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Scaled: </span>
                        <span className="font-mono font-bold text-slate-900">
                          {included ? `${cum100.toFixed(1)}%` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="px-2 py-0.5 rounded-full font-black bg-white border border-indigo-200 text-indigo-900">
                          {included ? gradeObj.grade : 'EXCL'}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleOpenScoreModal(st, 'ca1')}
                      className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-950"
                    >
                      <div className="text-[10px] font-bold uppercase text-blue-600">CA 1 (/{maxCa})</div>
                      <div className="text-sm font-mono font-black mt-0.5">{rec.ca1Score.toFixed(1)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenScoreModal(st, 'ca2')}
                      className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950"
                    >
                      <div className="text-[10px] font-bold uppercase text-emerald-600">CA 2 (/{maxCa})</div>
                      <div className="text-sm font-mono font-black mt-0.5">{rec.ca2Score.toFixed(1)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenScoreModal(st, 'exam')}
                      className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-950"
                    >
                      <div className="text-[10px] font-bold uppercase text-purple-600">EXAM (/{maxExam})</div>
                      <div className="text-sm font-mono font-black mt-0.5">{rec.examScore.toFixed(1)}</div>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* =================================================================== */}
        {/* MODE 1: CONTINUOUS ASSESSMENT (CA1) SPREADSHEET GRID                */}
        {/* =================================================================== */}
        {ledgerMode === 'ca_grid' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 w-12 text-center">S/N</th>
                  <th className="py-3 px-3 w-32">
                    <button
                      type="button"
                      onClick={handleToggleAdmissionSort}
                      className="inline-flex items-center space-x-1 hover:text-indigo-700 cursor-pointer uppercase font-bold"
                      title="Click to sort by Admission Number"
                    >
                      <span>Adm. No</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="py-3 px-3 min-w-[200px]">
                    <button
                      type="button"
                      data-testid="ca-grid-sort-name-header"
                      onClick={handleToggleAlphabeticalSort}
                      className="inline-flex items-center space-x-1.5 hover:text-indigo-700 cursor-pointer uppercase font-bold"
                      title="Click to toggle alphabetical order (A–Z / Z–A)"
                    >
                      <span>Student Name (Click to Sort / Edit)</span>
                      {studentSortMode === 'AZ' ? (
                        <ArrowUpAZ className="w-3.5 h-3.5 text-indigo-600" />
                      ) : studentSortMode === 'ZA' ? (
                        <ArrowDownZA className="w-3.5 h-3.5 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </th>
                  {isSenior && (
                    <th className="py-3 px-2 w-24 text-center">Include</th>
                  )}
                  {activeComponents.map(comp => (
                    <th key={comp.id} className="py-3 px-2 w-28 text-center">
                      <div className="font-bold text-slate-900">{comp.name}</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        ({comp.shortCode} / {comp.maxScore})
                      </div>
                    </th>
                  ))}
                  <th className="py-3 px-3 w-24 text-center bg-indigo-50/50 text-indigo-950">
                    <div>TOTAL</div>
                    <div className="text-[10px] text-indigo-600">/{maxCa}</div>
                  </th>
                  <th className="py-3 px-3 w-28 text-center">
                    <div>CUM. 100</div>
                    <div className="text-[10px] text-slate-400">(SCALED %)</div>
                  </th>
                  <th className="py-3 px-3 w-20 text-center">Grade</th>
                  <th className="py-3 px-3 w-20 text-center">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((st, sIdx) => {
                  const included = isSubjectIncluded(st.id);
                  const rawTotal = getStudentRawTotal(st.id);
                  const cum100 = included ? calculateCumulativePercentage(rawTotal, maxCa) : 0;
                  const gradeObj = determineGrade(cum100, currentSection.levelType);

                  return (
                    <tr
                      key={st.id}
                      className={`transition-colors ${
                        !included ? 'bg-slate-50/60 opacity-60' : 'hover:bg-indigo-50/20'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-xs">
                        {sIdx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-600">
                        {st.admissionNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => setEditingStudent(st)}
                          className="font-bold text-slate-900 hover:text-indigo-600 hover:underline flex items-center space-x-1.5 text-left cursor-pointer"
                          title="Click to edit student name or details"
                        >
                          <span>{st.fullName}</span>
                          <Edit2 className="w-3 h-3 text-slate-400" />
                        </button>
                        <div className="text-[10px] text-slate-400">
                          {st.gender} • Attendance: {st.attendanceDays || 60}/{st.totalSchoolDays || 65}d
                        </div>
                      </td>

                      {/* Senior Subject Inclusion Toggle */}
                      {isSenior && (
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSubjectInclusion(st.id, currentSubject.id, !included)}
                            className={`inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                              included
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {included ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Yes</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" />
                                <span>No</span>
                              </>
                            )}
                          </button>
                        </td>
                      )}

                      {/* Component Score Inputs */}
                      {activeComponents.map((comp, cIdx) => {
                        const val = getScoreValue(st.id, comp.id);
                        const cellKey = `${st.id}-${comp.id}`;
                        const err = validationErrors[cellKey];

                        return (
                          <td key={comp.id} className="py-2 px-2 text-center">
                            <div className="relative flex flex-col items-center">
                              <input
                                ref={(el) => { inputRefs.current[cellKey] = el; }}
                                type="number"
                                step="0.1"
                                min={0}
                                max={comp.maxScore}
                                disabled={!included}
                                value={val !== null ? val : ''}
                                onChange={(e) => handleScoreChange(st.id, comp.id, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, sIdx, cIdx)}
                                className={`w-20 px-2 py-1.5 text-center font-mono font-bold rounded-lg border text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 ${
                                  err
                                    ? 'border-rose-500 bg-rose-50 text-rose-900 focus:ring-rose-500'
                                    : val === null
                                    ? 'border-amber-300 bg-amber-50/40 text-slate-900 focus:border-indigo-500 focus:ring-indigo-500/30'
                                    : 'border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-indigo-500/30'
                                }`}
                                placeholder="-"
                              />
                              {err && (
                                <span className="text-[9px] text-rose-600 font-bold mt-0.5 flex items-center">
                                  <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                  {err}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Raw Total */}
                      <td className="py-2.5 px-3 text-center font-mono font-black text-sm bg-indigo-50/40 text-indigo-950">
                        {included ? rawTotal.toFixed(1) : '-'}
                      </td>

                      {/* Scaled 100% */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-sm text-slate-800">
                        {included ? `${cum100.toFixed(1)}%` : '-'}
                      </td>

                      {/* Grade Pill */}
                      <td className="py-2.5 px-3 text-center">
                        {included ? (
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black border ${
                            gradeObj.grade.startsWith('A')
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : gradeObj.grade.startsWith('B')
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : gradeObj.grade.startsWith('C')
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}>
                            {gradeObj.grade}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">EXCL</span>
                        )}
                      </td>

                      {/* View Report Card */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onViewReportCard(st.id)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Open Student Report Sheet"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {ledgerMode === 'custom_report' && (
          !activeCustomTemplate ? (
            <div className="p-6 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-amber-500" />
              <h3 className="mt-2 text-sm font-black text-slate-900">No custom report sheet for this class</h3>
              <p className="mt-1 text-xs text-slate-600">
                Create a sheet in Settings → Custom Report Sheet, assign it to this class, and select its subjects.
              </p>
            </div>
          ) : !customReportSubjects.length ? (
            <div className="p-6 text-center text-xs font-semibold text-amber-900" role="status">
              This report has no selected subjects available for this class or your subject assignment.
            </div>
          ) : (
            <div className="hidden md:block overflow-x-auto" data-testid="custom-report-score-grid">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-amber-50 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                    <th className="w-12 px-3 py-3 text-center">S/N</th>
                    <th className="px-3 py-3">Adm. No</th>
                    <th className="min-w-[180px] px-3 py-3">Student</th>
                    <th className="min-w-[130px] px-3 py-3">Subject</th>
                    {activeCustomTemplate.columns.map(column => (
                      <th key={column.id} className="min-w-[120px] px-2 py-3 text-center">
                        <div>{column.header}</div>
                        <div className="font-normal text-slate-500">Max {column.maxScore}</div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center">Total</th>
                    <th className="px-3 py-3 text-center">Score %</th>
                    <th className="px-3 py-3 text-center">Grade</th>
                    <th className="px-3 py-3 text-center">Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customReportRows.flatMap((studentRow, studentIndex) =>
                    studentRow.subjects.map((row, subjectIndex) => (
                      <tr
                        key={`${studentRow.student.id}-${row.subject.id}`}
                        className="hover:bg-amber-50/40"
                      >
                        <td className="px-3 py-2 text-center font-mono text-slate-400">
                          {subjectIndex === 0 ? studentIndex + 1 : ''}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">
                          {subjectIndex === 0 ? studentRow.student.admissionNumber : ''}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {subjectIndex === 0 ? studentRow.student.fullName : ''}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-700">{row.subject.name}</td>
                        {row.columnScores.map(({ column, score }) => {
                          const errorKey = `${studentRow.student.id}-${row.subject.id}-${column.id}`;
                          const error = customScoreErrors[errorKey];
                          return (
                            <td key={column.id} className="px-2 py-2 text-center">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.1"
                                min={0}
                                max={column.maxScore}
                                disabled={Boolean(studentRow.student.isRecordSealed)}
                                value={score}
                                onChange={event => handleCustomReportScoreChange(
                                  studentRow.student.id,
                                  row.subject.id,
                                  column.id,
                                  column.maxScore,
                                  event.target.value
                                )}
                                aria-label={`${studentRow.student.fullName} ${row.subject.name} ${column.header}`}
                                className={`w-20 rounded-lg border px-2 py-1.5 text-center font-mono font-bold ${
                                  error
                                    ? 'border-rose-500 bg-rose-50 text-rose-900'
                                    : 'border-slate-300 bg-white'
                                }`}
                              />
                              {error && <div className="mt-1 text-[9px] font-bold text-rose-700">{error}</div>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center font-mono font-black text-indigo-900">
                          {row.total.toFixed(1)} / {customReportTotalMax}
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-semibold">
                          {row.percentage.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-center font-black">{row.grade.grade}</td>
                        <td className="px-3 py-2 text-center">
                          {subjectIndex === 0 && (
                            <button
                              type="button"
                              onClick={() => onViewReportCard(studentRow.student.id)}
                              title="Open student report"
                              className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* =================================================================== */}
        {/* MODE 2: FULL TERM EXAM REGISTRY (CA1 + CA2 + EXAM = 100)            */}
        {/* =================================================================== */}
        {ledgerMode === 'term_registry' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 w-12 text-center border-r border-slate-200">S/N</th>
                  <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 w-28 border-r border-slate-200">
                    <button
                      type="button"
                      onClick={handleToggleAdmissionSort}
                      className="inline-flex items-center space-x-1 hover:text-indigo-700 cursor-pointer uppercase font-bold"
                      title="Click to sort by Admission Number"
                    >
                      <span>Adm. No</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 border-r border-slate-200">
                    <button
                      type="button"
                      data-testid="registry-sort-name-header"
                      onClick={handleToggleAlphabeticalSort}
                      className="inline-flex items-center space-x-1.5 hover:text-indigo-700 cursor-pointer uppercase font-bold"
                      title="Click to toggle alphabetical order (A–Z / Z–A)"
                    >
                      <span>Student Name (Click to Sort / Edit)</span>
                      {studentSortMode === 'AZ' ? (
                        <ArrowUpAZ className="w-3.5 h-3.5 text-indigo-600" />
                      ) : studentSortMode === 'ZA' ? (
                        <ArrowDownZA className="w-3.5 h-3.5 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </th>

                  <th colSpan={showDetailedColumns ? (isSenior ? 5 : 6) : 1} className="py-2 px-3 text-center bg-blue-50/80 border-r border-slate-200">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-blue-900 font-bold">FIRST CA ({maxCaDivided})</span>
                      <span className="text-[10px] text-blue-600 font-normal">
                        (Total {maxCa} ÷ 2 = {maxCaDivided})
                      </span>
                    </div>
                  </th>

                  <th colSpan={showDetailedColumns ? (isSenior ? 5 : 6) : 1} className="py-2 px-3 text-center bg-emerald-50/80 border-r border-slate-200">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-emerald-900 font-bold">SECOND CA ({maxCaDivided})</span>
                      <span className="text-[10px] text-emerald-600 font-normal">
                        (Total {maxCa} ÷ 2 = {maxCaDivided})
                      </span>
                    </div>
                  </th>

                  <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 text-center w-28 bg-purple-50/80 border-r border-slate-200">
                    <div className="flex flex-col items-center">
                      <span className="text-purple-900 font-bold">EXAM ({maxExam})</span>
                      <span className="text-[10px] text-purple-600 font-normal">(Max {maxExam})</span>
                    </div>
                  </th>

                  <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 text-center w-28 bg-indigo-50 font-black text-indigo-950 border-r border-slate-200">
                    <div className="flex flex-col items-center">
                      <span>TERM TOTAL (100)</span>
                      <span className="text-[10px] text-indigo-600 font-normal">
                        ({maxCaDivided}+{maxCaDivided}+{maxExam})
                      </span>
                    </div>
                  </th>

                  <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 text-center w-20 border-r border-slate-200">Grade</th>
                  <th rowSpan={showDetailedColumns ? 2 : 1} className="py-3 px-3 text-center w-24">Report</th>
                </tr>

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
                  const rec = getTermRecord(st.id);
                  const gridScoresByCode: Record<string, number | null> = {};
                  activeComponents.forEach(comp => {
                    gridScoresByCode[comp.shortCode.toUpperCase()] = getScoreValue(st.id, comp.id);
                  });

                  const ca1Resolved = resolveExpandedCaComponentScores({
                    caType: 'ca1',
                    levelType: currentSection.levelType,
                    storedDetails: rec.ca1Details,
                    gridScoresByCode,
                    rawCaScore: rec.ca1RawScore,
                    scaledCaScore: rec.ca1Score
                  });

                  const ca2Resolved = resolveExpandedCaComponentScores({
                    caType: 'ca2',
                    levelType: currentSection.levelType,
                    storedDetails: rec.ca2Details,
                    rawCaScore: rec.ca2RawScore,
                    scaledCaScore: rec.ca2Score
                  });

                  const formatSubScore = (val: number | null | undefined): string => {
                    if (val === null || val === undefined) return '-';
                    return Number.isInteger(val) ? String(val) : val.toFixed(1);
                  };

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-xs border-r border-slate-100">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-600 border-r border-slate-100">
                        {st.admissionNumber}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-100">
                        <button
                          type="button"
                          onClick={() => setEditingStudent(st)}
                          className="font-bold text-slate-900 hover:text-indigo-600 hover:underline flex items-center space-x-1.5 cursor-pointer text-left"
                        >
                          <span>{st.fullName}</span>
                          <Edit2 className="w-3 h-3 text-slate-400" />
                        </button>
                        <div className="text-[10px] text-slate-400">{st.gender}</div>
                      </td>

                      {/* CA 1 */}
                      {showDetailedColumns ? (
                        <>
                          <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{formatSubScore(ca1Resolved.cw)}</td>
                          <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{formatSubScore(isSenior ? ca1Resolved.ass : ca1Resolved.qz)}</td>
                          <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{formatSubScore(isSenior ? ca1Resolved.qz : ca1Resolved.ass)}</td>
                          {!isSenior && <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{formatSubScore(ca1Resolved.pj)}</td>}
                          <td className="py-2 px-1 text-center font-mono text-xs bg-blue-50/20">{formatSubScore(ca1Resolved.test)}</td>
                          <td className="py-2 px-2 text-center bg-blue-50/50 font-bold font-mono text-blue-900 border-r border-slate-100">
                            <div className="flex items-center justify-center space-x-1">
                              <span>{rec.ca1Score.toFixed(1)}</span>
                              <button
                                type="button"
                                onClick={() => handleOpenScoreModal(st, 'ca1')}
                                className="p-0.5 text-blue-600 hover:text-blue-800 rounded cursor-pointer"
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
                              title="Record / Edit CA 1 Breakdown"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}

                      {/* CA 2 */}
                      {showDetailedColumns ? (
                        <>
                          <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{formatSubScore(ca2Resolved.cw)}</td>
                          <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{formatSubScore(isSenior ? ca2Resolved.ass : ca2Resolved.qz)}</td>
                          <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{formatSubScore(isSenior ? ca2Resolved.qz : ca2Resolved.ass)}</td>
                          {!isSenior && <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{formatSubScore(ca2Resolved.pj)}</td>}
                          <td className="py-2 px-1 text-center font-mono text-xs bg-emerald-50/20">{formatSubScore(ca2Resolved.test)}</td>
                          <td className="py-2 px-2 text-center bg-emerald-50/50 font-bold font-mono text-emerald-900 border-r border-slate-100">
                            <div className="flex items-center justify-center space-x-1">
                              <span>{rec.ca2Score.toFixed(1)}</span>
                              <button
                                type="button"
                                onClick={() => handleOpenScoreModal(st, 'ca2')}
                                className="p-0.5 text-emerald-600 hover:text-emerald-800 rounded cursor-pointer"
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
                              title="Record / Edit CA 2 Breakdown"
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

                      {/* Grade */}
                      <td className="py-2.5 px-3 text-center border-r border-slate-100">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black border ${
                          rec.grade.startsWith('A')
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : rec.grade.startsWith('B')
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : rec.grade.startsWith('C')
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}>
                          {rec.grade}
                        </span>
                      </td>

                      {/* Report Action */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onViewReportCard(st.id)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Report</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sub-Score Breakdown Modal */}
      {subScoreModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  {subScoreModal.caType === 'exam'
                    ? 'Examination Score Entry'
                    : `${subScoreModal.caType.toUpperCase()} Component Breakdown`}
                </div>
                <h3 className="text-base font-bold text-white">{subScoreModal.student.fullName}</h3>
                <p className="text-xs text-slate-300 font-semibold">
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
                    placeholder="—"
                    value={modalExam}
                    onChange={(e) => setModalExam(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-lg font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Classwork (CW)</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={isSenior ? 2 : 5}
                        placeholder="—"
                        value={modalCw}
                        onChange={(e) => setModalCw(e.target.value)}
                        className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-slate-400">/ {isSenior ? 2 : 5}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Assignment (ASS)</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={5}
                        placeholder="—"
                        value={modalAss}
                        onChange={(e) => setModalAss(e.target.value)}
                        className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-slate-400">/ 5</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Quiz (QZ)</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={isSenior ? 3 : 5}
                        placeholder="—"
                        value={modalQz}
                        onChange={(e) => setModalQz(e.target.value)}
                        className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-slate-400">/ {isSenior ? 3 : 5}</span>
                    </div>
                  </div>

                  {!isSenior && (
                    <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-700">Project (PJ)</span>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={5}
                          placeholder="—"
                          value={modalPj}
                          onChange={(e) => setModalPj(e.target.value)}
                          className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                        />
                        <span className="text-xs text-slate-400">/ 5</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Test (TEST)</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={20}
                        placeholder="—"
                        value={modalTest}
                        onChange={(e) => setModalTest(e.target.value)}
                        className="w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-slate-400">/ 20</span>
                    </div>
                  </div>

                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1 text-indigo-950">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">Raw Component Total:</span>
                      <span className="font-mono font-bold">
                        {modalCalculatedCaTotal} / {maxCa}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-indigo-200">
                      <span className="text-xs font-bold">
                        Term {subScoreModal.caType.toUpperCase()} Score (Total ÷ 2):
                      </span>
                      <span className="text-lg font-black font-mono text-indigo-700">
                        {divideRawCaByTwo(modalCalculatedCaTotal, currentSection.levelType)} / {maxCaDivided}
                      </span>
                    </div>
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
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  Save &amp; Commit Score
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import / Export Modal */}
      {isCsvCredentialModalOpen && currentRole === 'SUPER_ADMIN' && (
        <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleVerifyCsvAccess}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-lg font-black text-slate-900">Confirm Super Admin</h2>
              <p className="mt-1 text-sm text-slate-500">
                Re-enter Super Admin credentials to access bulk CSV import and export.
              </p>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Super Admin username
              <input
                autoComplete="username"
                value={csvCredentialUsername}
                onChange={event => setCsvCredentialUsername(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Password or initial PIN
              <input
                type="password"
                autoComplete="current-password"
                value={csvCredential}
                onChange={event => setCsvCredential(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            {csvCredentialError && (
              <p role="alert" className="text-xs font-semibold text-rose-700">
                {csvCredentialError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCsvCredentialModalOpen(false);
                  setCsvCredential('');
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isVerifyingCsvCredential}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {isVerifyingCsvCredential ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </div>
          </form>
        </div>
      )}
      {isCsvModalOpen && (
        <CsvImportExportModal
          section={currentSection}
          subject={currentSubject}
          students={sectionStudents}
          components={activeComponents}
          onClose={() => setIsCsvModalOpen(false)}
        />
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
