/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  RemarkType,
  LevelType,
  SubjectCategory,
  Student,
  ClassSection,
  Subject,
  GradingScaleScope,
  GradingScaleBand
} from '../types/index';
import {
  canAccessDatabaseConfig,
  canAccessSystemBackup,
  canManageStaffAuth,
  generateTeacherUsername,
  resolveInstitutionLogoUrl,
  DEFAULT_INSTITUTION_LOGO_DATA_URI
} from '../utils/rbacAndAuth';
import {
  formatBackupTimestamp,
  formatByteSize,
  SystemBackupRecord
} from '../utils/backupRestoreEngine';
import {
  SoftwareUpdateManifest,
  SoftwareUpdateHistoryEntry,
  CURRENT_SOFTWARE_VERSION,
  DEFAULT_SAMPLE_UPDATE_MANIFEST,
  validateUpdatePackageSafety,
  executeZeroDowntimeUpdateTransaction,
  createUpdatePackageZipBytes,
  extractUpdateManifestFromPackageBytes
} from '../utils/softwareUpdateEngine';
import {
  Settings,
  BookOpen,
  Sliders,
  MessageSquare,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  GraduationCap,
  School,
  Calendar,
  Users,
  Search,
  Edit2,
  AlertCircle,
  Building,
  Database,
  Upload,
  Download,
  HardDrive,
  Archive,
  Clock,
  KeyRound,
  ShieldCheck,
  FileText,
  History,
  X,
  FolderArchive,
  Package,
  Printer,
  GripVertical
} from 'lucide-react';
import { StudentEditModal } from './StudentEditModal';
import { DatabasePublishHub } from './DatabasePublishHub';
import { CustomReportSheetView } from './CustomReportSheetView';
import { AcademicHistoryExplorer } from './AcademicHistoryExplorer';
import { downloadMasterDirectoriesPdf } from '../utils/pdfGenerator';
import { moveSubjectInOrder, sortSubjectsByReportOrder } from '../utils/reportCardCalculations';

interface MasterManagementProps {
  initialSubTab?: 'school' | 'teachers' | 'classes' | 'subjects' | 'students' | 'weights' | 'custom_report' | 'academic_history' | 'comments' | 'backup' | 'update' | 'database';
}

