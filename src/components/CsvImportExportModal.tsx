/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { ClassSection, Subject, Student, AssessmentComponent } from '../types/index';
import { useApp } from '../context/AppContext';
import {
  parseBulkCsvWithSubjectInclusion,
  buildCsvImportedSubject,
  findCsvSubjectMatch,
  normalizeCsvSubjectLabel,
  analyzeCsvEnrollmentRequirements,
  ParsedCsvStudentGroup,
  CsvEnrollmentAnalysis
} from '../utils/rbacAndAuth';
import {
  X,
  Download,
  Upload,
  Check,
  AlertCircle,
  FileText,
  CheckCircle2,
  XCircle,
  UserPlus,
  Users
} from 'lucide-react';

interface CsvImportExportModalProps {
  section: ClassSection;
  subject: Subject;
  students: Student[];
  components: AssessmentComponent[];
  onClose: () => void;
}

export const CsvImportExportModal: React.FC<CsvImportExportModalProps> = ({
  section,
  subject,
  students,
  components,
  onClose
}) => {
  const {
    scores,
    enrollments,
    updateScore,
    toggleSubjectInclusion,
    addStudent,
    addSubject,
    syncToBackend,
    subjects
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  const syncToBackendRef = useRef(syncToBackend);
  onCloseRef.current = onClose;
  syncToBackendRef.current = syncToBackend;
  const [pendingImportSave, setPendingImportSave] = useState<{
    studentSummary: string;
    savedScoreCount: number;
    scoreErrors: string[];
  } | null>(null);
  const [lastImportSave, setLastImportSave] = useState<{
    studentSummary: string;
    savedScoreCount: number;
    scoreErrors: string[];
  } | null>(null);
  const [isImportSaving, setIsImportSaving] = useState(false);
  const [hasDatabaseSaveError, setHasDatabaseSaveError] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [defaultIncludeSelectedSubject, setDefaultIncludeSelectedSubject] = useState<boolean>(true);
  const [parsedGroups, setParsedGroups] = useState<ParsedCsvStudentGroup[]>([]);
  const [enrollmentAnalysis, setEnrollmentAnalysis] = useState<CsvEnrollmentAnalysis | null>(null);
  const [isEnrollmentModalOpen, setIsEnrollmentModalOpen] = useState(false);
  const [conflictQueue, setConflictQueue] = useState<ParsedCsvStudentGroup[]>([]);
  const [currentConflictIndex, setCurrentConflictIndex] = useState<number>(0);
  const [isProcessingConflicts, setIsProcessingConflicts] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [hasImportErrors, setHasImportErrors] = useState(false);

  useEffect(() => {
    if (!pendingImportSave) return;

    let cancelled = false;
    setIsImportSaving(true);
    void syncToBackendRef.current().then(result => {
      if (cancelled) return;

      const scoreErrorSummary = pendingImportSave.scoreErrors.length > 0
        ? ` ${pendingImportSave.scoreErrors.length} score(s) were rejected: ${pendingImportSave.scoreErrors.slice(0, 3).join('; ')}${pendingImportSave.scoreErrors.length > 3 ? `; and ${pendingImportSave.scoreErrors.length - 3} more` : ''}.`
        : '';
      const saveSummary = result.savedToMySql
        ? `Saved ${pendingImportSave.savedScoreCount} score(s) to MySQL and local backup files.`
        : `Database save failed: ${result.message}${result.savedToNodeDisk ? ' The local backup file was saved.' : ''}`;

      setIsImportSaving(false);
      setHasDatabaseSaveError(!result.savedToMySql);
      setHasImportErrors(!result.savedToMySql || pendingImportSave.scoreErrors.length > 0);
      setImportNotice(`${pendingImportSave.studentSummary} ${saveSummary}${scoreErrorSummary}`);
      setPendingImportSave(null);

      if (result.savedToMySql && pendingImportSave.scoreErrors.length === 0) {
        setTimeout(() => onCloseRef.current(), 1500);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pendingImportSave]);

  // Export CSV for active subject including `Include (include=true/false)` column
  const handleExportCsv = () => {
    const headers = [
      'Student Name',
      'Admission Number',
      'Subject',
      'Include (true/false)',
      ...components.map(c => `${c.shortCode} (Max ${c.maxScore})`)
    ];
    const rows: string[] = [headers.join(',')];

    students.forEach(st => {
      const enr = enrollments.find(
        e => e.studentId === st.id && e.subjectId === subject.id && e.sectionId === section.id
      );
      const isIncluded =
        section.levelType === 'JUNIOR' ? true : enr !== undefined ? enr.isIncluded : true;

      const rowVals: string[] = [
        `"${st.fullName}"`,
        `"${st.admissionNumber}"`,
        `"${subject.name}"`,
        `include=${isIncluded ? 'true' : 'false'}`
      ];

      components.forEach(comp => {
        const scoreObj = scores.find(
          s => s.studentId === st.id && s.subjectId === subject.id && s.componentId === comp.id
        );
        rowVals.push(
          scoreObj !== undefined && scoreObj.score !== null ? String(scoreObj.score) : ''
        );
      });

      rows.push(rowVals.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute(
      'download',
      `${section.name.replace(/\s+/g, '_')}_${subject.name.replace(/\s+/g, '_')}_Scores.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download Multi-Subject CSV Template with `Include` (`include=true/false`) column
  const handleDownloadTemplate = () => {
    const headers = [
      'Student Name',
      'Admission Number',
      'Subject',
      'Include',
      ...components.map(c => c.shortCode)
    ];
    const sampleRows = [
      headers.join(','),
      `"Sample Student One","STU-2026-0401","${subject.name}",include=true,${components.map(c => Math.min(c.maxScore, 4)).join(',')}`,
      `"Sample Student One","STU-2026-0401","MATHEMATICS",include=true,${components.map(c => Math.min(c.maxScore, 4.5)).join(',')}`,
      `"Sample Student Two","STU-2026-0402","${subject.name}",include=true,${components.map(c => Math.min(c.maxScore, 4)).join(',')}`
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(sampleRows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `EduGrade_Bulk_Import_With_Include_Template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Load sample rows for active subject with include=true/false directly into textarea
  const handleLoadActiveSubjectSample = () => {
    const headers = ['Student Name', 'Admission Number', 'Subject', 'Include', ...components.map(c => c.shortCode)];
    const sampleStudents = students.slice(0, 3);
    const lines = [
      headers.join(','),
      ...sampleStudents.map((st, idx) => {
        const incFlag = idx === 2 && section.levelType === 'SENIOR' ? 'include=false' : 'include=true';
        return `"${st.fullName}","${st.admissionNumber}","${subject.name}",${incFlag},${components.map(c => Math.min(c.maxScore, 4)).join(',')}`;
      })
    ];
    setCsvText(lines.join('\n'));
  };

  // Load full class CSV + 2 extra unregistered students (triggers Unregistered Student Enrollment Modal)
  const handleLoadExtraStudentsSample = () => {
    const headers = ['Student Name', 'Admission Number', 'Subject', 'Include', ...components.map(c => c.shortCode)];
    const registeredRows = students.map((st, idx) => {
      const incFlag = 'include=true';
      const scoresList = components.map(c =>
        c.shortCode.toUpperCase() === 'TEST'
          ? Math.min(c.maxScore, 14 + (idx % 6))
          : Math.min(c.maxScore, 3 + (idx % 3))
      );
      return `"${st.fullName}","${st.admissionNumber}","${subject.name}",${incFlag},${scoresList.join(',')}`;
    });

    const extraRows = [
      `"Sample Student One","STU-2026-9901","${subject.name}",include=true,${components
        .map(c => (c.shortCode.toUpperCase() === 'TEST' ? Math.min(c.maxScore, 18) : Math.min(c.maxScore, 4.5)))
        .join(',')}`,
      `"Sample Student Two","STU-2026-9902","${subject.name}",include=true,${components
        .map(c => (c.shortCode.toUpperCase() === 'TEST' ? Math.min(c.maxScore, 17) : Math.min(c.maxScore, 4)))
        .join(',')}`
    ];

    setCsvText([headers.join(','), ...registeredRows, ...extraRows].join('\n'));
  };

  // Handle uploading a .csv file from computer
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  // Parse CSV grouping repeated student names across multiple subjects with `include=true/false`
  // Automatically detects if CSV has more students than registered in the class or unregistered students
  const handleParseCsv = () => {
    if (!csvText.trim()) return;

    const groups = parseBulkCsvWithSubjectInclusion({
      csvText,
      students,
      subjects,
      defaultSubject: subject,
      components,
      defaultInclude: defaultIncludeSelectedSubject,
      levelType: section.levelType
    });

    setParsedGroups(groups);

    const analysis = analyzeCsvEnrollmentRequirements(groups, students);
    setEnrollmentAnalysis(analysis);

    if (analysis.requiresEnrollmentModal) {
      setIsEnrollmentModalOpen(true);
      setIsProcessingConflicts(false);
      setConflictQueue([]);
      return;
    }

    const conflicts = groups.filter(g => g.isExisting);
    if (conflicts.length > 0) {
      setConflictQueue(conflicts);
      setCurrentConflictIndex(0);
      setIsProcessingConflicts(true);
    } else {
      setConflictQueue([]);
      setIsProcessingConflicts(false);
    }
  };

  // Update an unregistered student's details or enroll decision inside the Enrollment Identification Modal
  const handleUpdateUnregisteredCandidate = (
    groupIndex: number,
    updates: Partial<Pick<ParsedCsvStudentGroup, 'name' | 'admissionNumber' | 'gender' | 'enrollConfirmed' | 'decision'>>
  ) => {
    setParsedGroups(prev =>
      prev.map((g, idx) => {
        if (idx !== groupIndex) return g;
        const nextEnroll =
          updates.enrollConfirmed !== undefined ? updates.enrollConfirmed : g.enrollConfirmed;
        return {
          ...g,
          ...updates,
          enrollConfirmed: nextEnroll,
          decision: nextEnroll ? 'NEW' : 'SKIP'
        };
      })
    );
  };

  // Toggle `isIncluded` for a specific parsed student-subject row in the preview
  const handleTogglePreviewSubjectInclusion = (groupIdx: number, subScoreIdx: number) => {
    setParsedGroups(prev =>
      prev.map((g, gIdx) => {
        if (gIdx !== groupIdx) return g;
        return {
          ...g,
          subjectScores: g.subjectScores.map((s, sIdx) =>
            sIdx === subScoreIdx ? { ...s, isIncluded: !s.isIncluded } : s
          )
        };
      })
    );
  };

  // Conflict modal decisions
  const handleConflictDecision = (decision: 'OVERWRITE' | 'NEW' | 'SKIP') => {
    const current = conflictQueue[currentConflictIndex];
    if (!current) return;

    setParsedGroups(prev =>
      prev.map(g =>
        g.name === current.name && g.admissionNumber === current.admissionNumber
          ? { ...g, decision }
          : g
      )
    );

    if (currentConflictIndex < conflictQueue.length - 1) {
      setCurrentConflictIndex(prev => prev + 1);
    } else {
      setIsProcessingConflicts(false);
    }
  };

  // Execute the import for a given list of parsed groups
  const executeImportForGroups = (groupsToCommit: ParsedCsvStudentGroup[]) => {
    let newlyEnrolledCount = 0;
    let updatedExistingCount = 0;
    const createdSubjectNames: string[] = [];
    let savedScoreCount = 0;
    const scoreErrors: string[] = [];

    const subjectCatalog = [...subjects];
    const subjectsByName = new Map(
      subjectCatalog
        .filter(item =>
          !item.applicableLevel ||
          item.applicableLevel === 'BOTH' ||
          item.applicableLevel === section.levelType
        )
        .map(item => [normalizeCsvSubjectLabel(item.name), item])
    );
    const resolveSubjectId = (subjectName: string, subjectId: number): number => {
      if (subjectId !== 0) return subjectId;
      const normalizedName = normalizeCsvSubjectLabel(subjectName);
      const existing = subjectsByName.get(normalizedName) ||
        findCsvSubjectMatch(subjectName, subjectCatalog, section.levelType);
      if (existing) {
        subjectsByName.set(normalizedName, existing);
        return existing.id;
      }

      const createdData = buildCsvImportedSubject(subjectName, section.levelType, subjectCatalog);
      const created = addSubject(createdData);
      subjectCatalog.push(created);
      subjectsByName.set(normalizedName, created);
      createdSubjectNames.push(created.name);
      return created.id;
    };

    groupsToCommit.forEach(group => {
      if (group.decision === 'SKIP' || (!group.isExisting && group.enrollConfirmed === false)) {
        return;
      }

      let targetStudentId: number;
      let enrollmentIdsBySubject = new Map<number, number>();

      if (group.decision === 'NEW' || !group.existingStudent) {
        const newSt = addStudent({
          fullName: group.name.trim(),
          admissionNumber:
            group.admissionNumber.trim() || `STU-2026-${Math.floor(1000 + Math.random() * 9000)}`,
          currentSectionId: section.id,
          gender: group.gender || 'MALE',
          attendanceDays: 60,
          totalSchoolDays: 65
        }, createdEnrollments => {
          enrollmentIdsBySubject = new Map(
            createdEnrollments.map(enrollment => [enrollment.subjectId, enrollment.id])
          );
        });
        targetStudentId = newSt.id;
        newlyEnrolledCount++;
      } else {
        targetStudentId = group.existingStudent.id;
        updatedExistingCount++;
      }

      // Apply subject inclusion (`include=true/false`) and component scores
      // If a component score was not added in the CSV, leave it blank (do NOT add 0)
      group.subjectScores.forEach(subScore => {
        const targetSubjectId = resolveSubjectId(subScore.subjectName, subScore.subjectId);
        const included = section.levelType === 'JUNIOR' ? true : subScore.isIncluded;
        const enrollmentId = toggleSubjectInclusion(
          targetStudentId,
          targetSubjectId,
          included,
          enrollmentIdsBySubject.get(targetSubjectId)
        );
        enrollmentIdsBySubject.set(targetSubjectId, enrollmentId);

        Object.entries(subScore.scores).forEach(([compId, scoreVal]) => {
          if (scoreVal !== undefined && scoreVal !== null && !Number.isNaN(Number(scoreVal))) {
            const result = updateScore(
              targetStudentId,
              targetSubjectId,
              Number(compId),
              Number(scoreVal),
              `Bulk CSV Import (include=${included})`,
              enrollmentId
            );
            if (result.success) {
              savedScoreCount++;
            } else {
              scoreErrors.push(`${group.name}: ${result.error || 'score update was rejected'}`);
            }
          }
        });
      });
    });

    setIsEnrollmentModalOpen(false);
    setHasImportErrors(scoreErrors.length > 0);
    const studentSummary = newlyEnrolledCount > 0
      ? `Enrolled ${newlyEnrolledCount} new student(s) and updated ${updatedExistingCount} registered student(s) in ${section.name}.`
      : `Updated ${updatedExistingCount} registered student(s) in ${section.name}.`;
    const subjectSummary = createdSubjectNames.length > 0
      ? ` Added ${createdSubjectNames.length} subject(s): ${createdSubjectNames.join(', ')}.`
      : '';
    const importSave = { studentSummary: `${studentSummary}${subjectSummary}`, savedScoreCount, scoreErrors };
    setLastImportSave(importSave);
    setHasDatabaseSaveError(false);
    setImportNotice(null);
    setPendingImportSave(importSave);
  };

  // Commit Import (Updates both `toggleSubjectInclusion` and `updateScore` for each student & subject)
  const handleCommitImport = () => {
    executeImportForGroups(parsedGroups);
  };

  // Confirm Enrollment directly from the Unregistered Student Identification Modal
  const handleConfirmEnrollAndImport = () => {
    executeImportForGroups(parsedGroups);
  };

  // Skip all unregistered students and import only already-registered students
  const handleSkipUnregisteredAndImport = () => {
    const onlyRegistered = parsedGroups.map(g =>
      g.isExisting ? g : { ...g, enrollConfirmed: false, decision: 'SKIP' as const }
    );
    setParsedGroups(onlyRegistered);
    executeImportForGroups(onlyRegistered);
  };

  const currentConflict = conflictQueue[currentConflictIndex];
  const unregisteredIndices = parsedGroups
    .map((g, idx) => (!g.isExisting ? idx : -1))
    .filter(idx => idx !== -1);
  const unconfiguredSubjectNames = Array.from(new Set(
    parsedGroups.flatMap(group =>
      group.subjectScores
        .filter(subjectScore => subjectScore.subjectId === 0)
        .map(subjectScore => subjectScore.subjectName)
    )
  ));

  return (
    <div
      data-testid="csv-import-export-modal"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden relative">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              <span>Bulk CSV Import &amp; Export (with Student Enrollment &amp; Subject Include=true/false)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {section.name} ({students.length} Registered Students) • Active Subject:{' '}
              <strong>{subject.name}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImportSaving}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Quick Export, File Upload & Template Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center justify-center space-x-1.5 p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-semibold text-indigo-800 hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Export {subject.code} (.csv)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center justify-center space-x-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Download CSV Template</span>
            </button>

            <button
              type="button"
              data-testid="csv-load-sample-btn"
              onClick={handleLoadActiveSubjectSample}
              className="flex items-center justify-center space-x-1.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Load {subject.code} Sample</span>
            </button>

            <button
              type="button"
              data-testid="csv-load-extra-student-sample-btn"
              onClick={handleLoadExtraStudentsSample}
              className="flex items-center justify-center space-x-1.5 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Sample + Extra Students</span>
            </button>
          </div>

          {/* Default Subject Inclusion Setting for Selected Subject */}
          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-bold text-indigo-950 block">
                Selected Subject Inclusion ({subject.name})
              </span>
              <span className="text-[11px] text-indigo-700">
                Use <code className="font-mono font-bold">include=true</code> or{' '}
                <code className="font-mono font-bold">include=false</code> in Column 4, or set the default below:
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileUpload}
                className="hidden"
              />
              <button
                type="button"
                data-testid="csv-upload-file-btn"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-bold cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload .CSV File</span>
              </button>
              <label className="inline-flex items-center space-x-2 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 cursor-pointer shrink-0 font-bold text-slate-800">
                <input
                  type="checkbox"
                  data-testid="csv-default-include-checkbox"
                  checked={defaultIncludeSelectedSubject}
                  onChange={e => setDefaultIncludeSelectedSubject(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>
                  Default: include={defaultIncludeSelectedSubject ? 'true' : 'false'}
                </span>
              </label>
            </div>
          </div>

          {/* Paste CSV Section */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Paste or Upload CSV Data (Detects Unregistered / Extra Students Automatically)
              </label>
              <span className="text-[11px] font-mono text-slate-500">
                Cols: Name, AdmNo, Subject, Include (true/false), {components.map(c => c.shortCode).join(', ')}
              </span>
            </div>
            <textarea
              data-testid="csv-textarea-input"
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`Student Name,Admission Number,Subject,Include,${components.map(c => c.shortCode).join(',')}\n"Sample Student One","STU-2026-0401","${subject.name}",include=true,${components.map(() => '4.0').join(',')}\n"Sample Student Two","STU-2026-0402","${subject.name}",include=false,${components.map(() => '0.0').join(',')}`}
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              data-testid="csv-parse-button"
              onClick={handleParseCsv}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Parse CSV, Identify Unregistered Students &amp; Verify Subject Inclusion
            </button>
          </div>

          {/* Conflict Resolver Modal Prompt */}
          {isProcessingConflicts && currentConflict && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Existing Student Found ({currentConflictIndex + 1} of {conflictQueue.length})</span>
              </div>

              <div className="p-3 bg-white border border-amber-200 rounded-lg text-xs space-y-2">
                <div className="flex justify-between font-bold text-slate-900 border-b pb-1">
                  <span>Student Name: {currentConflict.name}</span>
                  <span className="text-indigo-600 font-mono">{currentConflict.admissionNumber}</span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  Existing Record in System:{' '}
                  <span className="font-semibold">
                    {currentConflict.existingStudent?.fullName} ({currentConflict.existingStudent?.admissionNumber})
                  </span>
                </div>
                <div className="text-slate-500 text-[11px]">
                  Incoming CSV includes{' '}
                  <span className="font-bold text-slate-800">{currentConflict.subjectScores.length} subject(s)</span>:
                  <div className="font-mono text-[10px] mt-1 text-slate-700 space-y-0.5">
                    {currentConflict.subjectScores.map((s, i) => (
                      <div key={i}>
                        • {s.subjectName} — <strong>include={String(s.isIncluded)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  data-testid="csv-conflict-overwrite-btn"
                  onClick={() => handleConflictDecision('OVERWRITE')}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Overwrite Existing Student
                </button>
                <button
                  type="button"
                  onClick={() => handleConflictDecision('NEW')}
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Save as New Student
                </button>
                <button
                  type="button"
                  onClick={() => handleConflictDecision('SKIP')}
                  className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* Grouped Preview with Interactive Include=true/false toggles */}
          {parsedGroups.length > 0 && !isProcessingConflicts && (
            <div
              data-testid="csv-parsed-preview"
              className="p-4 rounded-xl border space-y-3 bg-slate-50 border-slate-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-800">
                <span>
                  Unique Students in CSV: {parsedGroups.length} (Class Registered: {students.length})
                </span>
                <div className="flex items-center gap-2">
                  {unregisteredIndices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsEnrollmentModalOpen(true)}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[11px] font-black cursor-pointer"
                    >
                      Review Unregistered Students ({unregisteredIndices.length})
                    </button>
                  )}
                  <span className="text-indigo-600">
                    Total Subject Rows:{' '}
                    {parsedGroups.reduce((acc, g) => acc + g.subjectScores.length, 0)}
                  </span>
                </div>
              </div>
              {unconfiguredSubjectNames.length > 0 && (
                <div
                  data-testid="csv-unconfigured-subjects-notice"
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-950"
                >
                  CSV subject(s) not yet configured for {section.levelType.toLowerCase()} classes will be
                  added automatically when you import: <strong>{unconfiguredSubjectNames.join(', ')}</strong>.
                  {section.levelType === 'JUNIOR' && ' They will be created as Core subjects and included for every student.'}
                </div>
              )}

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100 text-xs">
                {parsedGroups.map((group, gIdx) => (
                  <div key={gIdx} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900">
                        {group.name}{' '}
                        <span className="font-mono text-[11px] text-slate-400">
                          ({group.admissionNumber})
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          group.decision === 'OVERWRITE'
                            ? 'bg-indigo-100 text-indigo-800'
                            : group.decision === 'NEW'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {group.isExisting
                          ? 'REGISTERED • UPDATE SCORES'
                          : group.enrollConfirmed !== false
                          ? 'NEW • ENROLL WITH SCORES'
                          : 'SKIP'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {group.subjectScores.map((subScore, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => handleTogglePreviewSubjectInclusion(gIdx, sIdx)}
                          title="Click to toggle include=true / include=false"
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                            subScore.isIncluded
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                          }`}
                        >
                          {subScore.isIncluded ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          <span>
                            {subScore.subjectName}: include={String(subScore.isIncluded)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importNotice && (
            <div className={`p-3 border rounded-xl text-xs font-bold flex items-center space-x-2 ${
              hasImportErrors
                ? 'bg-rose-100 border-rose-300 text-rose-900'
                : 'bg-emerald-100 border-emerald-300 text-emerald-900'
            }`}>
              {hasImportErrors
                ? <AlertCircle className="w-5 h-5 text-rose-600" />
                : <Check className="w-5 h-5 text-emerald-600" />}
              <span>{importNotice}</span>
              {hasDatabaseSaveError && lastImportSave && (
                <button
                  type="button"
                  onClick={() => {
                    setImportNotice(null);
                    setHasImportErrors(false);
                    setPendingImportSave(lastImportSave);
                  }}
                  className="ml-auto shrink-0 rounded-lg bg-rose-700 px-3 py-1.5 text-white hover:bg-rose-600"
                >
                  Retry Database Save
                </button>
              )}
            </div>
          )}
          {isImportSaving && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-bold">
              Saving imported student scores to the database and local backup files…
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isImportSaving}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="csv-commit-button"
            onClick={handleCommitImport}
            disabled={parsedGroups.length === 0 || isProcessingConflicts || !!importNotice || isImportSaving}
            className={`px-5 py-2 text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer ${
              parsedGroups.length === 0 || isProcessingConflicts || !!importNotice || isImportSaving
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/30'
            }`}
          >
            Commit &amp; Save All Records
          </button>
        </div>

        {/* ===================================================================== */}
        {/* UNREGISTERED / EXTRA CSV STUDENTS IDENTIFICATION & ENROLLMENT MODAL    */}
        {/* ===================================================================== */}
        {isEnrollmentModalOpen && enrollmentAnalysis && (
          <div
            data-testid="csv-unregistered-enrollment-modal"
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl border-2 border-amber-400 overflow-hidden">
              <div className="p-5 bg-slate-900 text-white flex items-start justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                      Bulk CSV Student Count &amp; Registration Verification
                    </div>
                    <h4 className="text-base font-black text-white mt-0.5">
                      Identify &amp; Enroll Unregistered Student(s) in {section.name}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">
                      {enrollmentAnalysis.exceedsRegisteredCount ? (
                        <>
                          The imported CSV contains <strong>{enrollmentAnalysis.csvStudentCount} students</strong>, which is{' '}
                          <strong className="text-amber-300">
                            {enrollmentAnalysis.extraStudentCount} more than the {enrollmentAnalysis.registeredStudentCount} students
                          </strong>{' '}
                          already registered in <strong>{section.name}</strong>.
                        </>
                      ) : (
                        <>
                          The imported CSV contains{' '}
                          <strong className="text-amber-300">
                            {unregisteredIndices.length} student(s)
                          </strong>{' '}
                          not yet registered in <strong>{section.name}</strong>.
                        </>
                      )}{' '}
                      Confirm below to enroll the identified student(s) into the class with their imported scores.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEnrollmentModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary Strip */}
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">
                    Registered in {section.name}
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {enrollmentAnalysis.registeredStudentCount} Students
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">
                    Students in CSV File
                  </span>
                  <span className="text-sm font-black text-indigo-700">
                    {enrollmentAnalysis.csvStudentCount} Students
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">
                    New Students to Identify
                  </span>
                  <span className="text-sm font-black text-amber-700">
                    {unregisteredIndices.length} Student(s)
                  </span>
                </div>
              </div>

              {/* Identified Student Cards */}
              <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-slate-50">
                {unregisteredIndices.map((gIdx, orderIdx) => {
                  const candidate = parsedGroups[gIdx];
                  if (!candidate) return null;
                  const isConfirmed = candidate.enrollConfirmed !== false;

                  return (
                    <div
                      key={gIdx}
                      data-testid={`unregistered-student-card-${orderIdx}`}
                      className={`p-4 rounded-xl border-2 transition-all bg-white space-y-3 ${
                        isConfirmed
                          ? 'border-emerald-400 shadow-xs'
                          : 'border-slate-200 opacity-75'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-indigo-600" />
                          <span className="text-xs font-black text-slate-900">
                            Identified Unregistered Student #{orderIdx + 1}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            • Target Class: <strong>{section.name}</strong> (Tutor: {section.classTeacherName})
                          </span>
                        </div>
                        <label className="inline-flex items-center space-x-2 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-300 cursor-pointer text-xs font-bold text-emerald-900">
                          <input
                            type="checkbox"
                            data-testid={`enroll-confirm-checkbox-${orderIdx}`}
                            checked={isConfirmed}
                            onChange={e =>
                              handleUpdateUnregisteredCandidate(gIdx, {
                                enrollConfirmed: e.target.checked
                              })
                            }
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span>{isConfirmed ? 'Enroll Student with Scores' : 'Do Not Enroll (Skip)'}</span>
                        </label>
                      </div>

                      {/* Editable Student Metadata */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Student Full Name
                          </label>
                          <input
                            type="text"
                            value={candidate.name}
                            onChange={e =>
                              handleUpdateUnregisteredCandidate(gIdx, { name: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Admission Number
                          </label>
                          <input
                            type="text"
                            value={candidate.admissionNumber}
                            onChange={e =>
                              handleUpdateUnregisteredCandidate(gIdx, {
                                admissionNumber: e.target.value
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold text-indigo-700"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Gender
                          </label>
                          <select
                            value={candidate.gender || 'MALE'}
                            onChange={e =>
                              handleUpdateUnregisteredCandidate(gIdx, {
                                gender: e.target.value as 'MALE' | 'FEMALE'
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
                          >
                            <option value="MALE">MALE</option>
                            <option value="FEMALE">FEMALE</option>
                          </select>
                        </div>
                      </div>

                      {/* Existing Scores from CSV to be attached upon enrollment */}
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5 text-[11px]">
                        <div className="font-bold text-slate-700 uppercase text-[10px]">
                          Existing CSV Assessment Scores to Attach on Enrollment:
                        </div>
                        {candidate.subjectScores.map((subSc, sIdx) => {
                          const rawSum = Object.values(subSc.scores).reduce(
                            (acc, v) => acc + (Number(v) || 0),
                            0
                          );
                          return (
                            <div
                              key={sIdx}
                              className="flex flex-wrap items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded border border-slate-200 font-mono"
                            >
                              <span className="font-bold text-slate-900">
                                {subSc.subjectName} (include={String(subSc.isIncluded)})
                              </span>
                              <span className="text-slate-600">
                                {components
                                  .map(
                                    c =>
                                      `${c.shortCode}: ${
                                        subSc.scores[c.id] !== undefined && subSc.scores[c.id] !== null
                                          ? subSc.scores[c.id]
                                          : '—'
                                      }`
                                  )
                                  .join(' • ')}{' '}
                                | <strong className="text-indigo-700">Total CA: {rawSum.toFixed(1)}</strong>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Enrollment Modal Footer */}
              <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  data-testid="csv-skip-unregistered-btn"
                  onClick={handleSkipUnregisteredAndImport}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Skip Unregistered &amp; Import Registered Only
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="csv-enrollment-review-preview-btn"
                    onClick={() => setIsEnrollmentModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Review Full CSV List
                  </button>
                  <button
                    type="button"
                    data-testid="csv-confirm-enroll-students-btn"
                    onClick={handleConfirmEnrollAndImport}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center space-x-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>
                      Confirm Enrollment &amp; Import All Scores (
                      {unregisteredIndices.filter(i => parsedGroups[i]?.enrollConfirmed !== false).length}{' '}
                      New)
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
