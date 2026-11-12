/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  TeacherDocumentCategory,
  AllowedDocExtension,
  TermName,
  Student,
  TeacherDocumentUpload
} from '../types/index';
import {
  getTeachersCornerTabTitle,
  getTeacherHodDesignation,
  getDepartmentForSubject
} from '../utils/rbacAndAuth';
import { determineGrade } from '../utils/academicCalculations';
import { formatSortedDocumentDownloadName } from '../utils/documentCacheEngine';
import { uploadDocumentToCloud } from '../utils/cloudDocumentStorage';
import {
  Briefcase,
  BookOpen,
  Users,
  Bell,
  Send,
  Upload,
  FileText,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  Award,
  Edit3,
  Plus,
  Trash2,
  X,
  Lock,
  ChevronRight,
  FolderCheck,
  Sparkles,
  Download,
  FolderDown,
  Building2,
  Cpu,
  CheckSquare,
  Square,
  UserCheck
} from 'lucide-react';

interface TeachersCornerViewProps {
  onOpenReportCard?: (studentId: number) => void;
}

const WEEKS_1_TO_14 = Array.from({ length: 14 }, (_, i) => i + 1);

const CATEGORY_LABELS: Record<TeacherDocumentCategory, string> = {
  SCHEME_OF_WORK: 'Scheme of Work',
  LESSON_PLAN: 'Lesson Plan',
  LESSON_NOTES: 'Lesson Notes',
  EXAM_QUESTIONS: 'Exam Questions'
};