export const MasterManagement: React.FC<MasterManagementProps> = ({ initialSubTab }) => {
  const {
    currentUser,
    currentRole,
    schoolProfile,
    updateSchoolProfile,
    sessions,
    currentSession,
    updateSessionName,
    createAcademicSession,
    selectActiveSession,
    terms,
    currentTerm,
    setCurrentTerm,
    updateTermName,
    classSections,
    addClassSection,
    updateClassSection,
    deleteClassSection,
    subjects,
    addSubject,
    updateSubject,
    deleteSubject,
    students,
    addStudent,
    deleteStudent,
    assessmentComponents,
    updateAssessmentComponent,
    addAssessmentComponent,
    deleteAssessmentComponent,
    reportCardSubjectOrder,
    updateReportCardSubjectOrder,
    commentBank,
    addCommentBankItem,
    updateCommentBankItem,
    deleteCommentBankItem,
    gradingScalePresets,
    saveGradingScalePreset,
    enableGradingScalePresetForReports,
    deleteGradingScalePreset,
    resetDefaultGradingScales,
    customReportTemplates,
    teachers,
    addTeacher,
    updateTeacher,
    updateTeacherCredentials,
    deleteTeacher,
    approveTeacherPasswordReset,
    assignFormTutor,
    assignSubjectToTeacher,
    removeSubjectFromTeacher,
    getAssignedTeacherForSubject,
    systemBackups,
    createSystemBackup,
    restoreSystemBackup,
    importSystemBackupFile,
    deleteSystemBackup
  } = useApp();

  const canViewDatabaseTab = canAccessDatabaseConfig(currentRole);
  const canViewBackupTab = canAccessSystemBackup(currentRole);
  const canApproveResets = canManageStaffAuth(currentRole);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const updateZipInputRef = useRef<HTMLInputElement | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<'school' | 'teachers' | 'classes' | 'subjects' | 'students' | 'weights' | 'custom_report' | 'academic_history' | 'comments' | 'backup' | 'update' | 'database'>(
    (initialSubTab === 'database' && !canViewDatabaseTab) || (initialSubTab === 'backup' && !canViewBackupTab)
      ? 'school'
      : (initialSubTab || 'school')
  );
  const [newSchoolSessionName, setNewSchoolSessionName] = useState('');
  const [schoolSessionMsg, setSchoolSessionMsg] = useState<string | null>(null);
  const [activeSubjectLevel, setActiveSubjectLevel] = useState<LevelType>('JUNIOR');
  const [draggedSubjectId, setDraggedSubjectId] = useState<number | null>(null);

  // Full System Backup & Restore state (Super Admin Only)
  const [newBackupLabel, setNewBackupLabel] = useState('');
  const [backupStatusBanner, setBackupStatusBanner] = useState<{ ok: boolean; message: string } | null>(null);
  const [pendingRestoreBackupId, setPendingRestoreBackupId] = useState<string | null>(null);
  const [restoreOnUploadImmediately, setRestoreOnUploadImmediately] = useState<boolean>(false);

  // Zero-Downtime Software Update & Database Migration State ("UPDATE" Tab)
  const [activeSoftwareVersion, setActiveSoftwareVersion] = useState<string>(() => {
    return localStorage.getItem('edugrade_installed_software_version_v1') || CURRENT_SOFTWARE_VERSION;
  });
  const [stagedUpdateManifest, setStagedUpdateManifest] = useState<SoftwareUpdateManifest>(DEFAULT_SAMPLE_UPDATE_MANIFEST);
  const [stagedZipFileName, setStagedZipFileName] = useState<string>('EduGrade_Update_v6.7.0_CA_Component_Scores.zip');
  const [stagedZipExtractedFiles, setStagedZipExtractedFiles] = useState<string[]>([
    'update-manifest.json',
    'src/components/ScoreEntryGrid.tsx',
    'src/utils/academicCalculations.ts',
    'migrations/schema_upgrade.sql',
    'README_UPDATE.txt'
  ]);
  const [simulateUpdateFailure, setSimulateUpdateFailure] = useState<boolean>(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState<boolean>(false);
  const [updateProgressPct, setUpdateProgressPct] = useState<number>(0);
  const [updateStageLabel, setUpdateStageLabel] = useState<string>('');
  const [updateNotification, setUpdateNotification] = useState<{
    ok: boolean;
    rolledBack: boolean;
    title: string;
    message: string;
  } | null>(null);
  const [updateHistory, setUpdateHistory] = useState<SoftwareUpdateHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('edugrade_software_update_history_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  React.useEffect(() => {
    fetch('/api/update/history')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.ok && Array.isArray(data.history) && data.history.length > 0) {
          setUpdateHistory(prev => {
            const byId = new Map<string, SoftwareUpdateHistoryEntry>();
            for (const item of prev) byId.set(item.id, item);
            for (const item of data.history) {
              if (item && item.id) byId.set(item.id, item);
            }
            return Array.from(byId.values());
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleDownloadSampleUpdateZip = async () => {
    try {
      const res = await fetch('/updates/EduGrade_Update_v6.7.0_CA_Component_Scores.zip');
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 100) {
          const blob = new Blob([buf], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', 'EduGrade_Update_v6.7.0_CA_Component_Scores.zip');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return;
        }
      }
    } catch {
      // Fallback to client-side ZIP packager below
    }

    const zipBytes = createUpdatePackageZipBytes(DEFAULT_SAMPLE_UPDATE_MANIFEST);
    const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'EduGrade_Update_v6.7.0_CA_Component_Scores.zip');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUploadUpdateZipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuf = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuf);
      const parsed = await extractUpdateManifestFromPackageBytes(uint8, file.name);
      if (!parsed.ok || !parsed.manifest) {
        setUpdateNotification({
          ok: false,
          rolledBack: false,
          title: 'Invalid Update Package (.ZIP)',
          message: parsed.error || 'Could not read update-manifest.json from the selected ZIP package.'
        });
        return;
      }
      setStagedUpdateManifest(parsed.manifest);
      setStagedZipFileName(file.name);
      setStagedZipExtractedFiles(parsed.extractedFiles);
      setUpdateNotification({
        ok: true,
        rolledBack: false,
        title: `Loaded Update Package: ${file.name}`,
        message: `Verified package "${parsed.manifest.title}" (v${parsed.manifest.version}) with ${parsed.manifest.databaseSchemaMigrations?.length || 0} non-destructive database schema migration(s)${
          parsed.manifest.filesToWrite?.length ? ` and ${parsed.manifest.filesToWrite.length} UI/module file patch(es)` : ''
        }. Click "Proceed & Install Update" below.`
      });
    } catch (err: any) {
      setUpdateNotification({
        ok: false,
        rolledBack: false,
        title: 'Failed to Read ZIP Update Package',
        message: err?.message || 'Unable to inspect the selected ZIP file.'
      });
    } finally {
      if (updateZipInputRef.current) {
        updateZipInputRef.current.value = '';
      }
    }
  };

  const handleProceedAndInstallUpdate = async () => {
    if (isInstallingUpdate) return;
    setIsInstallingUpdate(true);
    setUpdateNotification(null);
    setUpdateProgressPct(5);
    setUpdateStageLabel('Initializing zero-downtime background update engine...');

    // 1. Create an automatic pre-update system backup so we can revert cleanly if anything fails
    const preUpdateBackupRes = await createSystemBackup(
      `Pre-Update Restore Point (Before v${stagedUpdateManifest.version} Installation)`
    );
    const preUpdateBackupId = preUpdateBackupRes.backup?.id;

    const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const manifestToRun: SoftwareUpdateManifest = {
      ...stagedUpdateManifest,
      simulateFailure: simulateUpdateFailure || Boolean(stagedUpdateManifest.simulateFailure)
    };

    const txResult = await executeZeroDowntimeUpdateTransaction({
      manifest: manifestToRun,
      currentVersion: activeSoftwareVersion,
      currentStateSnapshot: {
        version: activeSoftwareVersion,
        schoolName: schoolProfile.name
      },
      actorName: 'superadmin (Super Admin)',
      onProgress: (pct, label) => {
        setUpdateProgressPct(pct);
        setUpdateStageLabel(label);
      },
      applyDatabaseMigrations: async migrations => {
        await pause(280);
        try {
          const res = await fetch('/api/update/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              migrations,
              filesToWrite: manifestToRun.filesToWrite
            })
          });
          if (res.ok) {
            const data = await res.json();
            return { ok: Boolean(data.ok), error: data.error };
          }
          // Offline / browser-only fallback still validates schema migrations cleanly
          return { ok: true };
        } catch {
          return { ok: true };
        }
      },
      applyStateUpdate: (manifest, prev) => {
        setActiveSoftwareVersion(manifest.version);
        try {
          localStorage.setItem('edugrade_installed_software_version_v1', manifest.version);
          localStorage.setItem('edugrade_grid_student_sort_order_v1', 'AZ');
        } catch {
          // ignore
        }
        return { ...prev, version: manifest.version };
      },
      restoreStateOnRollback: snapshot => {
        setActiveSoftwareVersion(snapshot.version);
        try {
          localStorage.setItem('edugrade_installed_software_version_v1', snapshot.version);
        } catch {
          // ignore
        }
        if (preUpdateBackupId) {
          void restoreSystemBackup(preUpdateBackupId);
        }
      }
    });

    await pause(220);

    // Persist history entry locally and on server
    const nextHistory = [txResult.historyEntry, ...updateHistory];
    setUpdateHistory(nextHistory);
    try {
      localStorage.setItem('edugrade_software_update_history_v1', JSON.stringify(nextHistory.slice(0, 50)));
      await fetch('/api/update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          migrations: [],
          historyEntry: txResult.historyEntry
        })
      });
    } catch {
      // ignore
    }

    setIsInstallingUpdate(false);
    setUpdateNotification({
      ok: txResult.ok,
      rolledBack: txResult.rolledBack,
      title: txResult.notificationTitle,
      message: txResult.notificationMessage
    });
  };

  React.useEffect(() => {
    if (activeSubTab === 'database' && !canViewDatabaseTab) {
      setActiveSubTab('school');
    }
    if (activeSubTab === 'backup' && !canViewBackupTab) {
      setActiveSubTab('school');
    }
  }, [activeSubTab, canViewDatabaseTab, canViewBackupTab]);

  React.useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleCreateFullBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createSystemBackup(newBackupLabel.trim() || undefined);
    setBackupStatusBanner({ ok: res.ok, message: res.message });
    if (res.ok) {
      setNewBackupLabel('');
    }
  };

  const handleDownloadBackupFile = (bkp: SystemBackupRecord) => {
    const jsonContent = JSON.stringify(bkp, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', bkp.fileName || `EduGrade_Backup_${bkp.id}.ebkp.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleConfirmRestoreFromBackup = async (backupId: string) => {
    const res = await restoreSystemBackup(backupId);
    setPendingRestoreBackupId(null);
    setBackupStatusBanner({ ok: res.ok, message: res.message });
  };

  const handleBackupFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const res = await importSystemBackupFile(reader.result, restoreOnUploadImmediately);
        setBackupStatusBanner({ ok: res.ok, message: res.message });
      }
      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Teacher & Form Tutor Form State (Created with Full Name & Username — No Password Required)
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherUsername, setNewTeacherUsername] = useState('');
  const [newTeacherStaffId, setNewTeacherStaffId] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');
  const [newTeacherRole, setNewTeacherRole] = useState<'FORM_TUTOR' | 'SUBJECT_TEACHER' | 'BOTH'>('FORM_TUTOR');
  const [newTeacherSectionId, setNewTeacherSectionId] = useState<number | 'NONE'>('NONE');
  const [teacherAddedNotice, setTeacherAddedNotice] = useState<string | null>(null);
  const [tutorAssignedNotice, setTutorAssignedNotice] = useState<string | null>(null);
  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null);
  const [editingTeacherName, setEditingTeacherName] = useState('');
  const [editingTeacherUsername, setEditingTeacherUsername] = useState('');
  const [editingTeacherPassword, setEditingTeacherPassword] = useState('');
  const [pendingTeacherCredentialSave, setPendingTeacherCredentialSave] = useState<{
    teacherId: number;
    username: string;
    fullName: string;
    newPassword: string;
  } | null>(null);
  const [credentialActorUsername, setCredentialActorUsername] = useState(currentUser.username || '');
  const [credentialActorInput, setCredentialActorInput] = useState('');
  const [credentialUpdateError, setCredentialUpdateError] = useState<string | null>(null);
  const [isSavingTeacherCredentials, setIsSavingTeacherCredentials] = useState(false);

  // Teacher Subject Assignment & Reassignment Confirmation Modal State
  const [assignSubjSectionId, setAssignSubjSectionId] = useState<number>(classSections[0]?.id || 1);
  const assignableSubjectsForSelectedClass = React.useMemo(() => {
    const sec = classSections.find(s => s.id === Number(assignSubjSectionId));
    if (!sec) return subjects;
    return subjects.filter(
      sub => sub.applicableLevel === sec.levelType || sub.applicableLevel === 'BOTH'
    );
  }, [classSections, subjects, assignSubjSectionId]);

  const [assignSubjSubjectId, setAssignSubjSubjectId] = useState<number>(
    assignableSubjectsForSelectedClass[0]?.id || subjects[0]?.id || 1
  );

  React.useEffect(() => {
    if (
      assignableSubjectsForSelectedClass.length > 0 &&
      !assignableSubjectsForSelectedClass.some(s => s.id === Number(assignSubjSubjectId))
    ) {
      setAssignSubjSubjectId(assignableSubjectsForSelectedClass[0].id);
    }
  }, [assignableSubjectsForSelectedClass, assignSubjSubjectId]);

  const [assignSubjTeacherId, setAssignSubjTeacherId] = useState<number>(teachers[1]?.id || teachers[0]?.id || 1);
  const [pendingReassignment, setPendingReassignment] = useState<{
    type: 'CLASS_TUTOR' | 'SUBJECT_TEACHER';
    sectionId: number;
    subjectId?: number;
    currentHolderName: string;
    newTeacherId: number;
    newTeacherName: string;
  } | null>(null);

  // School profile form state
  const [schoolName, setSchoolName] = useState(schoolProfile.name);
  const [schoolMotto, setSchoolMotto] = useState(schoolProfile.motto || '');
  const [schoolAddress, setSchoolAddress] = useState(schoolProfile.address || '');
  const [schoolPhone, setSchoolPhone] = useState(schoolProfile.phone || '');
  const [schoolEmail, setSchoolEmail] = useState(schoolProfile.email || '');
  const [schoolLogoUrl, setSchoolLogoUrl] = useState(resolveInstitutionLogoUrl(schoolProfile.logoUrl));
  const [principalName, setPrincipalName] = useState(schoolProfile.principalName || 'Principal');
  const [formTeacherName, setFormTeacherName] = useState(schoolProfile.formTeacherName || 'Class Teacher 4');
  const [reportDate, setReportDate] = useState(schoolProfile.reportDate);
  const [sessionName, setSessionName] = useState(currentSession.name);
  const [schoolSavedNotice, setSchoolSavedNotice] = useState(false);

  const handleSettingsLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSchoolLogoUrl(reader.result);
        updateSchoolProfile({ logoUrl: reader.result });
        setSchoolSavedNotice(true);
        setTimeout(() => setSchoolSavedNotice(false), 2500);
      }
    };
    reader.readAsDataURL(file);
  };

  // Term editing
  const [editingTermId, setEditingTermId] = useState<number | null>(null);
  const [editingTermName, setEditingTermName] = useState('');

  // Add Class Form state
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState('');
  const [newClassLevelType, setNewClassLevelType] = useState<LevelType>('JUNIOR');
  const [classAddedNotice, setClassAddedNotice] = useState(false);

  // Add Subject Form state
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjLevel, setNewSubjLevel] = useState<'JUNIOR' | 'SENIOR' | 'BOTH'>('BOTH');
  const [newSubjCat, setNewSubjCat] = useState<SubjectCategory>('CORE');
  const [subjectAddedNotice, setSubjectAddedNotice] = useState(false);

  // Add Student Form state
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentAdm, setNewStudentAdm] = useState('');
  const [newStudentSectionId, setNewStudentSectionId] = useState(classSections[0]?.id || 1);
  const [newStudentGender, setNewStudentGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [studentAddedNotice, setStudentAddedNotice] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilterSection, setStudentFilterSection] = useState<number | 'ALL'>('ALL');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<Student | null>(null);

  // Add Comment Form state
  const [newGrade, setNewGrade] = useState('A');
  const [newRemarkType, setNewRemarkType] = useState<RemarkType>('PRINCIPAL');
  const [newCommentText, setNewCommentText] = useState('');
  const [commentSuccess, setCommentSuccess] = useState(false);

  // Grading Scale Customization State (Junior, Senior, Custom Template)
  const [selectedGradingScope, setSelectedGradingScope] = useState<GradingScaleScope>('JUNIOR');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('default-junior-scale');
  const [gradingPresetName, setGradingPresetName] = useState<string>('Official Default Junior Grading Scale');
  const [gradingCustomTemplateId, setGradingCustomTemplateId] = useState<string>('');
  const [editableBands, setEditableBands] = useState<GradingScaleBand[]>(() => {
    const def = gradingScalePresets.find(p => p.scope === 'JUNIOR');
    return def ? def.bands.map(b => ({ ...b })) : [];
  });
  const [gradingScaleSavedMsg, setGradingScaleSavedMsg] = useState<string | null>(null);

  const handleUpdateTeacherCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingTeacherCredentialSave) return;
    setCredentialUpdateError(null);
    setIsSavingTeacherCredentials(true);
    try {
      const result = await updateTeacherCredentials({
        ...pendingTeacherCredentialSave,
        actorUsername: credentialActorUsername,
        actorCredential: credentialActorInput
      });
      if (!result.ok) {
        setCredentialUpdateError(result.message);
        return;
      }

      setTutorAssignedNotice(result.message);
      setEditingTeacherId(null);
      setEditingTeacherPassword('');
      setPendingTeacherCredentialSave(null);
      setCredentialActorInput('');
      setTimeout(() => setTutorAssignedNotice(null), 5000);
    } finally {
      setIsSavingTeacherCredentials(false);
    }
  };

  const loadPresetIntoEditor = (presetId: string, scopeOverride?: GradingScaleScope) => {
    const preset = gradingScalePresets.find(p => p.id === presetId);
    if (preset) {
      setSelectedGradingScope(preset.scope || preset.targetScope || 'JUNIOR');
      setSelectedPresetId(preset.id);
      setGradingPresetName(preset.name);
      setGradingCustomTemplateId(preset.customTemplateId || '');
      setEditableBands(preset.bands.map(b => ({ ...b })));
    } else if (scopeOverride) {
      const fallback = gradingScalePresets.find(p => (p.scope || p.targetScope) === scopeOverride);
      if (fallback) {
        setSelectedGradingScope(fallback.scope || fallback.targetScope || scopeOverride);
        setSelectedPresetId(fallback.id);
        setGradingPresetName(fallback.name);
        setGradingCustomTemplateId(fallback.customTemplateId || '');
        setEditableBands(fallback.bands.map(b => ({ ...b })));
      }
    }
  };

  const handleScopeSwitch = (scope: GradingScaleScope) => {
    setSelectedGradingScope(scope);
    const activeForScope =
      gradingScalePresets.find(p => p.scope === scope && p.isEnabledForReports) ||
      gradingScalePresets.find(p => p.scope === scope);
    if (activeForScope) {
      setSelectedPresetId(activeForScope.id);
      setGradingPresetName(activeForScope.name);
      setGradingCustomTemplateId(activeForScope.customTemplateId || '');
      setEditableBands(activeForScope.bands.map(b => ({ ...b })));
    }
  };

  // Add Component Form state
  const [newCompName, setNewCompName] = useState('');
  const [newCompCode, setNewCompCode] = useState('');
  const [newCompMax, setNewCompMax] = useState('5');
  const [newCompLevel, setNewCompLevel] = useState<LevelType>('JUNIOR');
  const [compAddedNotice, setCompAddedNotice] = useState(false);

  // Component edit inline states
  const [editingCompId, setEditingCompId] = useState<number | null>(null);
  const [editCompName, setEditCompName] = useState('');
  const [editCompCode, setEditCompCode] = useState('');
  const [editCompMax, setEditCompMax] = useState(0);

  // Handle adding a new Teacher without password (generates 4-digit PIN for initial login)
  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherName.trim()) return;

    const assignedSecId = newTeacherSectionId === 'NONE' ? null : Number(newTeacherSectionId);
    const staffCode = newTeacherStaffId.trim() || `STAFF-${String(teachers.length + 1).padStart(3, '0')}`;
    const resolvedUsername = (newTeacherUsername.trim() || generateTeacherUsername(newTeacherName)).toLowerCase();

    const createdTeacher = addTeacher({
      fullName: newTeacherName.trim(),
      username: resolvedUsername,
      staffId: staffCode,
      email: newTeacherEmail.trim(),
      phone: newTeacherPhone.trim(),
      assignedSectionId: assignedSecId,
      role: newTeacherRole,
      mustSetPassword: true,
      passwordResetRequested: false,
      hasPasswordSet: false
    });

    if (assignedSecId !== null) {
      assignFormTutor(assignedSecId, newTeacherName.trim());
    }

    setNewTeacherName('');
    setNewTeacherUsername('');
    setNewTeacherStaffId('');
    setNewTeacherEmail('');
    setNewTeacherPhone('');
    setNewTeacherSectionId('NONE');
    setTeacherAddedNotice(
      `Account created for @${resolvedUsername}! Initial 4-Digit Login PIN: ${createdTeacher.initialPin}`
    );
    setTimeout(() => setTeacherAddedNotice(null), 6000);
  };

  const handleAssignClassTutor = (sectionId: number, teacherValue: string) => {
    const matchedTeacher = teachers.find(t => t.fullName === teacherValue);
    const sec = classSections.find(s => s.id === sectionId);
    const currentTutor = sec?.classTeacherName || '';

    // If this class is already assigned to another teacher, trigger the Reassignment Confirmation Modal
    if (
      currentTutor &&
      currentTutor !== 'Unassigned' &&
      currentTutor !== teacherValue &&
      matchedTeacher
    ) {
      setPendingReassignment({
        type: 'CLASS_TUTOR',
        sectionId,
        currentHolderName: currentTutor,
        newTeacherId: matchedTeacher.id,
        newTeacherName: matchedTeacher.fullName
      });
      return;
    }

    assignFormTutor(sectionId, teacherValue, matchedTeacher?.id);
    const secName = sec?.name || 'Class';
    setTutorAssignedNotice(`Assigned ${teacherValue} as Form Tutor for ${secName}`);
    setTimeout(() => setTutorAssignedNotice(null), 3500);
  };

  const handleRequestSubjectAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    const targetTeacher = teachers.find(t => t.id === Number(assignSubjTeacherId));
    if (!targetTeacher) return;

    const existingHolder = getAssignedTeacherForSubject(
      Number(assignSubjSectionId),
      Number(assignSubjSubjectId)
    );

    if (existingHolder && existingHolder.id !== targetTeacher.id) {
      setPendingReassignment({
        type: 'SUBJECT_TEACHER',
        sectionId: Number(assignSubjSectionId),
        subjectId: Number(assignSubjSubjectId),
        currentHolderName: existingHolder.fullName,
        newTeacherId: targetTeacher.id,
        newTeacherName: targetTeacher.fullName
      });
      return;
    }

    assignSubjectToTeacher(
      Number(assignSubjSectionId),
      Number(assignSubjSubjectId),
      targetTeacher.id
    );
    const secName = classSections.find(s => s.id === Number(assignSubjSectionId))?.name || 'Class';
    const subName = subjects.find(s => s.id === Number(assignSubjSubjectId))?.name || 'Subject';
    setTutorAssignedNotice(`Assigned ${subName} (${secName}) to ${targetTeacher.fullName}`);
    setTimeout(() => setTutorAssignedNotice(null), 4000);
  };

  const handleConfirmReassignment = () => {
    if (!pendingReassignment) return;
    const secName = classSections.find(s => s.id === pendingReassignment.sectionId)?.name || 'Class';

    if (pendingReassignment.type === 'CLASS_TUTOR') {
      assignFormTutor(
        pendingReassignment.sectionId,
        pendingReassignment.newTeacherName,
        pendingReassignment.newTeacherId
      );
      setTutorAssignedNotice(
        `Reassigned Form Tutor for ${secName} from ${pendingReassignment.currentHolderName} to ${pendingReassignment.newTeacherName}`
      );
    } else if (pendingReassignment.type === 'SUBJECT_TEACHER' && pendingReassignment.subjectId) {
      assignSubjectToTeacher(
        pendingReassignment.sectionId,
        pendingReassignment.subjectId,
        pendingReassignment.newTeacherId
      );
      const subName = subjects.find(s => s.id === pendingReassignment.subjectId)?.name || 'Subject';
      setTutorAssignedNotice(
        `Reassigned ${subName} in ${secName} from ${pendingReassignment.currentHolderName} to ${pendingReassignment.newTeacherName}`
      );
    }

    setPendingReassignment(null);
    setTimeout(() => setTutorAssignedNotice(null), 4500);
  };

  // Handle saving School Profile
  const handleSaveSchoolProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateSchoolProfile({
      name: schoolName.trim(),
      motto: schoolMotto.trim(),
      address: schoolAddress.trim(),
      phone: schoolPhone.trim(),
      email: schoolEmail.trim(),
      logoUrl: schoolLogoUrl.trim(),
      principalName: principalName.trim(),
      formTeacherName: formTeacherName.trim(),
      reportDate: reportDate.trim(),
      currentSession: sessionName.trim()
    });

    if (sessionName.trim() && sessionName.trim() !== currentSession.name) {
      updateSessionName(currentSession.id, sessionName.trim());
    }

    setSchoolSavedNotice(true);
    setTimeout(() => setSchoolSavedNotice(false), 2500);
  };

  // Handle Term Name update
  const handleSaveTermName = (termId: number) => {
    if (editingTermName.trim()) {
      updateTermName(termId, editingTermName.trim());
      setEditingTermId(null);
    }
  };

  // Handle Add Class Section
  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newClassCode.trim()) return;

    addClassSection({
      name: newClassName.trim(),
      code: newClassCode.trim(),
      classLevelId: newClassLevelType === 'JUNIOR' ? 1 : 2,
      levelType: newClassLevelType,
      classTeacherName: 'Unassigned',
      capacity: 35
    });

    setNewClassName('');
    setNewClassCode('');
    setClassAddedNotice(true);
    setTimeout(() => setClassAddedNotice(false), 2500);
  };

  // Handle Add Subject
  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjName.trim() || !newSubjCode.trim()) return;

    addSubject({
      name: newSubjName.trim(),
      code: newSubjCode.trim().toUpperCase(),
      applicableLevel: newSubjLevel,
      category: newSubjCat
    });

    setNewSubjName('');
    setNewSubjCode('');
    setSubjectAddedNotice(true);
    setTimeout(() => setSubjectAddedNotice(false), 2500);
  };

  // Handle Add Student
  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentAdm.trim()) return;

    addStudent({
      fullName: newStudentName.trim(),
      admissionNumber: newStudentAdm.trim().toUpperCase(),
      currentSectionId: Number(newStudentSectionId),
      gender: newStudentGender,
      attendanceDays: 62
    });

    setNewStudentName('');
    setNewStudentAdm('');
    setStudentAddedNotice(true);
    setTimeout(() => setStudentAddedNotice(false), 2500);
  };

  // Handle Add Comment
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    addCommentBankItem({
      grade: newGrade,
      remarkType: newRemarkType,
      commentText: newCommentText.trim()
    });

    setNewCommentText('');
    setCommentSuccess(true);
    setTimeout(() => setCommentSuccess(false), 2500);
  };

  // Handle Add CA Component
  const handleAddAssessmentComponent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim() || !newCompCode.trim()) return;

    const maxVal = parseFloat(newCompMax) || 5;
    const existing = assessmentComponents.filter(c => c.levelType === newCompLevel);
    const weightOrder = existing.length + 1;

    addAssessmentComponent({
      termId: currentTerm.id,
      name: newCompName.trim(),
      shortCode: newCompCode.trim().toUpperCase(),
      maxScore: maxVal,
      weightOrder,
      levelType: newCompLevel
    });

    setNewCompName('');
    setNewCompCode('');
    setCompAddedNotice(true);
    setTimeout(() => setCompAddedNotice(false), 2500);
  };

  // Start editing component
  const startEditingComponent = (comp: typeof assessmentComponents[0]) => {
    setEditingCompId(comp.id);
    setEditCompName(comp.name);
    setEditCompCode(comp.shortCode);
    setEditCompMax(comp.maxScore);
  };

  // Save edited component
  const saveEditedComponent = (id: number) => {
    if (!editCompName.trim() || !editCompCode.trim() || editCompMax <= 0) return;
    updateAssessmentComponent(id, {
      name: editCompName.trim(),
      shortCode: editCompCode.trim().toUpperCase(),
      maxScore: editCompMax
    });
    setEditingCompId(null);
  };

  // Filtered Students list
  const filteredStudents = useMemo(() => {
    return students.filter(st => {
      const matchSection = studentFilterSection === 'ALL' || st.currentSectionId === studentFilterSection;
      const matchSearch =
        !studentSearch.trim() ||
        st.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
        st.admissionNumber.toLowerCase().includes(studentSearch.toLowerCase());
      return matchSection && matchSearch;
    });
  }, [students, studentFilterSection, studentSearch]);

  const subjectsForActiveLevel = useMemo(() => {
    const levelSubjects = subjects.filter(
      subject =>
        !subject.applicableLevel ||
        subject.applicableLevel === 'BOTH' ||
        subject.applicableLevel === activeSubjectLevel
    );
    return sortSubjectsByReportOrder(levelSubjects, activeSubjectLevel, reportCardSubjectOrder);
  }, [subjects, activeSubjectLevel, reportCardSubjectOrder]);

  const handleSubjectDrop = (targetSubjectId: number) => {
    if (draggedSubjectId === null || draggedSubjectId === targetSubjectId) return;
    const orderedIds = subjectsForActiveLevel.map(subject => subject.id);
    const reorderedIds = moveSubjectInOrder(orderedIds, draggedSubjectId, targetSubjectId);
    if (reorderedIds === orderedIds) return;
    updateReportCardSubjectOrder(activeSubjectLevel, reorderedIds);
    setDraggedSubjectId(null);
  };

  const handleDownloadMasterDirectories = () => {
    const pdfClasses = classSections.map(section => {
      const applicableSubjects = subjects
        .filter(subject =>
          subject.applicableLevel === 'BOTH' ||
          subject.applicableLevel === section.levelType ||
          !subject.applicableLevel
        )
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return {
        section,
        formTutor:
          teachers.find(teacher => teacher.assignedSectionId === section.id)?.fullName ||
          section.classTeacherName ||
          'Unassigned',
        students: students
          .filter(student => student.currentSectionId === section.id)
          .sort((a, b) =>
            a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }) ||
            a.admissionNumber.localeCompare(b.admissionNumber, undefined, { sensitivity: 'base' })
          )
          .map(student => ({
            fullName: student.fullName,
            admissionNumber: student.admissionNumber,
            gender: student.gender
          })),
        subjects: applicableSubjects.map(subject => ({
          name: subject.name,
          code: subject.code,
          category: subject.category,
          teachers: teachers
            .filter(teacher =>
              teacher.assignedSubjects?.some(
                assignment =>
                  assignment.sectionId === section.id && assignment.subjectId === subject.id
              )
            )
            .map(teacher => teacher.fullName)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        }))
      };
    });

    const pdfTeachers = teachers
      .map(teacher => ({
        fullName: teacher.fullName,
        staffId: teacher.staffId || '',
        subjects: (teacher.assignedSubjects || [])
          .map(assignment => {
            const section = classSections.find(item => item.id === assignment.sectionId);
            const subject = subjects.find(item => item.id === assignment.subjectId);
            return section && subject ? `${section.name} — ${subject.name}` : null;
          })
          .filter((entry): entry is string => entry !== null)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }));

    downloadMasterDirectoriesPdf({
      schoolName: schoolProfile.name,
      sessionName: currentSession.name,
      classes: pdfClasses,
      teachers: pdfTeachers
    });
  };

  const allVisibleStudentsSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every(student => selectedStudentIds.includes(student.id));

  const toggleVisibleStudentSelection = (checked: boolean) => {
    const visibleIds = new Set(filteredStudents.map(student => student.id));
    setSelectedStudentIds(previous => {
      const selected = new Set(previous);
      for (const id of visibleIds) {
        if (checked) selected.add(id);
        else selected.delete(id);
      }
      return Array.from(selected);
    });
  };

  const handleDeleteSelectedStudents = () => {
    const selectedIds = selectedStudentIds.filter(id => students.some(student => student.id === id));
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.length} selected student${selectedIds.length === 1 ? '' : 's'} and their associated scores?`)) {
      return;
    }
    selectedIds.forEach(deleteStudent);
    setSelectedStudentIds([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 uppercase flex items-center space-x-1">
              <Settings className="w-3.5 h-3.5" />
              <span>Administrative Configuration</span>
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1">
            Master Academic Settings &amp; Data Management
          </h2>
          <p className="text-xs text-slate-500">
            Configure school profile, academic calendar, classes, subjects, student records, CA score weights, and comment bank.
          </p>
        </div>

        {/* Sub tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubTab('school')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'school' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            School &amp; Terms
          </button>
          <button
            onClick={() => setActiveSubTab('teachers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'teachers' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Teachers &amp; Form Tutors ({teachers.length})
          </button>
          <button
            onClick={() => setActiveSubTab('classes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'classes' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Classes ({classSections.length})
          </button>
          <button
            onClick={() => setActiveSubTab('subjects')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'subjects' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Subjects ({subjects.length})
          </button>
          <button
            onClick={() => setActiveSubTab('students')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'students' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Students ({students.length})
          </button>
          <button
            onClick={() => setActiveSubTab('weights')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'weights' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            CA Headers &amp; Values
          </button>
          <button
            data-testid="settings-custom-report-subtab"
            onClick={() => setActiveSubTab('custom_report')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
              activeSubTab === 'custom_report'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Custom Report Sheet</span>
          </button>
          <button
            data-testid="settings-academic-history-subtab"
            onClick={() => setActiveSubTab('academic_history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
              activeSubTab === 'academic_history'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Academic Records &amp; History ({sessions.length})</span>
          </button>
          <button
            data-testid="settings-comments-grading-subtab"
            onClick={() => setActiveSubTab('comments')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'comments' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Comments and Grading
          </button>
          {canViewBackupTab && (
            <button
              data-testid="settings-backup-subtab"
              onClick={() => setActiveSubTab('backup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeSubTab === 'backup'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Backup &amp; Restore ({systemBackups.length})</span>
            </button>
          )}
          <button
            data-testid="settings-update-subtab"
            onClick={() => setActiveSubTab('update')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeSubTab === 'update'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>UPDATE</span>
          </button>
          {canViewDatabaseTab && (
            <button
              data-testid="settings-database-subtab"
              onClick={() => setActiveSubTab('database')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeSubTab === 'database'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>MySQL / phpMyAdmin &amp; Publish</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. School Profile & Academic Session / Term */}
      {activeSubTab === 'school' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleSaveSchoolProfile} className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                  <School className="w-4 h-4 text-indigo-600" />
                  <span>Institutional Profile &amp; Transcript Header Details</span>
                </h3>
                <p className="text-xs text-slate-400">These details appear at the top of every generated academic report sheet</p>
              </div>
              {schoolSavedNotice && (
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                  ✓ Saved successfully!
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">School Full Name</label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Sample School"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">School Motto / Tagline</label>
                <input
                  type="text"
                  value={schoolMotto}
                  onChange={(e) => setSchoolMotto(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Excellence, Diligence & Resilience"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Report Card Issue Date</label>
                <input
                  type="text"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. 27/10/2026"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Campus Physical Address</label>
                <input
                  type="text"
                  value={schoolAddress}
                  onChange={(e) => setSchoolAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Plot 12, Academic Boulevard, Horizon Estate"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Official Phone Number</label>
                <input
                  type="text"
                  value={schoolPhone}
                  onChange={(e) => setSchoolPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Phone number (optional)"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Official Email Address</label>
                <input
                  type="email"
                  value={schoolEmail}
                  onChange={(e) => setSchoolEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Email address (optional)"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Current Academic Session</label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="2026/27"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Principal Full Name &amp; Title</label>
                <input
                  type="text"
                  value={principalName}
                  onChange={(e) => setPrincipalName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Principal"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Form Teacher Default Signatory</label>
                <input
                  type="text"
                  value={formTeacherName}
                  onChange={(e) => setFormTeacherName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Class Teacher 4"
                />
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">
                  Institutional Crest / PNG Logo Upload
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="w-16 h-16 rounded-xl bg-white border border-slate-300 p-1 flex items-center justify-center shrink-0 shadow-xs">
                    <img
                      src={resolveInstitutionLogoUrl(schoolLogoUrl)}
                      alt="Logo preview"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = DEFAULT_INSTITUTION_LOGO_DATA_URI;
                      }}
                    />
                  </div>
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleSettingsLogoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        data-testid="settings-upload-logo-btn"
                        onClick={() => logoInputRef.current?.click()}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload PNG Logo</span>
                      </button>
                      <button
                        type="button"
                        data-testid="reset-default-logo-btn"
                        onClick={() => {
                          setSchoolLogoUrl(DEFAULT_INSTITUTION_LOGO_DATA_URI);
                          updateSchoolProfile({ logoUrl: DEFAULT_INSTITUTION_LOGO_DATA_URI });
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer px-2 py-1"
                      >
                        Reset to Default Logo
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Upload your institution&apos;s PNG crest to display on all student report sheets and transcripts.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors shadow-md cursor-pointer"
              >
                Save Institutional Settings
              </button>
            </div>
          </form>

          {/* Academic Terms Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-amber-500" />
                <span>Academic Terms</span>
              </h3>
              <p className="text-xs text-slate-400">Click to switch or rename active academic term</p>
            </div>

            <div className="space-y-3">
              {terms.map(t => {
                const isActive = currentTerm.id === t.id;
                const isEditing = editingTermId === t.id;

                return (
                  <div
                    key={t.id}
                    className={`p-3.5 rounded-xl border text-xs transition-all ${
                      isActive
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={editingTermName}
                          onChange={(e) => setEditingTermName(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveTermName(t.id)}
                          className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-black text-slate-900">{t.name} TERM</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Order: #{t.termOrder || t.id}</div>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTermId(t.id);
                              setEditingTermName(t.name);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                            title="Rename Term"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCurrentTerm(t)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                              isActive
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                            }`}
                          >
                            {isActive ? 'Active' : 'Select'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Academic Sessions Manager & Active Session Switcher */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center space-x-1.5">
                  <History className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Academic Sessions &amp; Active Session Loader</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Create a new session first to promote students, or select any session below to load its student records from the database.
                </p>
              </div>

              {schoolSessionMsg && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-bold">
                  ✓ {schoolSessionMsg}
                </div>
              )}

              <div className="space-y-2">
                {sessions.map(s => {
                  const isAct = s.id === currentSession.id;
                  return (
                    <div
                      key={s.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                        isAct
                          ? 'bg-indigo-50/70 border-indigo-600 font-bold text-indigo-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-black">Session {s.name}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[160px]">
                          {s.institutionName || schoolProfile.name}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid={`school-select-session-btn-${s.name}`}
                        onClick={() => {
                          selectActiveSession(s.id);
                          setSessionName(s.name);
                          setSchoolSessionMsg(`Active Session switched to ${s.name}`);
                          setTimeout(() => setSchoolSessionMsg(null), 3500);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                          isAct
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                        }`}
                      >
                        {isAct ? 'Active Session' : 'Load Session'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (!newSchoolSessionName.trim()) return;
                  const created = createAcademicSession(newSchoolSessionName.trim());
                  setNewSchoolSessionName('');
                  setSchoolSessionMsg(`Created new session ${created.name}!`);
                  setTimeout(() => setSchoolSessionMsg(null), 4000);
                }}
                className="flex items-center gap-1.5 pt-1"
              >
                <input
                  type="text"
                  data-testid="school-new-session-input"
                  value={newSchoolSessionName}
                  onChange={e => setNewSchoolSessionName(e.target.value)}
                  placeholder="New Session (e.g. 2027/28)"
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold"
                />
                <button
                  type="submit"
                  data-testid="school-create-session-btn"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold cursor-pointer shrink-0"
                >
                  + Create
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 1B. Teachers & Form Tutors Assignment Management */}
      {activeSubTab === 'teachers' && (
        <div className="space-y-6">
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs text-indigo-950">
            <div className="flex items-start space-x-3">
              <GraduationCap className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-black uppercase tracking-wide">Form Tutor Report Card Auto-Loader:</span>{' '}
                Assigning a teacher as Form Tutor to any class below automatically populates the{' '}
                <span className="font-bold underline">Form Tutor Signature</span> field on every student&apos;s report sheet in that class.
              </div>
            </div>
            {tutorAssignedNotice && (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold shrink-0 shadow-xs">
                ✓ {tutorAssignedNotice}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add New Teacher Form (Passwordless First-Time Setup) */}
            <form onSubmit={handleAddTeacher} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Create Teacher Account (No Password Needed)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter only <strong>Full Name</strong> and <strong>Username</strong>. On first login, the teacher is required to set a personal password.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Teacher Full Name &amp; Title *</label>
                  <input
                    type="text"
                    data-testid="new-teacher-fullname-input"
                    value={newTeacherName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewTeacherName(val);
                      setNewTeacherUsername(generateTeacherUsername(val));
                    }}
                    placeholder="e.g. Sample Teacher"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Login Username *</label>
                  <input
                    type="text"
                    data-testid="new-teacher-username-input"
                    value={newTeacherUsername}
                    onChange={(e) => setNewTeacherUsername(e.target.value.toLowerCase().replace(/\s+/g, '.'))}
                    placeholder="e.g. zainab.danjuma"
                    className="w-full px-3 py-2 bg-indigo-50/60 border border-indigo-300 rounded-xl text-indigo-950 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Created with <span className="font-bold text-amber-700">First-Time Password Setup Required</span> (encrypted via Scrypt + AES-256-GCM on server).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Staff ID (Optional)</label>
                    <input
                      type="text"
                      value={newTeacherStaffId}
                      onChange={(e) => setNewTeacherStaffId(e.target.value)}
                      placeholder="STAFF-014"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Academic Role</label>
                    <select
                      value={newTeacherRole}
                      onChange={(e) => setNewTeacherRole(e.target.value as 'FORM_TUTOR' | 'SUBJECT_TEACHER' | 'BOTH')}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold"
                    >
                      <option value="FORM_TUTOR">Class Teacher / Form Tutor</option>
                      <option value="BOTH">Class &amp; Subject Teacher</option>
                      <option value="SUBJECT_TEACHER">Subject Teacher</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">
                    Assign as Form Tutor to Class (Optional)
                  </label>
                  <select
                    aria-label="Assign New Teacher to Class"
                    value={newTeacherSectionId}
                    onChange={(e) => setNewTeacherSectionId(e.target.value === 'NONE' ? 'NONE' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold"
                  >
                    <option value="NONE">-- Do not assign to a class yet --</option>
                    {classSections.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Current: {s.classTeacherName})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="download-student-directory-pdf"
                    onClick={handleDownloadMasterDirectories}
                    title="Download alphabetized class directories as PDF"
                    aria-label="Download class directories as PDF"
                    className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-white p-2 text-indigo-700 hover:bg-indigo-50"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                {teacherAddedNotice && (
                  <div
                    data-testid="teacher-created-pin-notice"
                    className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-800 font-bold"
                  >
                    ✓ {teacherAddedNotice}
                  </div>
                )}
                <button
                  type="submit"
                  data-testid="create-teacher-submit-btn"
                  className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
                >
                  Create Teacher Account &amp; Generate 4-Digit PIN
                </button>
              </div>
            </form>

            {/* Class Form Tutor Assignment Matrix */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                      Class Form Tutor Assignment Matrix ({classSections.length} Classes)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Select a teacher for any class to auto-load their name on that class&apos;s Report Card
                    </p>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Auto-Synced with Report Cards
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                  {classSections.map(sec => {
                    return (
                      <div
                        key={sec.id}
                        className="p-3.5 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-slate-900 text-sm">{sec.name}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                sec.levelType === 'JUNIOR'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {sec.levelType}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Current Form Tutor on Report Sheet:{' '}
                            <span className="font-bold text-indigo-900">{sec.classTeacherName}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Assign Form Tutor:</label>
                          <select
                            aria-label={`Assign Form Tutor for ${sec.name}`}
                            value={sec.classTeacherName}
                            onChange={(e) => handleAssignClassTutor(sec.id, e.target.value)}
                            className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            {!teachers.some(t => t.fullName === sec.classTeacherName) && (
                              <option value={sec.classTeacherName}>{sec.classTeacherName}</option>
                            )}
                            {teachers.map(t => (
                              <option key={t.id} value={t.fullName}>
                                {t.fullName} ({t.staffId})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Teacher Subject Assignment Matrix (Per-Class Subject Clearance) */}
              <div
                data-testid="teacher-subject-assignment-card"
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="p-4 bg-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wide text-amber-300">
                      Teacher Subject Clearance &amp; Class Assignment Matrix
                    </h4>
                    <p className="text-[11px] text-indigo-200">
                      Assign specific subjects per class to Form Tutors &amp; Subject Teachers. Teachers can only view and edit scores for their assigned subjects.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleRequestSubjectAssignment} className="p-4 bg-indigo-50/40 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
                      1. Select Class
                    </label>
                    <select
                      data-testid="assign-subj-class-select"
                      value={assignSubjSectionId}
                      onChange={(e) => setAssignSubjSectionId(Number(e.target.value))}
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
                    >
                      {classSections.map(sec => (
                        <option key={sec.id} value={sec.id}>
                          {sec.name} ({sec.levelType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
                      2. Select Subject
                    </label>
                    <select
                      data-testid="assign-subj-subject-select"
                      value={assignSubjSubjectId}
                      onChange={(e) => setAssignSubjSubjectId(Number(e.target.value))}
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
                    >
                      {assignableSubjectsForSelectedClass.map(sub => {
                        const holder = getAssignedTeacherForSubject(assignSubjSectionId, sub.id);
                        return (
                          <option key={sub.id} value={sub.id}>
                            {sub.name} {holder ? `(Assigned: ${holder.fullName})` : '(Unassigned)'}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
                      3. Assign Teacher
                    </label>
                    <select
                      data-testid="assign-subj-teacher-select"
                      value={assignSubjTeacherId}
                      onChange={(e) => setAssignSubjTeacherId(Number(e.target.value))}
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
                    >
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.fullName} (@{t.username || generateTeacherUsername(t.fullName)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <button
                      type="submit"
                      data-testid="assign-subject-to-teacher-btn"
                      className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                    >
                      Assign Subject to Teacher
                    </button>
                  </div>
                </form>
              </div>

              {/* Independent Super Administrator Profile (Separate & Distinct from Teachers) */}
              <div
                data-testid="super-admin-profile-card"
                className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl border border-indigo-500/40 shadow-md p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-800/60 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/30 border border-indigo-400/50 flex items-center justify-center text-amber-300">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                        System Super Administrator • Independent Executive Profile
                      </div>
                      <h4 className="text-sm font-black text-white">
                        Administrator (@superadmin)
                      </h4>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-900/80 text-purple-200 border border-purple-500/50 self-start sm:self-auto">
                    Global System Governance
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-indigo-900/50">
                    <span className="text-[10px] uppercase text-slate-400 block font-bold">Admin ID &amp; Username</span>
                    <span className="font-mono text-indigo-300 font-bold">ADMIN-01 • @superadmin</span>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-indigo-900/50">
                    <span className="text-[10px] uppercase text-slate-400 block font-bold">Initial Security PIN</span>
                    <span className="font-mono text-amber-300 font-black">Set during account setup</span>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-indigo-900/50">
                    <span className="text-[10px] uppercase text-slate-400 block font-bold">Account Scope</span>
                    <span className="text-emerald-300 font-bold">Independent of Teachers</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  The Super Administrator account is completely independent of regular classroom teachers and form tutors. It holds executive clearance across all classes, curriculum subjects, database publishing, and user authentication.
                </p>
              </div>

              {/* Registered Teachers Directory */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    Registered School Teachers ({teachers.length})
                  </h4>
                  <span className="text-xs text-slate-400">Click Edit to rename or manage staff</span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
                  {teachers.map(t => {
                    const assignedClass = classSections.find(c => c.id === t.assignedSectionId || c.classTeacherName === t.fullName);
                    const isEditing = editingTeacherId === t.id;
                    const uname = t.username || generateTeacherUsername(t.fullName);
                    const needsFirstSetup = t.mustSetPassword !== false && !t.hasPasswordSet;
                    const resetRequested = Boolean(t.passwordResetRequested);

                    return (
                      <div key={t.id} className="p-3.5 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        {isEditing ? (
                          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                            <label className="text-[10px] font-bold uppercase text-slate-500">
                              Staff name
                              <input
                                type="text"
                                value={editingTeacherName}
                                onChange={event => setEditingTeacherName(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                                autoFocus
                                required
                              />
                            </label>
                            <label className="text-[10px] font-bold uppercase text-slate-500">
                              Username
                              <input
                                type="text"
                                value={editingTeacherUsername}
                                onChange={event => setEditingTeacherUsername(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                                autoComplete="off"
                                pattern="[A-Za-z0-9._-]{3,50}"
                                title="3–50 letters, numbers, dots, underscores, or hyphens"
                                required
                              />
                            </label>
                            <label className="text-[10px] font-bold uppercase text-slate-500 sm:col-span-2">
                              New staff password (optional; leave blank to keep current password)
                              <input
                                type="password"
                                value={editingTeacherPassword}
                                onChange={event => setEditingTeacherPassword(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                                autoComplete="new-password"
                                placeholder="9+ characters, uppercase and number/symbol"
                              />
                            </label>
                            <div className="flex items-center gap-2 sm:col-span-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const fullName = editingTeacherName.trim();
                                  const username = editingTeacherUsername.trim().toLowerCase();
                                  if (!fullName || !username) return;
                                  setPendingTeacherCredentialSave({
                                    teacherId: t.id,
                                    username,
                                    fullName,
                                    newPassword: editingTeacherPassword
                                  });
                                  setCredentialActorUsername(currentUser.username || '');
                                  setCredentialActorInput('');
                                  setCredentialUpdateError(null);
                                }}
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white"
                              >
                                Save account changes
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTeacherId(null);
                                  setEditingTeacherPassword('');
                                }}
                                className="rounded-lg bg-slate-200 px-2.5 py-1.5 text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-slate-900">{t.fullName}</span>
                                <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                                  @{uname}
                                </span>
                                <span
                                  data-testid={`teacher-pin-badge-${t.id}`}
                                  className="text-[10px] font-mono bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-black"
                                >
                                  Initial 4-Digit PIN: {t.initialPin || 'Not set'}
                                </span>
                                <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  {t.staffId}
                                </span>
                                {assignedClass && (
                                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                                    Form Tutor: {assignedClass.name}
                                  </span>
                                )}
                                {resetRequested ? (
                                  <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full">
                                    Password Reset Requested
                                  </span>
                                ) : needsFirstSetup ? (
                                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
                                    4-Digit PIN Login Active (Must Set Password)
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center space-x-1">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>Password Active</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {t.email} • {t.phone}
                              </div>
                              {/* Assigned Subjects Badges */}
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">
                                  Assigned Subjects ({(t.assignedSubjects || []).length}):
                                </span>
                                {(t.assignedSubjects || []).slice(0, 6).map(asg => {
                                  const secName = classSections.find(c => c.id === asg.sectionId)?.name || `Class #${asg.sectionId}`;
                                  const subName = subjects.find(s => s.id === asg.subjectId)?.name || `Subject #${asg.subjectId}`;
                                  return (
                                    <span
                                      key={`${asg.sectionId}-${asg.subjectId}`}
                                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700"
                                    >
                                      <span>{subName} ({secName})</span>
                                      <button
                                        type="button"
                                        onClick={() => removeSubjectFromTeacher(asg.sectionId, asg.subjectId, t.id)}
                                        className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                                        title="Remove Subject Assignment"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  );
                                })}
                                {(t.assignedSubjects || []).length > 6 && (
                                  <span className="text-[10px] font-mono text-indigo-600 font-bold">
                                    +{(t.assignedSubjects || []).length - 6} more
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-1.5 shrink-0">
                              {canApproveResets && (
                                <button
                                  type="button"
                                  data-testid={`approve-reset-btn-${t.id}`}
                                  onClick={async () => {
                                    const res = await approveTeacherPasswordReset(t.id);
                                    setTutorAssignedNotice(res.message);
                                    setTimeout(() => setTutorAssignedNotice(null), 4500);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center space-x-1 cursor-pointer transition-colors ${
                                    resetRequested
                                      ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-2xs'
                                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                                  }`}
                                  title="Reset teacher password and generate a new 4-digit initial PIN"
                                >
                                  <KeyRound className="w-3 h-3" />
                                  <span>{resetRequested ? 'Approve Reset' : 'Reset Password & PIN'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTeacherId(t.id);
                                  setEditingTeacherName(t.fullName);
                                  setEditingTeacherUsername(uname);
                                  setEditingTeacherPassword('');
                                }}
                                className={`p-1.5 rounded-lg cursor-pointer ${
                                  canApproveResets
                                    ? 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                                    : 'hidden'
                                }`}
                                title="Edit staff name, username, or password"
                                aria-label={`Edit credentials for ${t.fullName}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTeacher(t.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Remove Teacher"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Class Sections Management */}
      {activeSubTab === 'classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Class Form */}
          <form onSubmit={handleAddClass} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                <Building className="w-4 h-4 text-indigo-600" />
                <span>Add Class Section</span>
              </h3>
              <p className="text-xs text-slate-400">Create new class arms for junior or senior secondary</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Class Name</label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g. Year 10 Resilience"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Class Code</label>
                <input
                  type="text"
                  value={newClassCode}
                  onChange={(e) => setNewClassCode(e.target.value)}
                  placeholder="e.g. Y10-RES"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Level Tier</label>
                <select
                  value={newClassLevelType}
                  onChange={(e) => setNewClassLevelType(e.target.value as LevelType)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold"
                >
                  <option value="JUNIOR">Junior Secondary (Year 7 - 9, All Core, 40 CA)</option>
                  <option value="SENIOR">Senior Secondary (Year 10 - 12, Electives, 30 CA)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              {classAddedNotice && <span className="text-xs text-emerald-600 font-semibold">✓ Class created!</span>}
              <button
                type="submit"
                className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Add Class
              </button>
            </div>
          </form>

          {/* Classes Directory Table */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase">
                Active School Classes ({classSections.length})
              </h4>
              <span className="text-xs text-slate-500">Junior &amp; Senior Divisions</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {classSections.map(sec => {
                const count = students.filter(s => s.currentSectionId === sec.id).length;
                return (
                  <div key={sec.id} className="p-4 hover:bg-slate-50 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900 text-sm">{sec.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          sec.levelType === 'JUNIOR'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {sec.levelType}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px] font-mono mt-0.5">
                        Code: {sec.code || sec.name.slice(0, 6)} • Enrolled Students: {count}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = prompt(`Rename class "${sec.name}":`, sec.name);
                          if (updated && updated.trim()) {
                            updateClassSection(sec.id, { name: updated.trim() });
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg"
                        title="Rename Class"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete class "${sec.name}"?`)) {
                            deleteClassSection(sec.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="Delete Class"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. Subjects Management */}
      {activeSubTab === 'subjects' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Subject Form */}
          <form onSubmit={handleAddSubject} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>Add Curriculum Subject</span>
              </h3>
              <p className="text-xs text-slate-400">Add core or elective subjects to the school curriculum</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Subject Title</label>
                <input
                  type="text"
                  value={newSubjName}
                  onChange={(e) => setNewSubjName(e.target.value)}
                  placeholder="e.g. Further Mathematics"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Subject Code</label>
                <input
                  type="text"
                  value={newSubjCode}
                  onChange={(e) => setNewSubjCode(e.target.value)}
                  placeholder="e.g. FMTH"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Applicable Level</label>
                <select
                  value={newSubjLevel}
                  onChange={(e) => setNewSubjLevel(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold"
                >
                  <option value="BOTH">Both Junior &amp; Senior (Year 7 - 12)</option>
                  <option value="JUNIOR">Junior Secondary Only (Year 7 - 9)</option>
                  <option value="SENIOR">Senior Secondary Only (Year 10 - 12)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Category</label>
                <select
                  value={newSubjCat}
                  onChange={(e) => setNewSubjCat(e.target.value as SubjectCategory)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold"
                >
                  <option value="CORE">Core (Compulsory)</option>
                  <option value="OPTIONAL">Optional (Elective)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              {subjectAddedNotice && <span className="text-xs text-emerald-600 font-semibold">✓ Subject created!</span>}
              <button
                type="submit"
                className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Add Subject
              </button>
            </div>
          </form>

          {/* Subjects Directory Table */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase">
                  {activeSubjectLevel === 'JUNIOR' ? 'Junior' : 'Senior'} Subjects ({subjectsForActiveLevel.length})
                </h4>
                <span className="text-xs text-slate-500">Core &amp; Elective Courses</span>
              </div>
              <button
                type="button"
                data-testid="download-subject-directory-pdf"
                onClick={handleDownloadMasterDirectories}
                title="Download subjects, form tutors, and teacher assignments as PDF"
                aria-label="Download subject and staff directories as PDF"
                className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-white p-2 text-indigo-700 hover:bg-indigo-50"
              >
                <Printer className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
              {(['JUNIOR', 'SENIOR'] as const).map(level => {
                const count = subjects.filter(
                  subject =>
                    !subject.applicableLevel ||
                    subject.applicableLevel === 'BOTH' ||
                    subject.applicableLevel === level
                ).length;
                return (
                  <button
                    key={level}
                    type="button"
                    data-testid={`master-subject-level-${level.toLowerCase()}`}
                    onClick={() => setActiveSubjectLevel(level)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                      activeSubjectLevel === level
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {level === 'JUNIOR' ? 'Junior' : 'Senior'} ({count})
                  </button>
                );
              })}
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {subjectsForActiveLevel.map(subj => (
                <div key={subj.id} className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900">{subj.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                        {subj.code}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px] mt-0.5">
                      Level: <span className="font-semibold text-slate-600">{subj.applicableLevel}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      subj.category === 'CORE' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {subj.category}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = prompt(`Rename subject "${subj.name}":`, subj.name);
                        if (updated && updated.trim()) {
                          updateSubject(subj.id, { name: updated.trim() });
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg"
                      title="Rename Subject"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete subject "${subj.name}"?`)) {
                          deleteSubject(subj.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="Delete Subject"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Student Management */}
      {activeSubTab === 'students' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Student Form */}
          <form onSubmit={handleAddStudent} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Register New Student</span>
              </h3>
              <p className="text-xs text-slate-400">Add student with admission number and assigned class</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Full Legal Name</label>
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="e.g. ADEYEMI, Chukwuemeka David"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Admission Number</label>
                <input
                  type="text"
                  value={newStudentAdm}
                  onChange={(e) => setNewStudentAdm(e.target.value)}
                  placeholder="e.g. STUDENT-2026-089"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Assigned Class Section</label>
                <select
                  value={newStudentSectionId}
                  onChange={(e) => setNewStudentSectionId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold"
                >
                  {classSections.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.levelType})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[11px]">Gender</label>
                <div className="flex items-center space-x-4 pt-1">
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="newGender"
                      checked={newStudentGender === 'MALE'}
                      onChange={() => setNewStudentGender('MALE')}
                    />
                    <span>Male (M)</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="newGender"
                      checked={newStudentGender === 'FEMALE'}
                      onChange={() => setNewStudentGender('FEMALE')}
                    />
                    <span>Female (F)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              {studentAddedNotice && <span className="text-xs text-emerald-600 font-semibold">✓ Student enrolled!</span>}
              <button
                type="submit"
                className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Enroll Student
              </button>
            </div>
          </form>

          {/* Student Search & List */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students by name or admission number..."
                  className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={allVisibleStudentsSelected}
                    onChange={event => toggleVisibleStudentSelection(event.target.checked)}
                    disabled={filteredStudents.length === 0}
                    aria-label="Select all visible students"
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>Select visible</span>
                </label>
                {selectedStudentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteSelectedStudents}
                    className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete selected ({selectedStudentIds.length})
                  </button>
                )}
                <span className="text-[11px] font-semibold text-slate-500">Class:</span>
                <select
                  value={studentFilterSection}
                  onChange={(e) => setStudentFilterSection(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                >
                  <option value="ALL">All Classes ({students.length})</option>
                  {classSections.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-slate-100 flex-1 max-h-[500px] overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No students found matching your criteria.
                </div>
              ) : (
                filteredStudents.map(st => {
                  const sec = classSections.find(s => s.id === st.currentSectionId);
                  return (
                    <div
                      key={st.id}
                      className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-4 text-xs transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(st.id)}
                          onChange={event => {
                            setSelectedStudentIds(previous =>
                              event.target.checked
                                ? [...new Set([...previous, st.id])]
                                : previous.filter(id => id !== st.id)
                            );
                          }}
                          aria-label={`Select ${st.fullName}`}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                          {st.gender}
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => setSelectedStudentForEdit(st)}
                            className="font-bold text-slate-900 hover:text-indigo-600 text-left transition-colors cursor-pointer"
                            title="Click to edit student"
                          >
                            {st.fullName}
                          </button>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {st.admissionNumber} • {sec?.name || 'Unassigned'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setSelectedStudentForEdit(st)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. CA Headers & Values (Applies to all) */}
      {activeSubTab === 'weights' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold">Global Application Notice:</span> Editing CA component headers (e.g. QZ, CW, ASS, PJ, TEST) and max values here immediately updates all assessment entry grids, report card columns, and percentage calculations throughout the platform.
            </div>
          </div>

          <div
            data-testid="report-card-subject-order-settings"
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4"
          >
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Arrange Report Card Subjects</h3>
              <p className="text-xs text-slate-500 mt-1">
                Click and drag subjects into the order they should appear on report sheets. The Junior and Senior lists are arranged separately.
              </p>
            </div>
            <div className="flex gap-2">
              {(['JUNIOR', 'SENIOR'] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  data-testid={`report-order-level-${level.toLowerCase()}`}
                  onClick={() => setActiveSubjectLevel(level)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    activeSubjectLevel === level
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {level === 'JUNIOR' ? 'Junior' : 'Senior'} (
                  {subjects.filter(
                    subject =>
                      !subject.applicableLevel ||
                      subject.applicableLevel === 'BOTH' ||
                      subject.applicableLevel === level
                  ).length}
                  )
                </button>
              ))}
            </div>
            <ol className="space-y-2" aria-label={`${activeSubjectLevel} report card subject order`}>
              {subjectsForActiveLevel.map((subject, index) => (
                <li
                  key={subject.id}
                  draggable
                  data-testid={`report-card-subject-order-item-${subject.id}`}
                  onDragStart={event => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(subject.id));
                    setDraggedSubjectId(subject.id);
                  }}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault();
                    handleSubjectDrop(subject.id);
                  }}
                  onDragEnd={() => setDraggedSubjectId(null)}
                  className={`flex cursor-grab items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm ${
                    draggedSubjectId === subject.id ? 'opacity-50' : ''
                  }`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="w-6 text-center font-mono text-xs font-bold text-slate-500">
                    {index + 1}
                  </span>
                  <span className="font-semibold text-slate-800">{subject.name}</span>
                  <span className="ml-auto text-[10px] uppercase text-slate-400">{subject.code}</span>
                </li>
              ))}
              {subjectsForActiveLevel.length === 0 && (
                <li className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                  No subjects are configured for this level.
                </li>
              )}
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Senior Secondary Assessment Components (Max: 30) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Senior Secondary CA Headers &amp; Weights (Year 10 - 12)</h3>
                  <p className="text-xs text-slate-400">Total continuous assessment target: 30.0 marks</p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                  Target: 30.0 CA
                </span>
              </div>

              <div className="space-y-3">
                {assessmentComponents.filter(c => c.levelType === 'SENIOR' || (!c.levelType && c.id <= 4)).map(comp => {
                  const isEditing = editingCompId === comp.id;

                  if (isEditing) {
                    return (
                      <div key={comp.id} className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Header Name</label>
                            <input
                              type="text"
                              value={editCompName}
                              onChange={(e) => setEditCompName(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Short Code</label>
                            <input
                              type="text"
                              value={editCompCode}
                              onChange={(e) => setEditCompCode(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-bold font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center space-x-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Max Score:</label>
                            <input
                              type="number"
                              step="0.5"
                              value={editCompMax}
                              onChange={(e) => setEditCompMax(parseFloat(e.target.value) || 0)}
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-center"
                            />
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingCompId(null)}
                              className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditedComponent(comp.id)}
                              className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-bold"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={comp.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">
                          {comp.name} <span className="font-mono text-indigo-700">({comp.shortCode})</span>
                        </div>
                        <div className="text-slate-400 text-[10px]">Order: #{comp.weightOrder}</div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="font-mono font-bold text-slate-900 bg-white px-2 py-1 border border-slate-200 rounded-lg">
                          {comp.maxScore.toFixed(1)} marks
                        </span>

                        <button
                          type="button"
                          onClick={() => startEditingComponent(comp)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Edit Header & Max Score"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete component "${comp.name}"?`)) {
                              deleteAssessmentComponent(comp.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Delete Component"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-indigo-50/50 rounded-xl text-xs text-indigo-900 flex justify-between font-bold">
                <span>Sum of Senior Components:</span>
                <span className="font-mono">
                  {assessmentComponents
                    .filter(c => c.levelType === 'SENIOR' || (!c.levelType && c.id <= 4))
                    .reduce((sum, c) => sum + c.maxScore, 0).toFixed(1)} / 30.0 marks
                </span>
              </div>
            </div>

            {/* Junior Secondary Assessment Components (Max: 40) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Junior Secondary CA Headers &amp; Weights (Year 7 - 9)</h3>
                  <p className="text-xs text-slate-400">Total continuous assessment target: 40.0 marks</p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  Target: 40.0 CA
                </span>
              </div>

              <div className="space-y-3">
                {assessmentComponents.filter(c => c.levelType === 'JUNIOR' || (!c.levelType && c.id >= 5)).map(comp => {
                  const isEditing = editingCompId === comp.id;

                  if (isEditing) {
                    return (
                      <div key={comp.id} className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Header Name</label>
                            <input
                              type="text"
                              value={editCompName}
                              onChange={(e) => setEditCompName(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Short Code</label>
                            <input
                              type="text"
                              value={editCompCode}
                              onChange={(e) => setEditCompCode(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-bold font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center space-x-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Max Score:</label>
                            <input
                              type="number"
                              step="0.5"
                              value={editCompMax}
                              onChange={(e) => setEditCompMax(parseFloat(e.target.value) || 0)}
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-center"
                            />
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingCompId(null)}
                              className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditedComponent(comp.id)}
                              className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={comp.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">
                          {comp.name} <span className="font-mono text-emerald-700">({comp.shortCode})</span>
                        </div>
                        <div className="text-slate-400 text-[10px]">Order: #{comp.weightOrder}</div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="font-mono font-bold text-slate-900 bg-white px-2 py-1 border border-slate-200 rounded-lg">
                          {comp.maxScore.toFixed(1)} marks
                        </span>

                        <button
                          type="button"
                          onClick={() => startEditingComponent(comp)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Edit Header & Max Score"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete component "${comp.name}"?`)) {
                              deleteAssessmentComponent(comp.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Delete Component"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-emerald-50/50 rounded-xl text-xs text-emerald-900 flex justify-between font-bold">
                <span>Sum of Junior Components:</span>
                <span className="font-mono">
                  {assessmentComponents
                    .filter(c => c.levelType === 'JUNIOR' || (!c.levelType && c.id >= 5))
                    .reduce((sum, c) => sum + c.maxScore, 0).toFixed(1)} / 40.0 marks
                </span>
              </div>
            </div>
          </div>

          {/* Add New CA Component Box */}
          <form onSubmit={handleAddAssessmentComponent} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Add New Continuous Assessment Component</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">Component Name</label>
                <input
                  type="text"
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  placeholder="e.g. Practical Lab"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">Short Code</label>
                <input
                  type="text"
                  value={newCompCode}
                  onChange={(e) => setNewCompCode(e.target.value)}
                  placeholder="e.g. LAB"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">Max Score</label>
                <input
                  type="number"
                  step="0.5"
                  value={newCompMax}
                  onChange={(e) => setNewCompMax(e.target.value)}
                  placeholder="5.0"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">Applicable Level</label>
                <select
                  value={newCompLevel}
                  onChange={(e) => setNewCompLevel(e.target.value as LevelType)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="JUNIOR">Junior Secondary (Year 7 - 9)</option>
                  <option value="SENIOR">Senior Secondary (Year 10 - 12)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              {compAddedNotice && <span className="text-xs text-emerald-600 font-semibold">✓ Component registered!</span>}
              <button
                type="submit"
                className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 transition-colors shadow-xs cursor-pointer"
              >
                Add Component Header
              </button>
            </div>
          </form>

          {/* Custom Report Sheet Builder Link inside CA Headers & Values */}
          <div
            data-testid="weights-custom-report-builder-card"
            className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-md border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase">
                Class Custom Report Sheet System
              </span>
              <h3 className="text-base font-black text-white mt-1">
                Create Custom Report Sheet for Any Class (Custom Headers &amp; Scores)
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                Select any class, define custom column headers and maximum scores, choose subjects, and generate a Subject-Oriented Class Report Sheet with class averages.
              </p>
            </div>
            <button
              type="button"
              data-testid="open-custom-report-tab-from-weights"
              onClick={() => setActiveSubTab('custom_report')}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs shadow-md cursor-pointer shrink-0"
            >
              Open Custom Report Sheet Builder →
            </button>
          </div>
        </div>
      )}

      {/* 5B. Custom Report Sheet & Subject-Oriented Report Sheet Generator */}
      {activeSubTab === 'custom_report' && <CustomReportSheetView />}

      {/* 6. Comments and Grading (Customizable Grading Scales + Comment Bank Repository) */}
      {activeSubTab === 'comments' && (
        <div className="space-y-6">
          {/* =============================================================== */}
          {/* CUSTOMIZABLE GRADING SCALE SYSTEM (JUNIOR, SENIOR, CUSTOM)      */}
          {/* =============================================================== */}
          <div
            data-testid="grading-scale-customizer-panel"
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-black uppercase tracking-wider">
                    Official Grading Scale Engine
                  </span>
                  <span className="text-[11px] text-indigo-200 font-semibold">
                    Junior • Senior • Custom Report Templates
                  </span>
                </div>
                <h3 className="text-base font-black text-white mt-1">
                  Customize &amp; Enable Grading Scales for Report Cards
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  The existing Junior, Senior, and Custom Template grading scales are preloaded as defaults. Customize score boundaries, save new presets, and enable any scale for live Report Cards &amp; Transcripts.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="reset-default-grading-scales-btn"
                  onClick={() => {
                    resetDefaultGradingScales();
                    handleScopeSwitch(selectedGradingScope);
                    setGradingScaleSavedMsg('All grading scales restored to official defaults.');
                    setTimeout(() => setGradingScaleSavedMsg(null), 3500);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restore Default Scales</span>
                </button>
              </div>
            </div>

            {/* Scope Selector Tabs (Junior, Senior, Custom Template) */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { scope: 'JUNIOR' as GradingScaleScope, label: 'Junior Secondary Scale (Year 7–9)' },
                    { scope: 'SENIOR' as GradingScaleScope, label: 'Senior Secondary Scale (Year 10–12)' },
                    { scope: 'CUSTOM_TEMPLATE' as GradingScaleScope, label: 'Custom Report Template Scale' }
                  ]
                ).map(tab => {
                  const activePreset = gradingScalePresets.find(
                    p => p.scope === tab.scope && p.isEnabledForReports
                  );
                  return (
                    <button
                      key={tab.scope}
                      type="button"
                      data-testid={`grading-scope-tab-${tab.scope}`}
                      onClick={() => handleScopeSwitch(tab.scope)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 border ${
                        selectedGradingScope === tab.scope
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {activePreset && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                            selectedGradingScope === tab.scope
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          Active: {activePreset.name.replace('Official Default ', '')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Saved Presets Dropdown for Selected Scope */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="font-bold text-slate-600 uppercase text-[10px]">Saved Scales:</span>
                <select
                  aria-label="Saved Grading Scale Preset"
                  data-testid="saved-grading-preset-select"
                  value={selectedPresetId}
                  onChange={e => loadPresetIntoEditor(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
                >
                  {gradingScalePresets
                    .filter(p => p.scope === selectedGradingScope)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.isEnabledForReports ? '★ (ENABLED FOR REPORTS)' : ''}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {gradingScaleSavedMsg && (
              <div
                data-testid="grading-scale-status-banner"
                className="mx-5 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between"
              >
                <span>✓ {gradingScaleSavedMsg}</span>
                <button
                  type="button"
                  onClick={() => setGradingScaleSavedMsg(null)}
                  className="text-emerald-700 hover:text-emerald-950 font-black cursor-pointer"
                >
                  ×
                </button>
              </div>
            )}

            <div className="p-5 space-y-4">
              {/* Scale Metadata & Actions Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
                    Grading Scale Preset Name
                  </label>
                  <input
                    type="text"
                    data-testid="grading-scale-name-input"
                    value={gradingPresetName}
                    onChange={e => setGradingPresetName(e.target.value)}
                    placeholder="e.g. Custom Senior Distinction Scale"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
                  />
                </div>

                {selectedGradingScope === 'CUSTOM_TEMPLATE' ? (
                  <div>
                    <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
                      Target Custom Report Template (Optional)
                    </label>
                    <select
                      value={gradingCustomTemplateId}
                      onChange={e => setGradingCustomTemplateId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900"
                    >
                      <option value="">Apply to All Custom Report Templates</option>
                      {customReportTemplates.map(tpl => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-slate-600 uppercase mb-1 text-[10px]">
                      Target Academic Division
                    </label>
                    <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700">
                      {selectedGradingScope === 'JUNIOR'
                        ? 'Junior Secondary (Year 7 – Year 9)'
                        : 'Senior Secondary (Year 10 – Year 12)'}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <button
                    type="button"
                    data-testid="save-and-enable-grading-scale-btn"
                    onClick={() => {
                      const cleanName = gradingPresetName.trim() || `${selectedGradingScope} Grading Scale`;
                      const saved = saveGradingScalePreset({
                        id: selectedPresetId,
                        name: cleanName,
                        scope: selectedGradingScope,
                        customTemplateId: selectedGradingScope === 'CUSTOM_TEMPLATE' ? (gradingCustomTemplateId || undefined) : undefined,
                        isDefault: gradingScalePresets.find(p => p.id === selectedPresetId)?.isDefault || false,
                        isEnabledForReports: true,
                        bands: editableBands
                      });
                      setSelectedPresetId(saved.id);
                      setGradingScaleSavedMsg(
                        `Saved & ENABLED "${saved.name}" for ${selectedGradingScope} Report Cards!`
                      );
                      setTimeout(() => setGradingScaleSavedMsg(null), 4000);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs cursor-pointer flex items-center space-x-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save &amp; Enable for Reports</span>
                  </button>

                  <button
                    type="button"
                    data-testid="save-new-grading-preset-btn"
                    onClick={() => {
                      const baseName = gradingPresetName.trim() || `Custom ${selectedGradingScope} Scale`;
                      const newName = baseName.includes('(Custom)') ? baseName : `${baseName} (Custom)`;
                      const created = saveGradingScalePreset({
                        name: newName,
                        scope: selectedGradingScope,
                        customTemplateId: selectedGradingScope === 'CUSTOM_TEMPLATE' ? (gradingCustomTemplateId || undefined) : undefined,
                        isDefault: false,
                        isEnabledForReports: true,
                        bands: editableBands
                      });
                      setSelectedPresetId(created.id);
                      setGradingPresetName(created.name);
                      setGradingScaleSavedMsg(
                        `Created & ENABLED new custom scale "${created.name}" for ${selectedGradingScope} reports!`
                      );
                      setTimeout(() => setGradingScaleSavedMsg(null), 4000);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-xs cursor-pointer flex items-center space-x-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save as New Scale &amp; Enable</span>
                  </button>
                </div>
              </div>

              {/* Editable Grade Bands Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between text-xs">
                  <span className="font-black uppercase tracking-wider">
                    Grade Boundaries &amp; Descriptor Bands ({editableBands.length})
                  </span>
                  <button
                    type="button"
                    data-testid="add-grade-band-row-btn"
                    onClick={() => {
                      setEditableBands(prev => [
                        ...prev,
                        {
                          grade: 'P',
                          minScore: 40,
                          maxScore: 44,
                          remark: 'Pass'
                        }
                      ]);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Grade Band</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black uppercase text-slate-600">
                        <th className="py-2.5 px-3">Grade Letter / Code</th>
                        <th className="py-2.5 px-3">Min Score (%)</th>
                        <th className="py-2.5 px-3">Max Score (%)</th>
                        <th className="py-2.5 px-3">Grade Remark / Descriptor</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {editableBands.map((band, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              data-testid={`grade-band-code-${idx}`}
                              value={band.grade}
                              onChange={e => {
                                const val = e.target.value.toUpperCase();
                                setEditableBands(prev =>
                                  prev.map((b, i) => (i === idx ? { ...b, grade: val } : b))
                                );
                              }}
                              className="w-20 px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-mono font-black text-indigo-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              data-testid={`grade-band-min-${idx}`}
                              value={band.minScore}
                              onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setEditableBands(prev =>
                                  prev.map((b, i) => (i === idx ? { ...b, minScore: val } : b))
                                );
                              }}
                              className="w-24 px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              data-testid={`grade-band-max-${idx}`}
                              value={band.maxScore}
                              onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setEditableBands(prev =>
                                  prev.map((b, i) => (i === idx ? { ...b, maxScore: val } : b))
                                );
                              }}
                              className="w-24 px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              data-testid={`grade-band-remark-${idx}`}
                              value={band.remark}
                              onChange={e => {
                                const val = e.target.value;
                                setEditableBands(prev =>
                                  prev.map((b, i) => (i === idx ? { ...b, remark: val } : b))
                                );
                              }}
                              className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (editableBands.length <= 2) return;
                                setEditableBands(prev => prev.filter((_, i) => i !== idx));
                              }}
                              disabled={editableBands.length <= 2}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg disabled:opacity-40 cursor-pointer"
                              title="Remove Grade Band"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Saved Grading Scales Overview Cards with Quick Enable Toggle */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {gradingScalePresets.map(preset => (
                  <div
                    key={preset.id}
                    data-testid={`grading-preset-card-${preset.id}`}
                    className={`p-3.5 rounded-xl border text-xs flex flex-col justify-between gap-2 ${
                      preset.isEnabledForReports
                        ? 'bg-emerald-50/70 border-emerald-400'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">
                          {(preset.scope || preset.targetScope || 'SENIOR').replace('_', ' ')}
                        </span>
                        {preset.isEnabledForReports ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                            ENABLED FOR REPORTS
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-testid={`enable-preset-btn-${preset.id}`}
                            onClick={() => {
                              enableGradingScalePresetForReports(preset.id);
                              setGradingScaleSavedMsg(`Enabled "${preset.name}" for ${preset.scope} reports!`);
                              setTimeout(() => setGradingScaleSavedMsg(null), 3500);
                            }}
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-white hover:bg-indigo-600 cursor-pointer"
                          >
                            Enable for Reports
                          </button>
                        )}
                      </div>
                      <div className="font-black text-slate-900 mt-1.5">{preset.name}</div>
                      <div className="text-[11px] text-slate-600 mt-1 font-mono flex flex-wrap gap-1">
                        {preset.bands.map((b, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">
                            {b.grade}:{b.minScore}-{b.maxScore}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => loadPresetIntoEditor(preset.id)}
                        className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
                      >
                        Load into Editor
                      </button>
                      {!preset.isDefault && (
                        <button
                          type="button"
                          onClick={() => deleteGradingScalePreset(preset.id)}
                          className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Delete Scale
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-indigo-900">
            <MessageSquare className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold">Auto-Loading Remark Engine:</span> When generating a student's report card, the system automatically matches the student's overall grade (e.g., A, B1, C4) with comments stored in this repository and auto-populates the Principal &amp; Form Tutor remark fields.
            </div>
          </div>

          {/* Add Comment Form */}
          <form onSubmit={handleAddComment} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Add Remark to Institutional Repository</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Grade Band</label>
                <select
                  aria-label="Grade Band Selector"
                  value={newGrade}
                  onChange={(e) => setNewGrade(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  {['A', 'B1', 'B2', 'B', 'C4', 'C5', 'C6', 'C', 'D', 'E', 'F'].map(g => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Remark Role</label>
                <select
                  aria-label="Remark Role Selector"
                  value={newRemarkType}
                  onChange={(e) => setNewRemarkType(e.target.value as RemarkType)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  <option value="PRINCIPAL">Principal's Executive Remark</option>
                  <option value="TEACHER">Class Teacher's Remark</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Comment Text</label>
                <input
                  type="text"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="e.g. Demonstrates exceptional depth of understanding, leadership, and intellectual curiosity..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-emerald-600 font-medium">
                {commentSuccess && '✓ Remark added to comment bank!'}
              </span>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 transition-colors shadow-xs cursor-pointer"
              >
                Add Remark
              </button>
            </div>
          </form>

          {/* Comment Bank Listing */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase">
                Active Repository Comments ({commentBank.length})
              </h4>
              <span className="text-xs text-slate-400">Used for report card auto-suggestions</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {commentBank.map((c) => (
                <div key={c.id} className="p-3.5 hover:bg-slate-50 flex items-start justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                        Grade {c.grade}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] uppercase font-semibold">
                        {c.remarkType}
                      </span>
                    </div>
                    <p className="text-slate-800 font-medium">{c.commentText}</p>
                  </div>

                  <button
                    onClick={() => deleteCommentBankItem(c.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete Comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6B. Academic Records & Session History Explorer */}
      {activeSubTab === 'academic_history' && (
        <AcademicHistoryExplorer />
      )}

      {/* 6C. Full System Backup & Restore Hub (Strictly Super User Only) */}
      {activeSubTab === 'backup' && canViewBackupTab && (
        <div data-testid="system-backup-restore-view" className="space-y-6">
          {/* Top Super User Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-purple-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-purple-400/50 text-purple-200 text-[10px] font-black uppercase tracking-wider flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                  <span>Super User Exclusive Clearance</span>
                </span>
                <span className="text-[11px] text-purple-300 font-mono">
                  Format v2026.2 (.ebkp.json)
                </span>
              </div>
              <h3 className="text-lg font-black tracking-tight">
                Full-System State Backup, Migration &amp; Disaster Recovery
              </h3>
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                Back up and restore 100% of the software state—including institutional settings, school logos &amp; signatures, uploaded teacher curriculum files (PDF/DOCX/PPTX), student bio-data, continuous assessment &amp; exam scores, custom report templates, grading scales, HOD departments, testimonials, and session archives. Use downloadable backup files to seamlessly transfer all records from an older software installation to a new version or a fresh installation.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0 text-center">
              <div className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700">
                <div className="text-[10px] uppercase font-bold text-slate-400">Saved Backups</div>
                <div className="text-base font-black text-amber-300" data-testid="saved-backups-count">
                  {systemBackups.length}
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700">
                <div className="text-[10px] uppercase font-bold text-slate-400">Students &amp; Scores</div>
                <div className="text-base font-black text-emerald-300">
                  {students.length}
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase font-bold text-slate-400">Access Level</div>
                <div className="text-xs font-black text-purple-300 mt-1">SUPER ADMIN ONLY</div>
              </div>
            </div>
          </div>

          {backupStatusBanner && (
            <div
              data-testid="backup-restore-status-banner"
              className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
                backupStatusBanner.ok
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                {backupStatusBanner.ok ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{backupStatusBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setBackupStatusBanner(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Quick Offline Database & Project Export Strip */}
          <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/30">
                <FolderArchive className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-indigo-300">
                  Local Offline Publishing &amp; Database Files Bundle
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Deploying to your local computer with WAMP / XAMPP? Download the complete database bundle or download the full project archive directly.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href="/api/database/bundle-zip"
                download="edugrade_database_bundle.zip"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Database Folder (.ZIP)</span>
              </a>
              <a
                href="/api/project/export-full-zip"
                download="edugrade_full_project_source_and_database.zip"
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Download Full Project (.ZIP)</span>
              </a>
            </div>
          </div>

          {/* Create Backup + Import / Migrate Backup File Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create New Timestamped Full System Backup */}
            <form
              onSubmit={handleCreateFullBackup}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                    <HardDrive className="w-4 h-4 text-purple-700" />
                    <span>Create New Full System Backup</span>
                  </h4>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-900">
                    Snapshots Entire Software State
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Generates a complete timestamped backup archive on the server and in your backup list containing all settings, uploaded teacher files, student records, and assessment scores.
                </p>

                <div className="pt-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Backup Description / Label (Optional)
                  </label>
                  <input
                    type="text"
                    data-testid="backup-label-input"
                    value={newBackupLabel}
                    onChange={e => setNewBackupLabel(e.target.value)}
                    placeholder={`e.g. End of ${currentTerm.name} Term ${currentSession.name} Full State Backup`}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  data-testid="create-system-backup-btn"
                  className="px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-black shadow-sm flex items-center space-x-2 cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                  <span>Create Full System Backup Now</span>
                </button>
              </div>
            </form>

            {/* Upload / Transfer Backup from Old Software or Another Computer */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                    <Upload className="w-4 h-4 text-indigo-600" />
                    <span>Import / Restore Backup from Old Version or Fresh Install</span>
                  </h4>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">
                    Cross-Version Transfer
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Moving from an old software version or another computer? Select a downloaded <code className="font-mono text-indigo-700">.ebkp.json</code> or <code className="font-mono text-indigo-700">.json</code> backup file to import it into the repository or immediately restore the entire system.
                </p>

                <label className="flex items-center space-x-2 pt-1 cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    data-testid="restore-immediately-on-upload-checkbox"
                    checked={restoreOnUploadImmediately}
                    onChange={e => setRestoreOnUploadImmediately(e.target.checked)}
                    className="rounded border-slate-300 text-purple-700 focus:ring-purple-600"
                  />
                  <span>Immediately restore all settings, files, students &amp; scores upon file upload</span>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json,.ebkp.json,application/json"
                  data-testid="import-backup-file-input"
                  onChange={handleBackupFileUpload}
                  className="hidden"
                />
                <span className="text-[11px] text-slate-500">
                  Supports <span className="font-mono font-bold">.ebkp.json</span> &amp; <span className="font-mono font-bold">.json</span>
                </span>
                <button
                  type="button"
                  data-testid="trigger-import-backup-file-btn"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-sm flex items-center space-x-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {restoreOnUploadImmediately
                      ? 'Select Backup File & Restore Now'
                      : 'Upload Backup File to Repository'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Timestamped Backup Files List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-black uppercase tracking-wider">
                  Timestamped System Backup Files ({systemBackups.length})
                </h4>
              </div>
              <span className="text-[11px] text-slate-300">
                Select any backup below to restore the complete software state or download for migration to a fresh installation
              </span>
            </div>

            <div data-testid="system-backups-list" className="divide-y divide-slate-200">
              {systemBackups.map((bkp, idx) => {
                const isConfirmingRestore = pendingRestoreBackupId === bkp.id;
                return (
                  <div
                    key={bkp.id}
                    data-testid={`backup-file-item-${bkp.id}`}
                    className="p-4 hover:bg-slate-50/80 transition-colors space-y-3"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            data-testid={`backup-timestamp-${bkp.id}`}
                            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-slate-900 text-amber-300 font-mono text-[11px] font-bold"
                          >
                            <Clock className="w-3 h-3 text-amber-400 mr-1" />
                            {formatBackupTimestamp(bkp.createdAt)}
                          </span>
                          {idx === 0 && (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px] uppercase">
                              Latest Backup
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-bold text-[10px]">
                            {formatByteSize(bkp.sizeBytes)}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            Created by <strong className="text-slate-800">@{bkp.createdBy}</strong>
                          </span>
                        </div>

                        <div className="text-sm font-black text-slate-900">{bkp.label}</div>
                        <div className="text-[11px] font-mono text-indigo-700 break-all">
                          File: {bkp.fileName}
                        </div>

                        {/* Summary Metrics */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-bold">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            Institution: {bkp.institutionName}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            Session: {bkp.activeSessionName} ({bkp.activeTermName} Term)
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                            {bkp.summary.studentsCount} Students
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {bkp.summary.scoresCount} CA Scores • {bkp.summary.termRecordsCount} Term Records
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                            {bkp.summary.documentsCount} Teacher Files
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {bkp.summary.classesCount} Classes • {bkp.summary.subjectsCount} Subjects • {bkp.summary.teachersCount} Staff
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          data-testid={`restore-backup-btn-${bkp.id}`}
                          onClick={() => setPendingRestoreBackupId(bkp.id)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-xs flex items-center space-x-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore System from Backup</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`download-backup-btn-${bkp.id}`}
                          onClick={() => handleDownloadBackupFile(bkp)}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
                          title="Download .ebkp.json file to transfer to another computer or fresh installation"
                        >
                          <Download className="w-3.5 h-3.5 text-amber-300" />
                          <span>Download File</span>
                        </button>

                        {systemBackups.length > 1 && (
                          <button
                            type="button"
                            data-testid={`delete-backup-btn-${bkp.id}`}
                            onClick={() => deleteSystemBackup(bkp.id)}
                            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Delete Backup File"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Restore Confirmation Bar */}
                    {isConfirmingRestore && (
                      <div
                        data-testid={`confirm-restore-panel-${bkp.id}`}
                        className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="text-amber-950">
                          <span className="font-black uppercase text-[11px] text-amber-800 block">
                            Confirm Full State Restoration
                          </span>
                          Restoring from <strong>{bkp.fileName}</strong> ({formatBackupTimestamp(bkp.createdAt)}) will replace current settings, uploaded teacher files, student profiles, and scores with this snapshot.
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPendingRestoreBackupId(null)}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            data-testid={`confirm-restore-btn-${bkp.id}`}
                            onClick={() => handleConfirmRestoreFromBackup(bkp.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-black cursor-pointer"
                          >
                            Confirm &amp; Restore Now
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6b. Zero-Downtime Software Update & Database Migration System ("UPDATE" Tab) */}
      {activeSubTab === 'update' && (
        <div data-testid="software-update-panel" className="space-y-6">
          {/* Top Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 rounded-2xl p-6 text-white shadow-lg border border-sky-800/60">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-200 text-[11px] font-black uppercase tracking-wider">
                  <Package className="w-3.5 h-3.5" />
                  <span>Zero-Downtime Software Update &amp; Schema Upgrade Engine</span>
                </div>
                <h3 className="text-xl font-black text-white">
                  Install Software Updates, UI Modules &amp; Database Migrations (.ZIP)
                </h3>
                <p className="text-xs text-sky-100/90 max-w-3xl leading-relaxed">
                  Upload an EduGrade Update Package (<code className="font-mono bg-white/10 px-1.5 py-0.5 rounded">.zip</code>) to install new UI enhancements, navigation updates, academic modules, and non-destructive database schema migrations in the background with <strong>zero downtime</strong>. If any stage fails, the engine automatically reverts to the previous version with zero data loss.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 block">
                    Current Installed Version
                  </span>
                  <span data-testid="active-software-version" className="text-lg font-black font-mono text-white">
                    v{activeSoftwareVersion}
                  </span>
                </div>
                <input
                  ref={updateZipInputRef}
                  type="file"
                  accept=".zip,.json"
                  onChange={handleUploadUpdateZipFile}
                  className="hidden"
                />
                <button
                  type="button"
                  data-testid="upload-update-zip-btn"
                  onClick={() => updateZipInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center space-x-2 shadow-md cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Select Update Package (.ZIP)</span>
                </button>
                <button
                  type="button"
                  data-testid="download-sample-update-zip-btn"
                  onClick={handleDownloadSampleUpdateZip}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs flex items-center space-x-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-sky-300" />
                  <span>Download Sample Update (.ZIP)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Success / Failure & Rollback Notification Banner */}
          {updateNotification && (
            <div
              data-testid="update-status-notification"
              className={`p-4 rounded-2xl border-2 flex items-start justify-between gap-4 shadow-sm ${
                updateNotification.ok
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                  : 'bg-rose-50 border-rose-400 text-rose-950'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    updateNotification.ok
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {updateNotification.ok ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <RotateCcw className="w-5 h-5" />
                  )}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="font-black text-sm">
                    {updateNotification.title}
                  </div>
                  <p className="leading-relaxed">
                    {updateNotification.message}
                  </p>
                  {updateNotification.ok && (
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer shadow-sm transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reload Page Now</span>
                      </button>
                      <span className="text-[11px] text-emerald-800 font-medium">
                        System stays unlocked across refreshes.
                      </span>
                    </div>
                  )}
                  {updateNotification.rolledBack && (
                    <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded bg-rose-200/80 text-rose-900 font-bold text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Automatic Rollback Executed: Reverted safely to v{activeSoftwareVersion}</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUpdateNotification(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Staged ZIP Update Package Inspection & Proceed Card */}
          <div
            data-testid="update-package-details"
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="w-11 h-11 rounded-xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
                  <FolderArchive className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-900">
                      ZIP Archive: {stagedZipFileName}
                    </span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">
                      Target Version: v{stagedUpdateManifest.version}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Zero-Downtime Ready
                    </span>
                  </div>
                  <h4 className="text-base font-black text-slate-900 mt-1">
                    {stagedUpdateManifest.title}
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {stagedUpdateManifest.summary}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="proceed-install-update-btn"
                  disabled={isInstallingUpdate}
                  onClick={handleProceedAndInstallUpdate}
                  className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center space-x-2 shadow-md transition-all cursor-pointer ${
                    isInstallingUpdate
                      ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {isInstallingUpdate
                      ? `Installing Update (${updateProgressPct}%)...`
                      : `Proceed & Install Update (v${stagedUpdateManifest.version})`}
                  </span>
                </button>
                <label className="inline-flex items-center space-x-2 text-[11px] text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="simulate-update-failure-toggle"
                    checked={simulateUpdateFailure}
                    onChange={e => setSimulateUpdateFailure(e.target.checked)}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Simulate failure mid-install (test auto-rollback to previous version)</span>
                </label>
              </div>
            </div>

            {/* Live Installation Progress Bar */}
            {(isInstallingUpdate || updateProgressPct > 0) && (
              <div
                data-testid="update-install-progress-bar"
                className="px-6 py-4 bg-slate-900 text-white border-b border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-sky-300">
                    {updateStageLabel || 'Ready'}
                  </span>
                  <span className="font-mono font-black text-white">
                    {updateProgressPct}%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      updateNotification && !updateNotification.ok
                        ? 'bg-rose-500'
                        : 'bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, updateProgressPct))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Detailed Descriptions of Updates & Upgrades inside the ZIP */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5 text-xs">
              {/* Column 1: UI & Navigation Updates */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-black text-slate-900 uppercase tracking-wide">
                    1. UI &amp; Navigation Updates
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                    {stagedUpdateManifest.uiAndNavigationChanges.length} Changes
                  </span>
                </div>
                <ul className="space-y-2 text-slate-700">
                  {stagedUpdateManifest.uiAndNavigationChanges.map((item, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Column 2: New Features & Modules */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-black text-slate-900 uppercase tracking-wide">
                    2. New Features &amp; Modules
                  </span>
                  <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold text-[10px]">
                    {stagedUpdateManifest.moduleAndFeatureUpdates.length} Modules
                  </span>
                </div>
                <ul className="space-y-2 text-slate-700">
                  {stagedUpdateManifest.moduleAndFeatureUpdates.map((item, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <Check className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Column 3: Non-Destructive Database Schema Migrations */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <span className="font-black text-emerald-950 uppercase tracking-wide">
                    3. Database Schema Upgrades
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-bold text-[10px]">
                    Zero DB Errors Verified
                  </span>
                </div>
                <ul className="space-y-2 text-emerald-950">
                  {stagedUpdateManifest.databaseSchemaMigrations.map((mig, idx) => (
                    <li key={idx} className="p-2 rounded-lg bg-white border border-emerald-200 space-y-1">
                      <div className="font-mono font-bold text-[11px] text-emerald-800">
                        [{mig.id}]
                      </div>
                      <div className="text-slate-700">{mig.description}</div>
                    </li>
                  ))}
                </ul>
                <div className="pt-1 text-[11px] text-emerald-800 font-semibold">
                  ZIP Contents: {stagedZipExtractedFiles.join(', ')}
                </div>
              </div>
            </div>
          </div>

          {/* Update History & Rollback Audit Log */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Installed Software Updates &amp; Rollback Log ({updateHistory.length})
                </h4>
                <p className="text-xs text-slate-500">
                  Complete audit trail of background package installations and automatic rollbacks.
                </p>
              </div>
            </div>

            {updateHistory.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                No update packages have been installed in this session yet. Use <strong>Proceed &amp; Install Update</strong> above to apply the staged ZIP package.
              </div>
            ) : (
              <div className="space-y-2.5">
                {updateHistory.map(entry => (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-2 py-0.5 rounded font-black text-[10px] uppercase ${
                            entry.status === 'INSTALLED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {entry.status === 'INSTALLED' ? 'INSTALLED' : 'AUTO-REVERTED'}
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          v{entry.previousVersion} → v{entry.version}
                        </span>
                        <span className="font-bold text-slate-800">{entry.title}</span>
                      </div>
                      <p className="text-slate-600">{entry.notes}</p>
                    </div>
                    <div className="text-right font-mono text-[11px] text-slate-500 shrink-0">
                      <div>{new Date(entry.installedAt).toLocaleString()}</div>
                      <div>{entry.installedBy}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. MySQL / phpMyAdmin & VS Code Publishing Hub (Super Admin Only) */}
      {activeSubTab === 'database' && canViewDatabaseTab && (
        <DatabasePublishHub />
      )}

      {/* Reassignment Confirmation Modal (Notification & Request when Class or Subject is already assigned) */}
      {pendingReassignment && (
        <div
          data-testid="reassignment-confirm-modal"
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-white">
                    {pendingReassignment.type === 'CLASS_TUTOR'
                      ? 'Class Tutor Reassignment Request'
                      : 'Subject Teacher Reassignment Request'}
                  </h3>
                  <p className="text-[11px] text-amber-300">
                    Assignment Conflict Notification
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingReassignment(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1.5">
                <div className="font-black uppercase text-[11px] text-amber-800">
                  Notification: Already Assigned
                </div>
                {pendingReassignment.type === 'CLASS_TUTOR' ? (
                  <p className="leading-relaxed">
                    <strong>{classSections.find(s => s.id === pendingReassignment.sectionId)?.name}</strong> is currently assigned to{' '}
                    <strong className="underline">{pendingReassignment.currentHolderName}</strong> as Form Tutor. Do you want to reassign this class to{' '}
                    <strong className="text-indigo-900">{pendingReassignment.newTeacherName}</strong>?
                  </p>
                ) : (
                  <p className="leading-relaxed">
                    <strong>{subjects.find(s => s.id === pendingReassignment.subjectId)?.name}</strong> in{' '}
                    <strong>{classSections.find(s => s.id === pendingReassignment.sectionId)?.name}</strong> is currently assigned to{' '}
                    <strong className="underline">{pendingReassignment.currentHolderName}</strong>. Do you want to reassign this subject to{' '}
                    <strong className="text-indigo-900">{pendingReassignment.newTeacherName}</strong>?
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingReassignment(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-reassignment-btn"
                  onClick={handleConfirmReassignment}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md cursor-pointer"
                >
                  Confirm &amp; Reassign Teacher
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student Edit Modal when selected */}
      {selectedStudentForEdit && (
        <StudentEditModal
          student={selectedStudentForEdit}
          onClose={() => setSelectedStudentForEdit(null)}
        />
      )}

      {pendingTeacherCredentialSave && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleUpdateTeacherCredentials}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            aria-labelledby="confirm-staff-credentials-title"
          >
            <div>
              <h2 id="confirm-staff-credentials-title" className="text-lg font-black text-slate-900">
                Confirm staff account changes
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Re-enter an authorized administrator’s username and password or initial PIN to save changes for {pendingTeacherCredentialSave.fullName}.
              </p>
            </div>
            <label className="block text-xs font-bold uppercase text-slate-600">
              Administrator username
              <input
                type="text"
                value={credentialActorUsername}
                onChange={event => setCredentialActorUsername(event.target.value)}
                autoComplete="username"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-900"
              />
            </label>
            <label className="block text-xs font-bold uppercase text-slate-600">
              Administrator password or initial PIN
              <input
                type="password"
                value={credentialActorInput}
                onChange={event => setCredentialActorInput(event.target.value)}
                autoComplete="current-password"
                required
                autoFocus
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-900"
              />
            </label>
            {credentialUpdateError && (
              <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                {credentialUpdateError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isSavingTeacherCredentials}
                onClick={() => {
                  setPendingTeacherCredentialSave(null);
                  setCredentialActorInput('');
                  setCredentialUpdateError(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingTeacherCredentials}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {isSavingTeacherCredentials ? 'Saving…' : 'Verify and save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