export const TeachersCornerView: React.FC<TeachersCornerViewProps> = ({
  onOpenReportCard
}) => {
  const {
    currentRole,
    currentUser,
    currentTerm,
    currentSession,
    teachers,
    classSections,
    subjects,
    students,
    enrollments,
    termSubjectRecords,
    updateTermSubjectScore,
    officeMessages,
    sendOfficeMessage,
    markOfficeMessageAsRead,
    deleteOfficeMessage,
    requiredDocumentSlots,
    createRequiredDocumentSlot,
    deleteRequiredDocumentSlot,
    teacherDocumentUploads,
    uploadTeacherDocument,
    queueOfflineDocumentUpload,
    addExecutiveRemarkToDocument,
    deleteTeacherDocument,
    academicDepartments,
    saveAcademicDepartment,
    deleteAcademicDepartment,
    updateTeacherCredentials,
    requestPasswordResetForUsername
  } = useApp();

  const isExecutive =
    currentRole === 'SUPER_ADMIN' ||
    currentRole === 'PRINCIPAL' ||
    currentRole === 'HEAD_OF_SCHOOLS' ||
    currentRole === 'VICE_PRINCIPAL';

  const baseOfficeTitle = getTeachersCornerTabTitle(currentRole);

  // All staff use the same materials, profile, and messages workspace.
  const [activeWorkspace, setActiveWorkspace] = useState<'TEACHER_CORNER' | 'EXECUTIVE_OFFICE' | 'PROFILE'>(
    'TEACHER_CORNER'
  );

  // Messages Drawer / Modal
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);

  // Resolve the signed-in staff member for HOD materials and messages.
  const activeTeacher = useMemo(() => {
    const matched = teachers.find(
      t =>
        t.id === currentUser.id ||
        (t.username && currentUser.username && t.username.toLowerCase() === currentUser.username.toLowerCase())
    );
    return matched;
  }, [teachers, currentUser]);

  const cornerTeacher = activeTeacher;
  const [selectedTeacherIdForCorner, setSelectedTeacherIdForCorner] = useState<number>(
    activeTeacher?.id || 0
  );

  // Resolve Head of Department (HOD) designation for the active / inspected teacher
  const cornerTeacherHodInfo = useMemo(
    () =>
      getTeacherHodDesignation(
        cornerTeacher?.id,
        academicDepartments,
        cornerTeacher?.username,
        cornerTeacher?.fullName
      ),
    [cornerTeacher, academicDepartments]
  );

  const officeTitle = useMemo(() => {
    if (!isExecutive && cornerTeacherHodInfo.isHod && cornerTeacherHodInfo.officeTitle) {
      return `${baseOfficeTitle} • ${cornerTeacherHodInfo.officeTitle}`;
    }
    return baseOfficeTitle;
  }, [isExecutive, baseOfficeTitle, cornerTeacherHodInfo]);

  const assignedCards = useMemo(
    () =>
      (cornerTeacher?.assignedSubjects || []).flatMap(assignment => {
        const section = classSections.find(item => item.id === Number(assignment.sectionId));
        const subject = subjects.find(item => item.id === Number(assignment.subjectId));
        if (!section || !subject) return [];
        return [{
          key: `${section.id}_${subject.id}`,
          sectionId: section.id,
          sectionName: section.name,
          levelType: section.levelType,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code,
          studentCount: students.filter(student => student.currentSectionId === section.id).length,
          isFormClass: cornerTeacher?.assignedSectionId === section.id
        }];
      }),
    [cornerTeacher, classSections, subjects, students]
  );
  const [selectedCardKey, setSelectedCardKey] = useState('');
  const activeCard = assignedCards.find(card => card.key === selectedCardKey) || assignedCards[0] || null;
  const activeCardStudents = activeCard
    ? students.filter(student => student.currentSectionId === activeCard.sectionId)
    : [];

  const [inspectingStudent, setInspectingStudent] = useState<Student | null>(null);
  const [scoreSaveNotice, setScoreSaveNotice] = useState<string | null>(null);

  // Teacher Document Upload Form State
  const [selectedSlotId, setSelectedSlotId] = useState<string>(
    requiredDocumentSlots[0]?.id || ''
  );
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<TeacherDocumentCategory>('LESSON_NOTES');
  const [docSectionId, setDocSectionId] = useState<number>(classSections[0]?.id || 1);
  const [docSubjectId, setDocSubjectId] = useState<number>(subjects[0]?.id || 1);
  const [docWeekNumber, setDocWeekNumber] = useState<number>(1);
  const [docExtension, setDocExtension] = useState<AllowedDocExtension>('PDF');
  const [docFileSizeKb, setDocFileSizeKb] = useState<number>(350);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadSuccessBanner, setUploadSuccessBanner] = useState<string | null>(null);
  const [uploadErrorBanner, setUploadErrorBanner] = useState<string | null>(null);

  // Executive Office: Send Message Form State
  const [msgRecipientId, setMsgRecipientId] = useState<string>('ALL');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [msgPriority, setMsgPriority] = useState<'NORMAL' | 'IMPORTANT' | 'URGENT'>('IMPORTANT');
  const [msgSentNotice, setMsgSentNotice] = useState<string | null>(null);
  const [profileFullName, setProfileFullName] = useState(currentUser.fullName);
  const [profileUsername, setProfileUsername] = useState(currentUser.username || '');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profileCurrentCredential, setProfileCurrentCredential] = useState('');
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    setProfileFullName(currentUser.fullName);
    setProfileUsername(currentUser.username || '');
  }, [currentUser.fullName, currentUser.username]);

  const profileTeacher = useMemo(
    () =>
      teachers.find(
        teacher =>
          teacher.id === currentUser.id ||
          (teacher.username && currentUser.username &&
            teacher.username.toLowerCase() === currentUser.username.toLowerCase())
      ),
    [teachers, currentUser.id, currentUser.username]
  );
  const profileHodInfo = useMemo(
    () =>
      getTeacherHodDesignation(
        currentUser.id,
        academicDepartments,
        currentUser.username,
        currentUser.fullName
      ),
    [currentUser.id, currentUser.username, currentUser.fullName, academicDepartments]
  );
  const profileMessages = useMemo(
    () =>
      officeMessages.filter(
        message =>
          message.recipientTeacherId === 'ALL' ||
          Number(message.recipientTeacherId) === Number(currentUser.id)
      ),
    [officeMessages, currentUser.id]
  );

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileMessage(null);
    setIsSavingProfile(true);
    try {
      const result = await updateTeacherCredentials({
        teacherId: currentUser.id,
        username: profileUsername.trim().toLowerCase(),
        fullName: profileFullName.trim(),
        newPassword: profileNewPassword,
        actorUsername: (currentUser.username || '').toLowerCase(),
        actorCredential: profileCurrentCredential
      });
      setProfileMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setProfileNewPassword('');
        setProfileCurrentCredential('');
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleOwnPasswordResetRequest = async () => {
    const result = await requestPasswordResetForUsername(currentUser.username || '');
    setProfileMessage({ ok: result.ok, text: result.message });
  };

  // Executive Office: Create Required Document Slot Form State
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotCategory, setNewSlotCategory] = useState<TeacherDocumentCategory>('LESSON_PLAN');
  const [newSlotWeek, setNewSlotWeek] = useState<string>('ALL');
  const [newSlotInstructions, setNewSlotInstructions] = useState('');
  const [slotNotice, setSlotNotice] = useState<string | null>(null);

  // Executive Office: Create / Manage Heads of Department (HOD) State
  const [deptIdBeingEdited, setDeptIdBeingEdited] = useState<string>('');
  const [deptNameInput, setDeptNameInput] = useState('');
  const [deptCodeInput, setDeptCodeInput] = useState('');
  const [deptHodTeacherId, setDeptHodTeacherId] = useState<number>(teachers[10]?.id || teachers[0]?.id || 11);
  const [deptSubjectIds, setDeptSubjectIds] = useState<number[]>([1, 3, 6]);
  const [deptDescription, setDeptDescription] = useState('');
  const [hodSavedNotice, setHodSavedNotice] = useState<string | null>(null);

  // Executive Office: Filter & Sort Teacher Files Panel
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>('ALL');
  const [filterTeacherId, setFilterTeacherId] = useState<string>('ALL');
  const [filterSectionId, setFilterSectionId] = useState<string>('ALL');
  const [filterSubjectId, setFilterSubjectId] = useState<string>('ALL');
  const [filterWeek, setFilterWeek] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'WEEK' | 'TEACHER' | 'SUBJECT' | 'CLASS' | 'DEPARTMENT'>('WEEK');

  // Redis / Write-Through LRU Document Cache Status & Download Banner
  const [cacheTelemetry, setCacheTelemetry] = useState<{
    backend: string;
    hits: number;
    misses: number;
    cachedEntries: number;
    etag: string;
  }>({
    backend: 'MEMORY_LRU_WRITE_THROUGH',
    hits: 14,
    misses: 1,
    cachedEntries: teacherDocumentUploads.length,
    etag: 'W/"bhs-doc-cache"'
  });
  const [downloadActionNotice, setDownloadActionNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/cache/status')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.stats) {
          setCacheTelemetry({
            backend: data.stats.backend || 'MEMORY_LRU_WRITE_THROUGH',
            hits: Number(data.stats.hits ?? 14),
            misses: Number(data.stats.misses ?? 1),
            cachedEntries: Number(data.stats.cachedEntries ?? teacherDocumentUploads.length),
            etag: data.stats.etag || 'W/"bhs-doc-cache"'
          });
        }
      })
      .catch(() => {});
  }, [teacherDocumentUploads.length]);

  // Executive & HOD Remark input state per document ID
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [statusDrafts, setStatusDrafts] = useState<
    Record<string, 'PENDING_REVIEW' | 'APPROVED' | 'NEEDS_REVISION'>
  >({});
  const [hodStatusDrafts, setHodStatusDrafts] = useState<
    Record<string, 'HOD_PENDING' | 'HOD_REVIEWED' | 'HOD_APPROVED' | 'HOD_REVISION'>
  >({});

  // Unread messages for current teacher
  const relevantMessages = useMemo(() => {
    const teacherId = currentUser.id;
    return officeMessages.filter(
      m => m.recipientTeacherId === 'ALL' || Number(m.recipientTeacherId) === Number(teacherId)
    );
  }, [officeMessages, currentUser.id]);

  const unreadMessageCount = useMemo(() => {
    const teacherId = currentUser.id;
    return relevantMessages.filter(m => !m.readByTeacherIds.includes(teacherId)).length;
  }, [relevantMessages, currentUser.id]);

  // Handle file input selection (.pdf, .docx, .pptx)
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'pdf' && extension !== 'docx' && extension !== 'pptx') {
      setSelectedUploadFile(null);
      setUploadErrorBanner('Only PDF, DOCX, and PPTX files are supported.');
      e.target.value = '';
      return;
    }
    setSelectedUploadFile(file);
    setUploadErrorBanner(null);
    setDocFileSizeKb(Math.max(12, Math.round(file.size / 1024)));
    if (extension === 'docx') {
      setDocExtension('DOCX');
    } else if (extension === 'pptx') {
      setDocExtension('PPTX');
    } else {
      setDocExtension('PDF');
    }
    if (!docTitle.trim()) {
      setDocTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const handleTeacherUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = docTitle.trim();
    if (!cleanTitle || !selectedUploadFile) {
      setUploadErrorBanner('Choose a PDF, DOCX, or PPTX file before uploading.');
      return;
    }
    if (selectedUploadFile.size > 15 * 1024 * 1024) {
      setUploadErrorBanner('The selected file exceeds the 15 MB upload limit.');
      return;
    }

    const sec = classSections.find(s => s.id === Number(docSectionId)) || classSections[0];
    const sub = subjects.find(s => s.id === Number(docSubjectId)) || subjects[0];
    if (!sec || !sub) {
      setUploadErrorBanner('Select a valid class and subject before uploading.');
      return;
    }

    const uploadMetadata = {
      slotId: selectedSlotId || undefined,
      documentTitle: cleanTitle,
      category: docCategory,
      fileExtension: docExtension,
      teacherId: currentUser.id,
      teacherName: currentUser.fullName,
      sectionId: sec.id,
      sectionName: sec.name,
      subjectId: sub.id,
      subjectName: sub.name,
      termName: currentTerm.name as TermName,
      weekNumber: docWeekNumber
    };

    if (!navigator.onLine) {
      const queued = await queueOfflineDocumentUpload(selectedUploadFile, {
        ...uploadMetadata,
        fileName: selectedUploadFile.name,
        fileSizeKb: docFileSizeKb
      });
      setIsUploadingDocument(false);
      if (queued.ok) {
        setUploadSuccessBanner(queued.message);
        setDocTitle('');
        setSelectedUploadFile(null);
        if (docFileInputRef.current) docFileInputRef.current.value = '';
      } else {
        setUploadErrorBanner(queued.message);
      }
      return;
    }

    setIsUploadingDocument(true);
    setUploadErrorBanner(null);
    try {
      const uploadId = globalThis.crypto.randomUUID();
      const result = await uploadDocumentToCloud(
        selectedUploadFile,
        uploadId,
        selectedUploadFile.name
      );

      uploadTeacherDocument({
        ...uploadMetadata,
        id: result.id,
        fileName: result.fileName,
        fileSizeKb: result.fileSizeKb || docFileSizeKb,
        fileStoragePath: result.fileStoragePath
      });

      setUploadSuccessBanner(
        `Uploaded "${cleanTitle}" (${docExtension}) for Week ${docWeekNumber} • ${sec.name} (${sub.name}).`
      );
      setDocTitle('');
      setSelectedUploadFile(null);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
      setTimeout(() => setUploadSuccessBanner(null), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Teacher document upload failed:', error);
      if (!navigator.onLine || error instanceof TypeError) {
        const queued = await queueOfflineDocumentUpload(selectedUploadFile, {
          ...uploadMetadata,
          fileName: selectedUploadFile.name,
          fileSizeKb: docFileSizeKb
        });
        if (queued.ok) {
          setUploadSuccessBanner(queued.message);
          setDocTitle('');
          setSelectedUploadFile(null);
          if (docFileInputRef.current) docFileInputRef.current.value = '';
        } else {
          setUploadErrorBanner(queued.message);
        }
      } else {
        setUploadErrorBanner(message);
      }
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleSendMessageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgSubject.trim() || !msgBody.trim()) return;

    const targetTeacher =
      msgRecipientId === 'ALL'
        ? null
        : teachers.find(t => t.id === Number(msgRecipientId));

    sendOfficeMessage({
      senderName: currentUser.fullName,
      senderRole: currentRole,
      recipientTeacherId: msgRecipientId === 'ALL' ? 'ALL' : Number(msgRecipientId),
      recipientTeacherName: targetTeacher ? targetTeacher.fullName : 'All Teaching Staff',
      subject: msgSubject.trim(),
      body: msgBody.trim(),
      priority: msgPriority
    });

    setMsgSentNotice(
      `Message "${msgSubject.trim()}" sent to ${targetTeacher ? targetTeacher.fullName : 'All Teaching Staff'}.`
    );
    setMsgSubject('');
    setMsgBody('');
    setTimeout(() => setMsgSentNotice(null), 4000);
  };

  const handleCreateSlotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotName.trim()) return;

    createRequiredDocumentSlot({
      name: newSlotName.trim(),
      category: newSlotCategory,
      targetTermName: currentTerm.name as TermName,
      targetWeek: newSlotWeek === 'ALL' ? 'ALL' : Number(newSlotWeek),
      instructions: newSlotInstructions.trim() || 'Upload in PDF, DOCX, or PPTX format.',
      createdBy: currentUser.fullName,
      createdByRole: currentRole
    });

    setSlotNotice(`Created required document slot: "${newSlotName.trim()}".`);
    setNewSlotName('');
    setNewSlotInstructions('');
    setTimeout(() => setSlotNotice(null), 4000);
  };

  const handleSaveDepartmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptNameInput.trim()) return;
    const hodTeacher = teachers.find(t => Number(t.id) === Number(deptHodTeacherId)) || teachers[0];
    if (!hodTeacher) return;

    const code =
      deptCodeInput.trim().toUpperCase() ||
      `DEPT-${deptNameInput
        .trim()
        .slice(0, 4)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')}`;

    const saved = saveAcademicDepartment({
      id: deptIdBeingEdited || undefined,
      name: deptNameInput.trim(),
      code,
      hodTeacherId: hodTeacher.id,
      hodTeacherName: hodTeacher.fullName,
      hodUsername: hodTeacher.username || hodTeacher.fullName.toLowerCase().replace(/\s+/g, '.'),
      subjectIds: deptSubjectIds,
      description:
        deptDescription.trim() ||
        `Departmental supervision of ${deptSubjectIds.length} curriculum subjects.`,
      createdByRole: currentRole,
      createdByName: currentUser.fullName
    });

    setHodSavedNotice(
      `Saved "${saved.name}" — Appointed ${saved.hodTeacherName} as Head of Department (${saved.subjectIds.length} subjects).`
    );
    setDeptIdBeingEdited('');
    setDeptNameInput('');
    setDeptCodeInput('');
    setDeptDescription('');
    setTimeout(() => setHodSavedNotice(null), 4500);
  };

  // Individual Document Download Handler (Served via Redis / Write-Through LRU Cache)
  const handleDownloadSingleDocument = async (
    doc: TeacherDocumentUpload,
    indexInSortedList = 0
  ) => {
    const sortedFileName = formatSortedDocumentDownloadName(doc, sortBy, indexInSortedList);
    try {
      const res = await fetch(
        `/api/documents/download/${encodeURIComponent(doc.id)}?sortBy=${encodeURIComponent(sortBy)}&index=${indexInSortedList}`
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = sortedFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setCacheTelemetry(prev => ({ ...prev, hits: prev.hits + 1 }));
        setDownloadActionNotice(`Downloaded original file "${sortedFileName}".`);
        setTimeout(() => setDownloadActionNotice(null), 4000);
        return;
      }
      const result = await res.json();
      throw new Error(result.error || 'Could not download the stored original file.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Teacher document download failed:', error);
      setDownloadActionNotice(message);
      setTimeout(() => setDownloadActionNotice(null), 5000);
    }
  };

  // Sorted Bulk Download Handler (Names each file systematically according to the active sort order)
  const handleBulkDownloadSortedDocuments = async (docsToDownload: TeacherDocumentUpload[]) => {
    if (docsToDownload.length === 0) return;

    try {
      const response = await fetch('/api/documents/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds: docsToDownload.map(doc => doc.id),
          sortBy,
        })
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Could not download the selected original files.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BHS_Teacher_Documents_By_${sortBy}_${docsToDownload.length}_Files.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setCacheTelemetry(prev => ({ ...prev, hits: prev.hits + 1 }));
      setDownloadActionNotice(`Downloaded ${docsToDownload.length} original document files as a ZIP.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Teacher document bulk download failed:', error);
      setDownloadActionNotice(message);
    }
    setTimeout(() => setDownloadActionNotice(null), 5000);
  };

  // Filtered and sorted teacher files for Principal / VP / Super Admin inspection
  const filteredExecutiveUploads = useMemo(() => {
    const filtered = teacherDocumentUploads.filter(doc => {
      const resolvedDeptId =
        doc.departmentId || getDepartmentForSubject(doc.subjectId, academicDepartments)?.id || '';
      if (filterDepartmentId !== 'ALL' && resolvedDeptId !== filterDepartmentId) return false;
      if (filterTeacherId !== 'ALL' && doc.teacherId !== Number(filterTeacherId)) return false;
      if (filterSectionId !== 'ALL' && doc.sectionId !== Number(filterSectionId)) return false;
      if (filterSubjectId !== 'ALL' && doc.subjectId !== Number(filterSubjectId)) return false;
      if (filterWeek !== 'ALL' && doc.weekNumber !== Number(filterWeek)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'WEEK') return a.weekNumber - b.weekNumber;
      if (sortBy === 'TEACHER') return a.teacherName.localeCompare(b.teacherName);
      if (sortBy === 'SUBJECT') return a.subjectName.localeCompare(b.subjectName);
      if (sortBy === 'CLASS') return a.sectionName.localeCompare(b.sectionName);
      if (sortBy === 'DEPARTMENT') {
        const deptA =
          a.departmentName || getDepartmentForSubject(a.subjectId, academicDepartments)?.name || '';
        const deptB =
          b.departmentName || getDepartmentForSubject(b.subjectId, academicDepartments)?.name || '';
        return deptA.localeCompare(deptB);
      }
      return 0;
    });
  }, [
    teacherDocumentUploads,
    academicDepartments,
    filterDepartmentId,
    filterTeacherId,
    filterSectionId,
    filterSubjectId,
    filterWeek,
    sortBy
  ]);

  // Departmental Documents visible to the appointed Head of Department (HOD)
  const hodDepartmentUploads = useMemo(() => {
    if (!cornerTeacherHodInfo.isHod) return [];
    const deptIds = new Set(cornerTeacherHodInfo.departments.map(d => d.id));
    const subjectIds = new Set(cornerTeacherHodInfo.hodSubjectIds.map(id => Number(id)));
    return teacherDocumentUploads
      .filter(
        doc =>
          (doc.departmentId && deptIds.has(doc.departmentId)) ||
          subjectIds.has(Number(doc.subjectId))
      )
      .sort((a, b) => {
        if (sortBy === 'WEEK') return a.weekNumber - b.weekNumber;
        if (sortBy === 'TEACHER') return a.teacherName.localeCompare(b.teacherName);
        if (sortBy === 'SUBJECT') return a.subjectName.localeCompare(b.subjectName);
        if (sortBy === 'CLASS') return a.sectionName.localeCompare(b.sectionName);
        return a.weekNumber - b.weekNumber;
      });
  }, [cornerTeacherHodInfo, teacherDocumentUploads, sortBy]);

  // Teacher's own uploaded documents along the 14-week timeline
  const teacherOwnUploads = useMemo(() => {
    if (!cornerTeacher) return teacherDocumentUploads;
    return teacherDocumentUploads
      .filter(d => d.teacherId === cornerTeacher.id)
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }, [teacherDocumentUploads, cornerTeacher]);

  return (
    <div data-testid="teachers-corner-view" className="space-y-6">
      {/* ================================================================= */}
      {/* TOP BANNER: ROLE-AWARE OFFICE / TEACHER'S CORNER + MESSAGE ICON   */}
      {/* ================================================================= */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-xl border border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-400/40 text-indigo-300 flex items-center justify-center shrink-0">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 data-testid="teachers-corner-heading" className="text-xl sm:text-2xl font-black tracking-tight">
                {officeTitle}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {currentSession.name} • Staff Workspace
              </span>
              {cornerTeacherHodInfo.isHod && (
                <span
                  data-testid="corner-hod-designation-badge"
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center space-x-1"
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-300" />
                  <span>{cornerTeacherHodInfo.designationBadge}</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Upload and manage teaching materials, review your profile, and read office messages.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            type="button"
            data-testid="office-materials-tab"
            onClick={() => setActiveWorkspace('TEACHER_CORNER')}
            aria-pressed={activeWorkspace === 'TEACHER_CORNER'}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
              activeWorkspace === 'TEACHER_CORNER'
                ? 'border-amber-500 bg-amber-600 text-white'
                : 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            <Upload className="h-4 w-4" />
            Upload Materials
          </button>

          <button
            type="button"
            data-testid="office-profile-tab"
            onClick={() => setActiveWorkspace('PROFILE')}
            aria-pressed={activeWorkspace === 'PROFILE'}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
              activeWorkspace === 'PROFILE'
                ? 'border-cyan-500 bg-cyan-600 text-white'
                : 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            My Profile
          </button>

          {/* Message Icon Button with Unread Count Badge */}
          <button
            type="button"
            data-testid="office-messages-icon-btn"
            onClick={() => setIsMessageModalOpen(true)}
            className="relative flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold cursor-pointer transition-colors"
            title="Messages & Directives from Principal, Vice Principal & Super Admin"
          >
            <Bell className="w-4 h-4 text-amber-400" />
            <span>Office Messages</span>
            <span
              data-testid="office-messages-badge"
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                unreadMessageCount > 0
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {unreadMessageCount > 0 ? `${unreadMessageCount} new` : relevantMessages.length}
            </span>
          </button>
        </div>
      </div>

      {activeWorkspace === 'PROFILE' && (
        <section data-testid="office-profile-panel" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-black text-slate-900">My Staff Profile</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Review your school assignments and update your own account credentials.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase text-indigo-800">
                  {getTeachersCornerTabTitle(currentRole)}
                </span>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">Form tutor class</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {profileTeacher?.assignedSectionId
                      ? classSections.find(section => section.id === profileTeacher.assignedSectionId)?.name || 'Class not found'
                      : 'Not assigned'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">HOD designation</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {profileHodInfo.isHod ? profileHodInfo.officeTitle || profileHodInfo.designationBadge : 'Not appointed'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">Assigned subjects</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {(profileTeacher?.assignedSubjects || []).length}
                  </div>
                </div>
              </div>

              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">
                My assigned class subjects
              </h3>
              {(profileTeacher?.assignedSubjects || []).length > 0 ? (
                <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(profileTeacher?.assignedSubjects || []).map((assignment, index) => {
                    const section = classSections.find(item => item.id === assignment.sectionId);
                    const subject = subjects.find(item => item.id === assignment.subjectId);
                    return (
                      <div key={`${assignment.sectionId}-${assignment.subjectId}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2">
                        <div className="text-xs font-bold text-slate-900">{subject?.name || 'Subject not found'}</div>
                        <div className="text-[11px] text-slate-500">{section?.name || 'Class not found'}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mb-5 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                  No subjects are assigned yet. Ask an authorized administrator to assign your teaching subjects.
                </p>
              )}

              <form onSubmit={handleProfileSave} className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">Account details</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500">
                    Full name
                    <input
                      value={profileFullName}
                      onChange={event => setProfileFullName(event.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold normal-case text-slate-900"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase text-slate-500">
                    Username
                    <input
                      value={profileUsername}
                      onChange={event => setProfileUsername(event.target.value)}
                      required
                      pattern="[A-Za-z0-9._-]{3,50}"
                      title="3–50 letters, numbers, dots, underscores, or hyphens"
                      autoComplete="username"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold normal-case text-slate-900"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase text-slate-500">
                    New password (optional)
                    <input
                      type="password"
                      value={profileNewPassword}
                      onChange={event => setProfileNewPassword(event.target.value)}
                      autoComplete="new-password"
                      placeholder="9+ characters, uppercase and number/symbol"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold normal-case text-slate-900"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase text-slate-500">
                    Current password or PIN (required to save)
                    <input
                      type="password"
                      value={profileCurrentCredential}
                      onChange={event => setProfileCurrentCredential(event.target.value)}
                      required
                      autoComplete="current-password"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold normal-case text-slate-900"
                    />
                  </label>
                </div>
                {profileMessage && (
                  <p role={profileMessage.ok ? 'status' : 'alert'} className={`rounded-lg p-3 text-xs font-semibold ${
                    profileMessage.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                  }`}>
                    {profileMessage.text}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                  >
                    {isSavingProfile ? 'Saving…' : 'Save my profile'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOwnPasswordResetRequest()}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-black text-amber-900"
                  >
                    Request PIN / password reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (profileTeacher) setSelectedTeacherIdForCorner(profileTeacher.id);
                      setActiveWorkspace('TEACHER_CORNER');
                    }}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-900"
                  >
                    Open my teaching, documents &amp; students
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-slate-900">Management messages</h2>
                <p className="text-[11px] text-slate-500">Messages addressed to you or all staff.</p>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-900">
                {profileMessages.length}
              </span>
            </div>
            <div className="max-h-[560px] space-y-2 overflow-y-auto">
              {profileMessages.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-500">
                  No management messages yet.
                </p>
              ) : profileMessages.map(message => {
                const isRead = message.readByTeacherIds.includes(currentUser.id);
                return (
                  <article key={message.id} className={`rounded-xl border p-3 ${
                    isRead ? 'border-slate-200 bg-slate-50' : 'border-amber-300 bg-amber-50'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-black text-slate-900">{message.title || message.subject || 'Management message'}</h3>
                      <span className="text-[10px] text-slate-500">{new Date(message.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{message.body}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                      <span>{message.senderName} · {message.senderRole.replace(/_/g, ' ')}</span>
                      {!isRead && (
                        <button
                          type="button"
                          onClick={() => markOfficeMessageAsRead(message.id, currentUser.id)}
                          className="font-bold text-indigo-700"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* WORKSPACE A: EXECUTIVE OFFICE (PRINCIPAL / VP / SUPER USER)       */}
      {/* ================================================================= */}
      {false && isExecutive && activeWorkspace === 'EXECUTIVE_OFFICE' && (
        <div data-testid="executive-office-panel" className="space-y-6">
          {/* Top Grid: 1. Send Message to Teachers  |  2. Create Document Names/Slots */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Send Message to Teachers */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900">
                      Send Message or Directive to Teachers
                    </h2>
                    <p className="text-xs text-slate-500">
                      Appears immediately in the Teacher&apos;s Corner message notification center
                    </p>
                  </div>
                </div>
              </div>

              {msgSentNotice && (
                <div
                  data-testid="message-sent-notice"
                  className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{msgSentNotice}</span>
                </div>
              )}

              <form onSubmit={handleSendMessageSubmit} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                      Recipient Teacher
                    </label>
                    <select
                      data-testid="office-msg-recipient-select"
                      value={msgRecipientId}
                      onChange={(e) => setMsgRecipientId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                    >
                      <option value="ALL">All Teaching Staff (Broadcast)</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.fullName} (@{t.username})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                      Priority Level
                    </label>
                    <select
                      value={msgPriority}
                      onChange={(e) => setMsgPriority(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                    >
                      <option value="NORMAL">Normal Update</option>
                      <option value="IMPORTANT">Important Directive</option>
                      <option value="URGENT">Urgent Action Required</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                    Message Subject / Title *
                  </label>
                  <input
                    type="text"
                    data-testid="office-msg-subject-input"
                    value={msgSubject}
                    onChange={(e) => setMsgSubject(e.target.value)}
                    placeholder="e.g., Week 5 Lesson Plan & Mid-Term CA Verification"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                    Message Content *
                  </label>
                  <textarea
                    rows={3}
                    data-testid="office-msg-body-input"
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    placeholder="Write detailed instructions or feedback for teachers..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    data-testid="send-office-msg-btn"
                    className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Dispatch Message to Teachers</span>
                  </button>
                </div>
              </form>
            </div>

            {/* 2. Create Required Document Names/Slots for Teachers to Upload */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <FolderCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900">
                      Create Required Document Names for Upload
                    </h2>
                    <p className="text-xs text-slate-500">
                      Define official document titles (Scheme of Work, Lesson Plans, Notes, Exam Questions)
                    </p>
                  </div>
                </div>
              </div>

              {slotNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{slotNotice}</span>
                </div>
              )}

              <form onSubmit={handleCreateSlotSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                    Document Name / Requirement Title *
                  </label>
                  <input
                    type="text"
                    data-testid="create-doc-slot-name-input"
                    value={newSlotName}
                    onChange={(e) => setNewSlotName(e.target.value)}
                    placeholder="e.g., Week 6 Mid-Term Examination Questions & Marking Guide"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                      Document Category
                    </label>
                    <select
                      value={newSlotCategory}
                      onChange={(e) => setNewSlotCategory(e.target.value as TeacherDocumentCategory)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                    >
                      <option value="SCHEME_OF_WORK">Scheme of Work</option>
                      <option value="LESSON_PLAN">Lesson Plan</option>
                      <option value="LESSON_NOTES">Lesson Notes</option>
                      <option value="EXAM_QUESTIONS">Exam Questions</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                      Target Week (1–14 Timeline)
                    </label>
                    <select
                      value={newSlotWeek}
                      onChange={(e) => setNewSlotWeek(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                    >
                      <option value="ALL">All Weeks (Weeks 1–14)</option>
                      {WEEKS_1_TO_14.map(w => (
                        <option key={w} value={w}>
                          Week {w}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                    Submission Instructions (PDF, DOCX, PPTX)
                  </label>
                  <input
                    type="text"
                    value={newSlotInstructions}
                    onChange={(e) => setNewSlotInstructions(e.target.value)}
                    placeholder="e.g., Upload moderated PDF or DOCX before Friday 4:00 PM"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    data-testid="create-doc-slot-btn"
                    className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Publish Required Document Slot</span>
                  </button>
                </div>
              </form>

              {/* Active Required Document Slots List */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5 max-h-40 overflow-y-auto">
                <div className="text-[10px] font-black uppercase text-slate-400">
                  Active Required Document Names ({requiredDocumentSlots.length})
                </div>
                {requiredDocumentSlots.map(slot => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="truncate pr-2">
                      <span className="font-bold text-slate-800">{slot.name}</span>
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                        {CATEGORY_LABELS[slot.category]} • {slot.targetWeek === 'ALL' ? 'Weeks 1–14' : `Week ${slot.targetWeek}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteRequiredDocumentSlot(slot.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      title="Remove document slot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* 2B. HEADS OF DEPARTMENT (HOD) CREATION & SUBJECT ALLOCATION     */}
          {/* =============================================================== */}
          <div
            data-testid="executive-hod-management-panel"
            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Heads of Department (HOD) &amp; Subject Allocation System
                  </h2>
                  <p className="text-xs text-slate-500">
                    Create academic departments, appoint an existing Teacher / Form Tutor as Head of Department, and assign subjects so HODs can review &amp; comment on teacher files before or alongside Principal &amp; VP oversight.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black shrink-0">
                {academicDepartments.length} Active Departments
              </span>
            </div>

            {hodSavedNotice && (
              <div
                data-testid="hod-saved-notice"
                className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{hodSavedNotice}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 cols: Create / Update Department & Appoint HOD Form */}
              <form
                onSubmit={handleSaveDepartmentSubmit}
                className="lg:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black uppercase tracking-wider text-slate-800 text-[11px]">
                    {deptIdBeingEdited ? 'Update Academic Department & HOD' : 'Create Department & Appoint HOD'}
                  </span>
                  {deptIdBeingEdited && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeptIdBeingEdited('');
                        setDeptNameInput('');
                        setDeptCodeInput('');
                        setDeptDescription('');
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                      Department Name *
                    </label>
                    <input
                      type="text"
                      data-testid="hod-dept-name-input"
                      value={deptNameInput}
                      onChange={(e) => setDeptNameInput(e.target.value)}
                      placeholder="e.g., Department of Sciences & Technology"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                      Dept Code
                    </label>
                    <input
                      type="text"
                      data-testid="hod-dept-code-input"
                      value={deptCodeInput}
                      onChange={(e) => setDeptCodeInput(e.target.value)}
                      placeholder="DEPT-SCI"
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-mono font-bold text-slate-800 uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                    Select Teacher / Form Tutor as Head of Department (HOD) *
                  </label>
                  <select
                    data-testid="hod-teacher-select"
                    value={deptHodTeacherId}
                    onChange={(e) => setDeptHodTeacherId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                  >
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.fullName} (@{t.username}) — {t.role.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                    Select Subjects in this Department ({deptSubjectIds.length} Selected) *
                  </label>
                  <div className="max-h-36 overflow-y-auto bg-white p-2.5 rounded-lg border border-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {subjects.map(sub => {
                      const checked = deptSubjectIds.includes(sub.id);
                      return (
                        <label
                          key={sub.id}
                          className={`flex items-center space-x-2 px-2 py-1 rounded cursor-pointer border text-[11px] ${
                            checked
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            data-testid={`hod-subject-checkbox-${sub.id}`}
                            checked={checked}
                            onChange={() => {
                              setDeptSubjectIds(prev =>
                                prev.includes(sub.id)
                                  ? prev.filter(id => id !== sub.id)
                                  : [...prev, sub.id]
                              );
                            }}
                            className="rounded text-emerald-600"
                          />
                          <span className="truncate">
                            {sub.name} ({sub.code})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                    Departmental Mandate / Notes
                  </label>
                  <input
                    type="text"
                    value={deptDescription}
                    onChange={(e) => setDeptDescription(e.target.value)}
                    placeholder="e.g., Reviews all weekly lesson plans & exam questions for department subjects"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  data-testid="save-hod-department-btn"
                  className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black cursor-pointer shadow-xs flex items-center justify-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {deptIdBeingEdited ? 'Update Department & HOD Assignment' : 'Save Department & Appoint HOD'}
                  </span>
                </button>
              </form>

              {/* Right 7 cols: Active Departments & Appointed HODs Directory */}
              <div className="lg:col-span-7 space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Appointed Heads of Department &amp; Supervised Subjects ({academicDepartments.length})
                </div>
                <div className="grid grid-cols-1 gap-3 max-h-[360px] overflow-y-auto pr-1">
                  {academicDepartments.map(dept => {
                    const deptSubNames = subjects
                      .filter(s => dept.subjectIds.map(Number).includes(Number(s.id)))
                      .map(s => s.name);
                    const deptDocCount = teacherDocumentUploads.filter(
                      d =>
                        d.departmentId === dept.id ||
                        dept.subjectIds.map(Number).includes(Number(d.subjectId))
                    ).length;

                    return (
                      <div
                        key={dept.id}
                        data-testid={`hod-department-card-${dept.id}`}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition-colors space-y-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-mono font-black">
                                {dept.code}
                              </span>
                              <h3 className="text-sm font-black text-slate-900">{dept.name}</h3>
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold">
                                {deptDocCount} Dept Files
                              </span>
                            </div>
                            <p className="text-xs text-emerald-900 font-bold mt-1 flex items-center space-x-1.5">
                              <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>
                                Head of Department (HOD): {dept.hodTeacherName} (@{dept.hodUsername})
                              </span>
                            </p>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setDeptIdBeingEdited(dept.id);
                                setDeptNameInput(dept.name);
                                setDeptCodeInput(dept.code);
                                setDeptHodTeacherId(dept.hodTeacherId);
                                setDeptSubjectIds(dept.subjectIds);
                                setDeptDescription(dept.description || '');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
                            >
                              Edit HOD / Subjects
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAcademicDepartment(dept.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Delete department"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {deptSubNames.map(subName => (
                            <span
                              key={subName}
                              className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-700"
                            >
                              {subName}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Principal & Vice Principal Teacher Files Inspection & 14-Week Timeline Review Panel */}
          <div
            data-testid="executive-teacher-files-panel"
            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4"
          >
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <span>
                      Teacher &amp; HOD Files Inspection &amp; 14-Week Timeline ({filteredExecutiveUploads.length} Files)
                    </span>
                  </h2>
                  {/* Redis / Write-Through LRU Document Cache Status Badge */}
                  <span
                    data-testid="document-cache-status-badge"
                    className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 text-emerald-300 text-[10px] font-mono font-bold border border-slate-700"
                    title="Redis / Write-Through In-Memory LRU Document Cache prevents database slowdowns during frequent file downloads & bulk exports"
                  >
                    <Cpu className="w-3 h-3 text-emerald-400" />
                    <span>
                      CACHE: {cacheTelemetry.backend} • Hits: {cacheTelemetry.hits} • ETag: {cacheTelemetry.etag}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Organized and sorted by Week, Subject, Teacher, Class, or Department. View HOD reviews/comments, download individual files, or bulk-download sorted files named automatically.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Quick Sort Pills */}
                <div className="flex items-center flex-wrap gap-1.5 text-xs">
                  <span className="text-slate-500 font-bold flex items-center space-x-1">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Sort by:</span>
                  </span>
                  {(['WEEK', 'SUBJECT', 'TEACHER', 'CLASS', 'DEPARTMENT'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      data-testid={`sort-docs-by-${mode.toLowerCase()}-btn`}
                      onClick={() => setSortBy(mode)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                        sortBy === mode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {mode === 'WEEK'
                        ? 'Week (1–14)'
                        : mode.charAt(0) + mode.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                {/* Sorted Bulk Download Button */}
                <button
                  type="button"
                  data-testid="bulk-download-sorted-docs-btn"
                  onClick={() => handleBulkDownloadSortedDocuments(filteredExecutiveUploads)}
                  disabled={filteredExecutiveUploads.length === 0}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white text-xs font-black cursor-pointer shadow-xs"
                  title="Bulk download all matching files named systematically according to the active sort order"
                >
                  <FolderDown className="w-4 h-4" />
                  <span>
                    Bulk Download Sorted ({filteredExecutiveUploads.length})
                  </span>
                </button>
              </div>
            </div>

            {downloadActionNotice && (
              <div
                data-testid="document-download-notice"
                className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs font-bold flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{downloadActionNotice}</span>
                </div>
                <span className="text-[10px] font-mono text-indigo-700">
                  Served via {cacheTelemetry.backend}
                </span>
              </div>
            )}

            {/* Filter Bar by Department, Subject, Teacher, Class, and Week (1-14) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <label className="block font-bold text-slate-600 uppercase text-[10px] mb-1">
                  Filter by Department (HOD)
                </label>
                <select
                  data-testid="exec-filter-department"
                  value={filterDepartmentId}
                  onChange={(e) => setFilterDepartmentId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="ALL">All Departments</option>
                  {academicDepartments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} (HOD: {dept.hodTeacherName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 uppercase text-[10px] mb-1">
                  Filter by Subject
                </label>
                <select
                  data-testid="exec-filter-subject"
                  value={filterSubjectId}
                  onChange={(e) => setFilterSubjectId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="ALL">All Subjects</option>
                  {subjects.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 uppercase text-[10px] mb-1">
                  Filter by Teacher
                </label>
                <select
                  data-testid="exec-filter-teacher"
                  value={filterTeacherId}
                  onChange={(e) => setFilterTeacherId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="ALL">All Teachers</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 uppercase text-[10px] mb-1">
                  Filter by Class
                </label>
                <select
                  data-testid="exec-filter-class"
                  value={filterSectionId}
                  onChange={(e) => setFilterSectionId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="ALL">All Classes</option>
                  {classSections.map(sec => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 uppercase text-[10px] mb-1">
                  Filter by Week (1–14 Timeline)
                </label>
                <select
                  data-testid="exec-filter-week"
                  value={filterWeek}
                  onChange={(e) => setFilterWeek(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="ALL">All 14 Weeks</option>
                  {WEEKS_1_TO_14.map(w => (
                    <option key={w} value={w}>
                      Week {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 14-Week Interactive Timeline Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setFilterWeek('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer border ${
                  filterWeek === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                All Weeks ({teacherDocumentUploads.length})
              </button>
              {WEEKS_1_TO_14.map(w => {
                const count = teacherDocumentUploads.filter(d => d.weekNumber === w).length;
                const active = filterWeek === String(w);
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setFilterWeek(active ? 'ALL' : String(w))}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer border flex items-center space-x-1 ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : count > 0
                        ? 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>Wk {w}</span>
                    {count > 0 && (
                      <span className="px-1 rounded-full bg-indigo-600 text-white text-[9px]">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Uploaded Files Cards with HOD Status, Download & Executive Remark Controls */}
            {filteredExecutiveUploads.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-300">
                No teacher documents match the selected Department / Subject / Teacher / Class / Week filter.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredExecutiveUploads.map((doc, idx) => {
                  const draftRemark = remarkDrafts[doc.id] || '';
                  const draftStatus = statusDrafts[doc.id] || doc.status;
                  const deptObj = getDepartmentForSubject(doc.subjectId, academicDepartments);
                  const resolvedDeptName = doc.departmentName || deptObj?.name || 'General Department';
                  const sortedFileName = formatSortedDocumentDownloadName(doc, sortBy, idx);
                  const hodStatus = doc.hodReviewStatus || 'HOD_PENDING';

                  return (
                    <div
                      key={doc.id}
                      data-testid={`exec-doc-card-${doc.id}`}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black uppercase">
                              Week {doc.weekNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-mono font-bold">
                              {doc.fileExtension} • {doc.fileSizeKb} KB
                            </span>
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold">
                              {CATEGORY_LABELS[doc.category]}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 text-[10px] font-bold">
                              {resolvedDeptName}
                            </span>
                            {/* HOD Review Status Badge */}
                            <span
                              data-testid={`exec-doc-hod-status-${doc.id}`}
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                hodStatus === 'HOD_APPROVED'
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : hodStatus === 'HOD_REVISION'
                                  ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                  : hodStatus === 'HOD_REVIEWED'
                                  ? 'bg-sky-100 text-sky-900 border border-sky-300'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {hodStatus.replace('_', ' ')}{' '}
                              {doc.hodReviewedBy ? `(${doc.hodReviewedBy})` : ''}
                            </span>
                            {/* Executive Status Badge */}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                doc.status === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : doc.status === 'NEEDS_REVISION'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : 'bg-amber-100 text-amber-800 border border-amber-300'
                              }`}
                            >
                              EXEC: {doc.status.replace('_', ' ')}
                            </span>
                          </div>
                          <h3 className="text-sm font-black text-slate-900">
                            {doc.documentTitle}
                          </h3>
                          <p className="text-xs text-slate-600">
                            <strong>Teacher:</strong> {doc.teacherName} • <strong>Subject:</strong> {doc.subjectName} • <strong>Class:</strong> {doc.sectionName} •{' '}
                            <span className="font-mono text-[11px] text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded">
                              Sorted Name: {sortedFileName}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-testid={`download-teacher-doc-btn-${doc.id}`}
                            onClick={() => handleDownloadSingleDocument(doc, idx)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer shadow-xs"
                            title={`Download ${sortedFileName}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>View / Download</span>
                          </button>

                          <select
                            aria-label="Document Review Status"
                            value={draftStatus}
                            onChange={(e) => {
                              const nextStatus = e.target.value as any;
                              setStatusDrafts(prev => ({ ...prev, [doc.id]: nextStatus }));
                              addExecutiveRemarkToDocument(doc.id, '', nextStatus);
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800"
                          >
                            <option value="PENDING_REVIEW">Pending Review</option>
                            <option value="APPROVED">Approved</option>
                            <option value="NEEDS_REVISION">Needs Revision</option>
                          </select>
                        </div>
                      </div>

                      {/* Existing Executive & HOD Remarks */}
                      {doc.executiveRemarks.length > 0 && (
                        <div className="space-y-1.5 pl-3 border-l-2 border-indigo-400">
                          {doc.executiveRemarks.map(rem => (
                            <div
                              key={rem.id}
                              className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs"
                            >
                              <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                                <span>
                                  {rem.authorName} —{' '}
                                  <span className="text-emerald-700">
                                    {rem.authorDesignation || rem.authorRole.replace('_', ' ')}
                                  </span>
                                </span>
                                <span className="text-slate-400 font-normal">
                                  {new Date(rem.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-slate-700 mt-0.5">{rem.remark}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add New Principal / VP / Super Admin Remark */}
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <input
                          type="text"
                          data-testid={`exec-remark-input-${doc.id}`}
                          value={draftRemark}
                          onChange={(e) =>
                            setRemarkDrafts(prev => ({ ...prev, [doc.id]: e.target.value }))
                          }
                          placeholder="Write Principal / Vice Principal / Super Admin remark or feedback for teacher & HOD..."
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                        />
                        <button
                          type="button"
                          data-testid={`exec-remark-submit-${doc.id}`}
                          onClick={() => {
                            if (!draftRemark.trim()) return;
                            addExecutiveRemarkToDocument(doc.id, draftRemark, draftStatus);
                            setRemarkDrafts(prev => ({ ...prev, [doc.id]: '' }));
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shrink-0"
                        >
                          Save Remark &amp; Notify Teacher
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* WORKSPACE B: TEACHER'S CORNER & HOD'S OFFICE                      */}
      {/* ================================================================= */}
      {(!isExecutive || activeWorkspace === 'TEACHER_CORNER') && (
        <div data-testid="teacher-corner-workspace" className="space-y-6">
          {/* If Executive is previewing Teacher's Corner, let them pick which Teacher's portfolio to inspect */}
          {false && isExecutive && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2 text-amber-900 font-bold">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>
                  Executive Preview Mode: Inspecting Teacher&apos;s Corner &amp; HOD Office Portfolio
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700">Select Teacher / HOD:</span>
                <select
                  data-testid="exec-preview-teacher-select"
                  value={selectedTeacherIdForCorner}
                  onChange={(e) => {
                    setSelectedTeacherIdForCorner(Number(e.target.value));
                    setSelectedCardKey('');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white font-bold text-slate-800"
                >
                  {teachers.map(t => {
                    const hodCheck = getTeacherHodDesignation(
                      t.id,
                      academicDepartments,
                      t.username,
                      t.fullName
                    );
                    return (
                      <option key={t.id} value={t.id}>
                        {t.fullName} (@{t.username})
                        {hodCheck.isHod ? ` — [${hodCheck.designationBadge}]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* HOD'S OFFICE BANNER & DEPARTMENTAL DOCUMENT SUPERVISION PANEL */}
          {/* ============================================================= */}
          {!isExecutive && cornerTeacherHodInfo.isHod && (
            <div
              data-testid="hod-office-banner"
              className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-lg border border-emerald-700/50 space-y-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-emerald-800/60 pb-3.5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                      Official Head of Department (HOD) Office
                    </span>
                    <span className="text-xs font-mono text-emerald-300 font-bold">
                      {cornerTeacher?.fullName} • {cornerTeacherHodInfo.designationBadge}
                    </span>
                  </div>
                  <h2 className="text-lg font-black tracking-tight">
                    {cornerTeacherHodInfo.officeTitle} ({hodDepartmentUploads.length} Departmental Files)
                  </h2>
                  <p className="text-xs text-slate-300">
                    Review, download, comment on, and approve lesson materials uploaded for subjects in your department. All HOD actions &amp; remarks are automatically synchronized with the Principal, Vice Principal, and Super Admin.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="hod-bulk-download-btn"
                    onClick={() => handleBulkDownloadSortedDocuments(hodDepartmentUploads)}
                    disabled={hodDepartmentUploads.length === 0}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-slate-950 text-xs font-black cursor-pointer shadow"
                  >
                    <FolderDown className="w-4 h-4" />
                    <span>Bulk Download Dept Files ({hodDepartmentUploads.length})</span>
                  </button>
                </div>
              </div>

              {downloadActionNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-900/60 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{downloadActionNotice}</span>
                </div>
              )}

              {/* HOD Departmental Documents Review List */}
              <div
                data-testid="hod-department-documents-panel"
                className="space-y-3 max-h-[420px] overflow-y-auto pr-1"
              >
                {hodDepartmentUploads.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-300 bg-slate-900/60 rounded-xl border border-slate-700">
                    No documents uploaded yet for the subjects in your department.
                  </div>
                ) : (
                  hodDepartmentUploads.map((doc, idx) => {
                    const hodRemarkDraft = remarkDrafts[`hod_${doc.id}`] || '';
                    const currentHodStatus =
                      hodStatusDrafts[doc.id] || doc.hodReviewStatus || 'HOD_APPROVED';
                    const sortedName = formatSortedDocumentDownloadName(doc, sortBy, idx);

                    return (
                      <div
                        key={doc.id}
                        data-testid={`hod-review-doc-card-${doc.id}`}
                        className="p-4 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-2.5 text-xs"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black">
                                Week {doc.weekNumber}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-mono font-bold">
                                {doc.fileExtension} • {doc.fileSizeKb} KB
                              </span>
                              <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 text-[10px] font-bold">
                                {doc.subjectName} ({doc.sectionName})
                              </span>
                              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-black">
                                HOD STATUS: {(doc.hodReviewStatus || 'HOD_PENDING').replace('_', ' ')}
                              </span>
                            </div>
                            <h4 className="text-sm font-black text-white mt-1">
                              {doc.documentTitle}
                            </h4>
                            <p className="text-[11px] text-slate-300">
                              Uploaded by <strong>{doc.teacherName}</strong> • Sorted File:{' '}
                              <span className="font-mono text-emerald-300">{sortedName}</span>
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              data-testid={`hod-download-doc-btn-${doc.id}`}
                              onClick={() => handleDownloadSingleDocument(doc, idx)}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>View / Download</span>
                            </button>

                            <select
                              aria-label="HOD Review Action"
                              data-testid={`hod-status-select-${doc.id}`}
                              value={currentHodStatus}
                              onChange={(e) => {
                                const nextHodStatus = e.target.value as any;
                                setHodStatusDrafts(prev => ({ ...prev, [doc.id]: nextHodStatus }));
                                addExecutiveRemarkToDocument(
                                  doc.id,
                                  `HOD Action updated to ${nextHodStatus.replace('_', ' ')}`,
                                  nextHodStatus === 'HOD_APPROVED'
                                    ? 'APPROVED'
                                    : nextHodStatus === 'HOD_REVISION'
                                    ? 'NEEDS_REVISION'
                                    : undefined,
                                  nextHodStatus,
                                  cornerTeacherHodInfo.designationBadge || undefined
                                );
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white font-bold text-xs"
                            >
                              <option value="HOD_PENDING">HOD Pending</option>
                              <option value="HOD_REVIEWED">HOD Reviewed</option>
                              <option value="HOD_APPROVED">HOD Approved</option>
                              <option value="HOD_REVISION">HOD Needs Revision</option>
                            </select>
                          </div>
                        </div>

                        {/* HOD Remark Input */}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <input
                            type="text"
                            data-testid={`hod-remark-input-${doc.id}`}
                            value={hodRemarkDraft}
                            onChange={(e) =>
                              setRemarkDrafts(prev => ({
                                ...prev,
                                [`hod_${doc.id}`]: e.target.value
                              }))
                            }
                            placeholder={`Write ${cornerTeacherHodInfo.designationBadge} review comment (visible to Principal, VP & Teacher)...`}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-400 text-xs"
                          />
                          <button
                            type="button"
                            data-testid={`hod-remark-submit-${doc.id}`}
                            onClick={() => {
                              if (!hodRemarkDraft.trim()) return;
                              addExecutiveRemarkToDocument(
                                doc.id,
                                hodRemarkDraft,
                                currentHodStatus === 'HOD_APPROVED'
                                  ? 'APPROVED'
                                  : currentHodStatus === 'HOD_REVISION'
                                  ? 'NEEDS_REVISION'
                                  : undefined,
                                currentHodStatus,
                                cornerTeacherHodInfo.designationBadge || undefined
                              );
                              setRemarkDrafts(prev => ({ ...prev, [`hod_${doc.id}`]: '' }));
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shrink-0"
                          >
                            Submit HOD Review
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {false && (
          <>
          {/* Assigned subject/class cards and active-term roster are intentionally removed. */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  <span>
                    Assigned Subjects &amp; Classes for {cornerTeacher?.fullName} ({assignedCards.length})
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Click any subject/class card to view its enrolled students, inspect a student&apos;s full score summary, or enter/correct scores.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignedCards.map(card => {
                const isSelected = activeCard?.key === card.key;
                return (
                  <button
                    key={card.key}
                    type="button"
                    data-testid={`assigned-subject-card-${card.key}`}
                    onClick={() => setSelectedCardKey(card.key)}
                    className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-950 text-white border-indigo-600 shadow-lg ring-2 ring-indigo-500/40'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {card.sectionName}
                      </span>
                      <span
                        className={`text-[11px] font-mono font-bold ${
                          isSelected ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      >
                        {card.subjectCode} • {card.levelType}
                      </span>
                    </div>
                    <h3 className="text-base font-black truncate">{card.subjectName}</h3>
                    <div className="mt-3 pt-2.5 border-t border-slate-200/30 flex items-center justify-between text-xs">
                      <span className="flex items-center space-x-1.5 font-semibold">
                        <Users className="w-3.5 h-3.5" />
                        <span>{card.studentCount} Enrolled Students</span>
                      </span>
                      <span className="inline-flex items-center space-x-1 font-bold text-amber-400">
                        <span>Open Class</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Class Student List for Selected Assigned Subject Card */}
          {activeCard && (
            <div
              data-testid="teacher-corner-student-list-card"
              className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
            >
              <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    Active Class &amp; Subject Roster • {currentTerm.name} TERM
                  </div>
                  <h3 className="text-base font-black">
                    {activeCard.sectionName} — {activeCard.subjectName} ({activeCardStudents.length} Students)
                  </h3>
                </div>
                <div className="text-xs text-slate-300">
                  Click any student row to view their full academic summary &amp; enter/correct scores
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase text-[11px]">
                      <th className="py-2.5 px-4 text-left">Student Name</th>
                      <th className="py-2.5 px-3 text-left">Admission No.</th>
                      <th className="py-2.5 px-3 text-center">
                        1st CA ({activeCard.levelType === 'JUNIOR' ? 20 : 15})
                      </th>
                      <th className="py-2.5 px-3 text-center">
                        2nd CA ({activeCard.levelType === 'JUNIOR' ? 20 : 15})
                      </th>
                      <th className="py-2.5 px-3 text-center">
                        Exam ({activeCard.levelType === 'JUNIOR' ? 60 : 70})
                      </th>
                      <th className="py-2.5 px-3 text-center">Total (100)</th>
                      <th className="py-2.5 px-3 text-center">Grade</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeCardStudents.map(st => {
                      const rec = termSubjectRecords.find(
                        r =>
                          r.studentId === st.id &&
                          r.subjectId === activeCard.subjectId &&
                          r.termId === currentTerm.id
                      );
                      const total = rec?.totalScore ?? 0;
                      const grade =
                        total > 0
                          ? rec?.grade || determineGrade(total, activeCard.levelType).grade
                          : '-';

                      return (
                        <tr
                          key={st.id}
                          data-testid={`teacher-corner-student-row-${st.id}`}
                          onClick={() => setInspectingStudent(st)}
                          className="hover:bg-indigo-50/70 transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center space-x-2">
                            <span>{st.fullName}</span>
                            {st.isRecordSealed && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black">
                                {st.recordSignature || 'GRADUATED'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {st.admissionNumber}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">
                            {rec ? rec.ca1Score : 0}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">
                            {rec ? rec.ca2Score : 0}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">
                            {rec ? rec.examScore : 0}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-950">
                            {total > 0 ? total.toFixed(1) : '0.0'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-black">
                            {grade}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectingStudent(st);
                              }}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Summary &amp; Scores</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
          )}

          {/* 3. Teacher Document Upload & 14-Week Lesson Materials Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Upload Form (5 cols) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Upload Lesson Materials (Weeks 1–14)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Scheme of Work, Lesson Plans, Lesson Notes &amp; Exam Questions (PDF, DOCX, PPTX)
                  </p>
                </div>
              </div>

              {uploadSuccessBanner && (
                <div
                  data-testid="teacher-upload-success-banner"
                  className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{uploadSuccessBanner}</span>
                </div>
              )}
              {uploadErrorBanner && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                  {uploadErrorBanner}
                </div>
              )}

              <form onSubmit={handleTeacherUploadSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                    Required Document Slot (Created by Principal / VP)
                  </label>
                  <select
                    value={selectedSlotId}
                    onChange={(e) => {
                      const slotId = e.target.value;
                      setSelectedSlotId(slotId);
                      const matched = requiredDocumentSlots.find(s => s.id === slotId);
                      if (matched) {
                        setDocCategory(matched.category);
                        if (!docTitle.trim()) setDocTitle(matched.name);
                        if (matched.targetWeek !== 'ALL') setDocWeekNumber(Number(matched.targetWeek));
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                  >
                    <option value="">-- Custom / General Document Upload --</option>
                    {requiredDocumentSlots.map(slot => (
                      <option key={slot.id} value={slot.id}>
                        {slot.name} ({CATEGORY_LABELS[slot.category]})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                    Document Name / Title *
                  </label>
                  <input
                    type="text"
                    data-testid="teacher-doc-title-input"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="e.g., Week 3 Quadratic Equations Lesson Plan"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                      Document Type
                    </label>
                    <select
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value as TeacherDocumentCategory)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                    >
                      <option value="SCHEME_OF_WORK">Scheme of Work</option>
                      <option value="LESSON_PLAN">Lesson Plan</option>
                      <option value="LESSON_NOTES">Lesson Notes</option>
                      <option value="EXAM_QUESTIONS">Exam Questions</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                      Timeline Week (1–14)
                    </label>
                    <select
                      data-testid="teacher-doc-week-select"
                      value={docWeekNumber}
                      onChange={(e) => setDocWeekNumber(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-indigo-900"
                    >
                      {WEEKS_1_TO_14.map(w => (
                        <option key={w} value={w}>
                          Week {w} of 14
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                      Target Class
                    </label>
                    <select
                      value={docSectionId}
                      onChange={(e) => setDocSectionId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                    >
                      {classSections.map(sec => (
                        <option key={sec.id} value={sec.id}>
                          {sec.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                      Subject
                    </label>
                    <select
                      value={docSubjectId}
                      onChange={(e) => setDocSubjectId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                    >
                      {subjects.map(sub => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[11px] mb-1">
                    Attach File (.PDF, .DOCX, .PPTX)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={docFileInputRef}
                      type="file"
                      accept=".pdf,.docx,.pptx"
                      required
                      onChange={handleFileInputChange}
                      className="flex-1 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-bold hover:file:bg-indigo-100"
                    />
                    <span className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono font-bold text-xs">
                      {docExtension}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  data-testid="teacher-upload-doc-submit-btn"
                  disabled={isUploadingDocument}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>{isUploadingDocument ? 'Saving Original File...' : `Upload Document to Week ${docWeekNumber} Timeline`}</span>
                </button>
              </form>
            </div>

            {/* 14-Week Timeline & Principal/VP/HOD Remarks Viewer (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      14-Week Lesson Materials Timeline &amp; HOD / Principal / VP Remarks
                    </h3>
                    <p className="text-xs text-slate-500">
                      Track your uploaded files across Weeks 1–14 and view HOD &amp; executive comments
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                  {teacherOwnUploads.length} Uploaded
                </span>
              </div>

              {/* Visual 14-Week Pills */}
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKS_1_TO_14.map(w => {
                  const weekDocs = teacherOwnUploads.filter(d => d.weekNumber === w);
                  const hasApproved = weekDocs.some(d => d.status === 'APPROVED');
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setDocWeekNumber(w)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        docWeekNumber === w
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : weekDocs.length > 0
                          ? hasApproved
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-[10px] font-black uppercase">Wk {w}</div>
                      <div className="text-[10px] font-mono mt-0.5">
                        {weekDocs.length > 0 ? `${weekDocs.length} file${weekDocs.length > 1 ? 's' : ''}` : 'Empty'}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Uploaded Documents List with HOD, Principal & VP Comments */}
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {teacherOwnUploads.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    No lesson materials uploaded yet. Use the form on the left to upload PDF, DOCX, or PPTX files to Weeks 1–14.
                  </div>
                ) : (
                  teacherOwnUploads.map((doc, idx) => (
                    <div
                      key={doc.id}
                      data-testid={`teacher-uploaded-doc-${doc.id}`}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black">
                              Week {doc.weekNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-mono font-bold">
                              {doc.fileExtension}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                              {CATEGORY_LABELS[doc.category]}
                            </span>
                            {doc.hodReviewStatus && (
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-black uppercase">
                                {doc.hodReviewStatus.replace('_', ' ')}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                doc.status === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : doc.status === 'NEEDS_REVISION'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {doc.status.replace('_', ' ')}
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-slate-900 mt-1">
                            {doc.documentTitle}
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            {doc.sectionName} • {doc.subjectName} • <span className="font-mono">{doc.fileName}</span>
                          </p>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleDocument(doc, idx)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="Download file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTeacherDocument(doc.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            title="Delete uploaded file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Remarks from HOD, Principal & Vice Principal */}
                      {doc.executiveRemarks.length > 0 ? (
                        <div className="space-y-1.5 pt-1 border-t border-slate-200/80">
                          <div className="text-[10px] font-black uppercase text-indigo-700 flex items-center space-x-1">
                            <MessageSquare className="w-3 h-3" />
                            <span>HOD / Principal / Vice Principal Remarks:</span>
                          </div>
                          {doc.executiveRemarks.map(rem => (
                            <div
                              key={rem.id}
                              className="p-2 rounded-lg bg-white border border-indigo-100 text-xs"
                            >
                              <div className="font-bold text-indigo-950 text-[11px]">
                                {rem.authorName} ({rem.authorDesignation || rem.authorRole.replace('_', ' ')}):
                              </div>
                              <p className="text-slate-700 mt-0.5">{rem.remark}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Awaiting HOD / Principal / Vice Principal review and remarks</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 1: STUDENT ACADEMIC SUMMARY & INLINE SCORE EDITOR           */}
      {/* ================================================================= */}
      {inspectingStudent && (
        <div
          data-testid="student-summary-score-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-600 text-white">
                    Student Academic Summary &amp; Score Editor
                  </span>
                  {inspectingStudent.isRecordSealed && (
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-black flex items-center space-x-1">
                      <Lock className="w-3 h-3" />
                      <span>SIGNED: {inspectingStudent.recordSignature || 'GRADUATED'} (SEALED)</span>
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-black mt-1">
                  {inspectingStudent.fullName} ({inspectingStudent.admissionNumber})
                </h3>
                <p className="text-xs text-slate-400">
                  {classSections.find(s => s.id === inspectingStudent.currentSectionId)?.name} • {currentTerm.name} TERM ({currentSession.name})
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {onOpenReportCard && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = inspectingStudent.id;
                      setInspectingStudent(null);
                      onOpenReportCard?.(id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
                  >
                    Open Full Report Card
                  </button>
                )}
                <button
                  type="button"
                  data-testid="close-student-summary-modal-btn"
                  onClick={() => setInspectingStudent(null)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {scoreSaveNotice && (
              <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{scoreSaveNotice}</span>
              </div>
            )}

            <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4">
              {(() => {
                const sec = classSections.find(s => s.id === inspectingStudent.currentSectionId);
                const levelType = sec?.levelType || 'SENIOR';
                const isJunior = levelType === 'JUNIOR';
                const maxCa = isJunior ? 20 : 15;
                const maxExam = isJunior ? 60 : 70;

                const stSubs = subjects.filter(sub =>
                  isJunior
                    ? sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH'
                    : sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
                );

                return (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white uppercase text-[11px]">
                          <th className="py-2.5 px-3 text-left">Subject</th>
                          <th className="py-2.5 px-3 text-center">1st CA ({maxCa})</th>
                          <th className="py-2.5 px-3 text-center">2nd CA ({maxCa})</th>
                          <th className="py-2.5 px-3 text-center">Exam ({maxExam})</th>
                          <th className="py-2.5 px-3 text-center">Term Total (100)</th>
                          <th className="py-2.5 px-3 text-center">Grade</th>
                          <th className="py-2.5 px-3 text-left">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {stSubs.map(sub => {
                          const enr = enrollments.find(
                            e => e.studentId === inspectingStudent.id && e.subjectId === sub.id
                          );
                          if (enr && !enr.isIncluded && !isJunior) return null;

                          const rec = termSubjectRecords.find(
                            r =>
                              r.studentId === inspectingStudent.id &&
                              r.subjectId === sub.id &&
                              r.termId === currentTerm.id
                          );
                          const ca1 = rec?.ca1Score ?? 0;
                          const ca2 = rec?.ca2Score ?? 0;
                          const exam = rec?.examScore ?? 0;
                          const total = rec?.totalScore ?? 0;
                          const gradeObj = determineGrade(total, levelType);

                          return (
                            <tr key={sub.id} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-bold text-slate-900">
                                {sub.name}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={maxCa}
                                  step="0.5"
                                  disabled={Boolean(inspectingStudent.isRecordSealed)}
                                  data-testid={`modal-ca1-input-${sub.id}`}
                                  value={ca1}
                                  onChange={(e) => {
                                    const val = Math.min(maxCa, Math.max(0, Number(e.target.value) || 0));
                                    updateTermSubjectScore(inspectingStudent.id, sub.id, currentTerm.id, {
                                      ca1Score: val
                                    });
                                    setScoreSaveNotice(`Updated ${sub.name} 1st CA score for ${inspectingStudent.fullName}.`);
                                  }}
                                  className="w-16 px-2 py-1 text-center font-mono font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                                />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={maxCa}
                                  step="0.5"
                                  disabled={Boolean(inspectingStudent.isRecordSealed)}
                                  data-testid={`modal-ca2-input-${sub.id}`}
                                  value={ca2}
                                  onChange={(e) => {
                                    const val = Math.min(maxCa, Math.max(0, Number(e.target.value) || 0));
                                    updateTermSubjectScore(inspectingStudent.id, sub.id, currentTerm.id, {
                                      ca2Score: val
                                    });
                                    setScoreSaveNotice(`Updated ${sub.name} 2nd CA score for ${inspectingStudent.fullName}.`);
                                  }}
                                  className="w-16 px-2 py-1 text-center font-mono font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                                />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={maxExam}
                                  step="0.5"
                                  disabled={Boolean(inspectingStudent.isRecordSealed)}
                                  data-testid={`modal-exam-input-${sub.id}`}
                                  value={exam}
                                  onChange={(e) => {
                                    const val = Math.min(maxExam, Math.max(0, Number(e.target.value) || 0));
                                    updateTermSubjectScore(inspectingStudent.id, sub.id, currentTerm.id, {
                                      examScore: val
                                    });
                                    setScoreSaveNotice(`Updated ${sub.name} Exam score for ${inspectingStudent.fullName}.`);
                                  }}
                                  className="w-16 px-2 py-1 text-center font-mono font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                                />
                              </td>
                              <td className="py-2 px-3 text-center font-mono font-black text-indigo-950">
                                {total.toFixed(1)}
                              </td>
                              <td className="py-2 px-3 text-center font-black">
                                {total > 0 ? gradeObj.grade : '-'}
                              </td>
                              <td className="py-2 px-3 text-slate-600 font-semibold">
                                {total > 0 ? gradeObj.description : 'Unentered'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: OFFICE MESSAGES & DIRECTIVES DRAWER                      */}
      {/* ================================================================= */}
      {isMessageModalOpen && (
        <div
          data-testid="office-messages-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Bell className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-black">
                    Messages &amp; Updates from Principal, Vice Principal &amp; Super Admin
                  </h3>
                  <p className="text-xs text-slate-400">
                    Official communications and academic directives ({relevantMessages.length})
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="close-office-messages-modal-btn"
                onClick={() => setIsMessageModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-3">
              {isExecutive && (
                <form
                  onSubmit={handleSendMessageSubmit}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3"
                >
                  <h4 className="text-xs font-black uppercase tracking-wide text-indigo-950">
                    Send an Office Message
                  </h4>
                  {msgSentNotice && (
                    <p role="status" className="text-xs font-bold text-emerald-700">
                      {msgSentNotice}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-[10px] font-bold uppercase text-slate-600">
                      Recipient
                      <select
                        value={msgRecipientId}
                        onChange={event => setMsgRecipientId(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-900"
                      >
                        <option value="ALL">All Teaching Staff</option>
                        {teachers.map(teacher => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[10px] font-bold uppercase text-slate-600">
                      Priority
                      <select
                        value={msgPriority}
                        onChange={event =>
                          setMsgPriority(event.target.value as 'NORMAL' | 'IMPORTANT' | 'URGENT')
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-900"
                      >
                        <option value="NORMAL">Normal</option>
                        <option value="IMPORTANT">Important</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600">
                    Subject
                    <input
                      value={msgSubject}
                      onChange={event => setMsgSubject(event.target.value)}
                      required
                      maxLength={160}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-900"
                    />
                  </label>
                  <label className="block text-[10px] font-bold uppercase text-slate-600">
                    Message
                    <textarea
                      value={msgBody}
                      onChange={event => setMsgBody(event.target.value)}
                      required
                      rows={3}
                      maxLength={5000}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-900"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-black text-white hover:bg-indigo-600"
                  >
                    Send Message
                  </button>
                </form>
              )}
              {relevantMessages.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No messages or directives at this time.
                </div>
              ) : (
                relevantMessages.map(msg => {
                  const teacherId = currentUser.id;
                  const isRead = msg.readByTeacherIds.includes(teacherId);
                  return (
                    <div
                      key={msg.id}
                      onClick={() => markOfficeMessageAsRead(msg.id, teacherId)}
                      className={`p-4 rounded-xl border transition-colors cursor-pointer ${
                        isRead
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-indigo-50/70 border-indigo-300 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              msg.priority === 'URGENT'
                                ? 'bg-rose-600 text-white'
                                : msg.priority === 'IMPORTANT'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-800 text-white'
                            }`}
                          >
                            {msg.priority}
                          </span>
                          <span className="text-xs font-bold text-indigo-950">
                            From: {msg.senderName} ({msg.senderRole.replace('_', ' ')})
                          </span>
                          {!isRead && (
                            <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-black">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] text-slate-400">
                            {new Date(msg.createdAt).toLocaleDateString()}
                          </span>
                          {isExecutive && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteOfficeMessage(msg.id);
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <h4 className="text-sm font-black text-slate-900 mt-1.5">{msg.subject}</h4>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">{msg.body}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
