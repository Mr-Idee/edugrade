/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CustomReportColumn, CustomReportTemplate } from '../types/index';
import {
  determineGrade,
  resolveActiveGradingScaleBands,
  getReportCardGradingScaleDisplay
} from '../utils/academicCalculations';
import {
  resolveCustomReportColumnEntryValue,
  resolveCustomReportColumnScore
} from '../utils/customReportEngine';
import {
  DEFAULT_INSTITUTION_LOGO_DATA_URI,
  resolveInstitutionLogoUrl
} from '../utils/rbacAndAuth';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Printer,
  CheckSquare,
  Square,
  RotateCcw,
  Save,
  CheckCircle2,
  UserCheck,
  Palette,
  ExternalLink,
  Edit2,
  ArrowLeft
} from 'lucide-react';

const COLOR_BAR_THEMES: Record<
  string,
  { label: string; barBg: string; headerBg: string; badgeBg: string }
> = {
  EMERALD: {
    label: 'Emerald Custom Bar',
    barBg: 'bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-800',
    headerBg: 'bg-emerald-900',
    badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300'
  },
  INDIGO: {
    label: 'Indigo Royal Bar',
    barBg: 'bg-gradient-to-r from-indigo-700 via-blue-600 to-indigo-800',
    headerBg: 'bg-indigo-950',
    badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300'
  },
  AMBER: {
    label: 'Amber Gold Bar',
    barBg: 'bg-gradient-to-r from-amber-600 via-orange-500 to-amber-700',
    headerBg: 'bg-amber-900',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300'
  },
  ROSE: {
    label: 'Crimson Rose Bar',
    barBg: 'bg-gradient-to-r from-rose-700 via-pink-600 to-rose-800',
    headerBg: 'bg-rose-950',
    badgeBg: 'bg-rose-100 text-rose-900 border-rose-300'
  },
  PURPLE: {
    label: 'Imperial Purple Bar',
    barBg: 'bg-gradient-to-r from-purple-700 via-fuchsia-600 to-purple-800',
    headerBg: 'bg-purple-950',
    badgeBg: 'bg-purple-100 text-purple-900 border-purple-300'
  }
};

export const CustomReportSheetView: React.FC = () => {
  const {
    schoolProfile,
    currentSession,
    currentTerm,
    classSections,
    subjects,
    students,
    enrollments,
    termSubjectRecords,
    customReportTemplates,
    saveCustomReportTemplate,
    deleteCustomReportTemplate,
    toggleCustomReportInReportTab,
    updateStudentCustomReportScore,
    gradingScalePresets
  } = useApp();

  const [selectedSectionId, setSelectedSectionId] = useState<number>(
    classSections[0]?.id || 1
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplateId, setNewTemplateId] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const isBuilderOpen = isCreatingTemplate || selectedTemplateId !== null;

  const activeSection = useMemo(
    () => classSections.find(s => s.id === selectedSectionId) || classSections[0],
    [classSections, selectedSectionId]
  );

  const applicableSubjects = useMemo(() => {
    if (!activeSection) return subjects;
    const isJunior = activeSection.levelType === 'JUNIOR';
    return subjects.filter(sub =>
      isJunior
        ? sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH'
        : sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH'
    );
  }, [subjects, activeSection]);

  const currentTemplate = useMemo((): CustomReportTemplate => {
    const found = customReportTemplates.find(t => t.id === selectedTemplateId);
    if (found) {
      return {
        ...found,
        sectionIds: found.sectionIds && found.sectionIds.length > 0 ? found.sectionIds : [found.sectionId],
        reportMode: 'INDIVIDUAL_STUDENT',
        colorBarTheme: found.colorBarTheme || 'EMERALD',
        enabledInReportTab: Boolean(found.enabledInReportTab),
        studentCustomScores: found.studentCustomScores || {}
      };
    }
    const isJunior = activeSection?.levelType === 'JUNIOR';
    return {
      id: isCreatingTemplate ? newTemplateId : `custom-report-draft-${selectedSectionId}`,
      sectionId: selectedSectionId,
      sectionIds: [selectedSectionId],
      title: `${activeSection?.name || 'Class'} Custom Report Card`,
      subtitle: `INDIVIDUAL STUDENT CUSTOM ASSESSMENT BREAKDOWN (${activeSection?.levelType || 'SENIOR'} SECONDARY)`,
      reportMode: 'INDIVIDUAL_STUDENT',
      enabledInReportTab: false,
      colorBarTheme: isJunior ? 'EMERALD' : 'INDIGO',
      columns: isJunior
        ? [
            { id: 'col-ca1', header: 'FIRST CA (20)', maxScore: 20, sourceKey: 'ca1' },
            { id: 'col-ca2', header: 'SECOND CA (20)', maxScore: 20, sourceKey: 'ca2' },
            { id: 'col-exam', header: 'EXAM (60)', maxScore: 60, sourceKey: 'exam' }
          ]
        : [
            { id: 'col-ca1', header: 'FIRST CA (15)', maxScore: 15, sourceKey: 'ca1' },
            { id: 'col-ca2', header: 'SECOND CA (15)', maxScore: 15, sourceKey: 'ca2' },
            { id: 'col-exam', header: 'EXAM (70)', maxScore: 70, sourceKey: 'exam' }
          ],
      selectedSubjectIds: applicableSubjects.map(s => s.id),
      studentCustomScores: {},
      updatedAt: new Date().toISOString()
    };
  }, [
    customReportTemplates,
    selectedTemplateId,
    isCreatingTemplate,
    newTemplateId,
    selectedSectionId,
    activeSection,
    applicableSubjects
  ]);

  const [title, setTitle] = useState(currentTemplate.title);
  const [subtitle, setSubtitle] = useState(currentTemplate.subtitle);
  const [columns, setColumns] = useState<CustomReportColumn[]>(currentTemplate.columns);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>(
    currentTemplate.selectedSubjectIds
  );
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>(
    currentTemplate.sectionIds || [selectedSectionId]
  );
  const [colorBarTheme, setColorBarTheme] = useState<NonNullable<CustomReportTemplate['colorBarTheme']>>(
    currentTemplate.colorBarTheme || 'EMERALD'
  );
  const [enabledInReportTab, setEnabledInReportTab] = useState<boolean>(
    Boolean(currentTemplate.enabledInReportTab)
  );

  // Load saved settings only when opening a different report.
  useEffect(() => {
    setTitle(currentTemplate.title);
    setSubtitle(currentTemplate.subtitle);
    setColumns(currentTemplate.columns);
    setSelectedSubjectIds(currentTemplate.selectedSubjectIds);
    setSelectedSectionIds(
      currentTemplate.sectionIds && currentTemplate.sectionIds.length > 0
        ? currentTemplate.sectionIds
        : [currentTemplate.sectionId]
    );
    setColorBarTheme(currentTemplate.colorBarTheme || 'EMERALD');
    setEnabledInReportTab(Boolean(currentTemplate.enabledInReportTab));
  }, [currentTemplate.id]);

  // Students belonging to the classes assigned to this custom report card
  const eligibleStudents = useMemo(() => {
    const allowedSecIds =
      selectedSectionIds.length > 0 ? selectedSectionIds : [selectedSectionId];
    return students.filter(st => allowedSecIds.includes(st.currentSectionId));
  }, [students, selectedSectionIds, selectedSectionId]);

  const [previewStudentId, setPreviewStudentId] = useState<number>(
    eligibleStudents[0]?.id || students[0]?.id || 100
  );

  useEffect(() => {
    if (
      eligibleStudents.length > 0 &&
      !eligibleStudents.some(st => st.id === previewStudentId)
    ) {
      setPreviewStudentId(eligibleStudents[0].id);
    }
  }, [eligibleStudents, previewStudentId]);

  const previewStudent = useMemo(
    () => eligibleStudents.find(s => s.id === previewStudentId) || eligibleStudents[0],
    [eligibleStudents, previewStudentId]
  );

  const previewStudentSection = useMemo(
    () =>
      classSections.find(s => s.id === previewStudent?.currentSectionId) || activeSection,
    [classSections, previewStudent, activeSection]
  );

  const handleSaveTemplate = (overrideEnabled?: boolean) => {
    const nextEnabled =
      overrideEnabled !== undefined ? overrideEnabled : enabledInReportTab;
    const finalSectionIds =
      selectedSectionIds.length > 0 ? selectedSectionIds : [selectedSectionId];

    saveCustomReportTemplate({
      id: currentTemplate.id,
      sectionId: selectedSectionId,
      sectionIds: finalSectionIds,
      title: title.trim() || `${activeSection?.name} Custom Report Card`,
      subtitle: subtitle.trim(),
      reportMode: 'INDIVIDUAL_STUDENT',
      enabledInReportTab: nextEnabled,
      colorBarTheme,
      columns,
      selectedSubjectIds,
      studentCustomScores: currentTemplate.studentCustomScores || {},
      updatedAt: new Date().toISOString()
    });
    setSelectedTemplateId(currentTemplate.id);
    setIsCreatingTemplate(false);
    setEnabledInReportTab(nextEnabled);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleToggleInReportTab = () => {
    const nextEnabled = !enabledInReportTab;
    handleSaveTemplate(nextEnabled);
    toggleCustomReportInReportTab(currentTemplate.id, nextEnabled);
  };

  const handleAddColumn = () => {
    const newCol: CustomReportColumn = {
      id: `col-${Date.now()}`,
      header: `CUSTOM CA (${columns.length + 1})`,
      maxScore: 10,
      sourceKey: 'custom',
      defaultValue: 0
    };
    setColumns(prev => [...prev, newCol]);
  };

  const handleUpdateColumn = (id: string, patch: Partial<CustomReportColumn>) => {
    setColumns(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleRemoveColumn = (id: string) => {
    if (columns.length <= 1) return;
    setColumns(prev => prev.filter(c => c.id !== id));
  };

  const handleToggleSubject = (subId: number) => {
    setSelectedSubjectIds(prev =>
      prev.includes(subId) ? prev.filter(id => id !== subId) : [...prev, subId]
    );
  };

  const handleToggleClassSection = (secId: number) => {
    setSelectedSectionIds(prev => {
      if (prev.includes(secId)) {
        if (prev.length <= 1) return prev;
        return prev.filter(id => id !== secId);
      }
      return [...prev, secId];
    });
  };

  const handleResetToDefault = () => {
    const isJunior = activeSection?.levelType === 'JUNIOR';
    const defaultCols: CustomReportColumn[] = isJunior
      ? [
          { id: 'col-ca1', header: 'FIRST CA (20)', maxScore: 20, sourceKey: 'ca1' },
          { id: 'col-ca2', header: 'SECOND CA (20)', maxScore: 20, sourceKey: 'ca2' },
          { id: 'col-exam', header: 'EXAM (60)', maxScore: 60, sourceKey: 'exam' }
        ]
      : [
          { id: 'col-ca1', header: 'FIRST CA (15)', maxScore: 15, sourceKey: 'ca1' },
          { id: 'col-ca2', header: 'SECOND CA (15)', maxScore: 15, sourceKey: 'ca2' },
          { id: 'col-exam', header: 'EXAM (70)', maxScore: 70, sourceKey: 'exam' }
        ];
    const defaultSubs = applicableSubjects.map(s => s.id);
    setTitle(`${activeSection?.name} Custom Report Card`);
    setSubtitle(
      `INDIVIDUAL STUDENT CUSTOM ASSESSMENT BREAKDOWN (${activeSection?.levelType} SECONDARY)`
    );
    setColumns(defaultCols);
    setSelectedSubjectIds(defaultSubs);
    setSelectedSectionIds([selectedSectionId]);
  };

  const handleCreateTemplate = () => {
    const firstSection = classSections[0];
    if (!firstSection) return;
    setSelectedSectionId(firstSection.id);
    setSelectedTemplateId(null);
    setNewTemplateId(`custom-report-${Date.now()}`);
    setIsCreatingTemplate(true);
    setSavedNotice(false);
  };

  const handleEditTemplate = (template: CustomReportTemplate) => {
    setSelectedSectionId(template.sectionId);
    setNewTemplateId('');
    setIsCreatingTemplate(false);
    setSelectedTemplateId(template.id);
    setSavedNotice(false);
  };

  const handleDeleteTemplate = (template: CustomReportTemplate) => {
    if (!window.confirm(`Delete "${template.title}"? This will also remove its custom score entries.`)) return;
    deleteCustomReportTemplate(template.id);
    if (selectedTemplateId === template.id) {
      setSelectedTemplateId(null);
      setIsCreatingTemplate(false);
    }
  };

  const handleReturnToReportList = () => {
    setSelectedTemplateId(null);
    setIsCreatingTemplate(false);
    setSavedNotice(false);
  };

  const totalMaxPossiblePerSubject = useMemo(
    () => columns.reduce((acc, c) => acc + (Number(c.maxScore) || 0), 0),
    [columns]
  );

  // Build individual student subject rows using the custom CA columns
  const studentSubjectRows = useMemo(() => {
    if (!previewStudent) return [];
    const levelType = previewStudentSection?.levelType || 'SENIOR';
    const isJunior = levelType === 'JUNIOR';
    const customScoresMap = currentTemplate.studentCustomScores || {};

    return applicableSubjects
      .filter(sub => selectedSubjectIds.includes(sub.id))
      .filter(sub => {
        const enr = enrollments.find(
          e => e.studentId === previewStudent.id && e.subjectId === sub.id
        );
        return isJunior ? true : enr ? enr.isIncluded : true;
      })
      .map(sub => {
        const rec = termSubjectRecords.find(
          r =>
            r.studentId === previewStudent.id &&
            r.subjectId === sub.id &&
            r.termId === currentTerm.id
        );
        const key = `${previewStudent.id}_${sub.id}`;
        const customSubScores = customScoresMap[key] || {};

        const colValues = columns.map(col => {
          const clamped = resolveCustomReportColumnScore(col, customSubScores, rec);
          return {
            colId: col.id,
            maxScore: col.maxScore,
            value: clamped,
            inputValue: resolveCustomReportColumnEntryValue(col, customSubScores, rec)
          };
        });

        const rawSum = Number(
          colValues.reduce((acc, c) => acc + c.value, 0).toFixed(1)
        );
        const normalizedPct =
          totalMaxPossiblePerSubject > 0
            ? Number(((rawSum / totalMaxPossiblePerSubject) * 100).toFixed(1))
            : 0;
        const customScaleBands = resolveActiveGradingScaleBands({
          levelType,
          presets: gradingScalePresets,
          isCustomReport: true,
          customTemplateId: currentTemplate.id
        });
        const gradeInfo = determineGrade(normalizedPct, levelType, customScaleBands);

        return {
          subject: sub,
          colValues,
          rawSum,
          normalizedPct,
          grade: gradeInfo.grade,
          remark: gradeInfo.description
        };
      });
  }, [
    previewStudent,
    previewStudentSection,
    currentTemplate.id,
    currentTemplate.studentCustomScores,
    applicableSubjects,
    selectedSubjectIds,
    enrollments,
    termSubjectRecords,
    currentTerm.id,
    columns,
    totalMaxPossiblePerSubject,
    gradingScalePresets
  ]);

  const logoSrc = resolveInstitutionLogoUrl(schoolProfile.logoUrl);
  const themeStyle = COLOR_BAR_THEMES[colorBarTheme] || COLOR_BAR_THEMES.EMERALD;
  const previewLevelType = previewStudentSection?.levelType || 'SENIOR';
  const activeCustomGradingScale = useMemo(() => {
    const bands = resolveActiveGradingScaleBands({
      levelType: previewLevelType,
      presets: gradingScalePresets,
      isCustomReport: true,
      customTemplateId: currentTemplate.id
    });
    return getReportCardGradingScaleDisplay(previewLevelType, bands);
  }, [previewLevelType, gradingScalePresets, currentTemplate.id]);

  return (
    <div className="space-y-6">
      <section
        data-testid="saved-custom-report-list"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900">Saved Custom Reports</h3>
            <p className="mt-1 text-xs text-slate-500">
              Review, edit, or remove saved report sheets and their assigned classes.
            </p>
          </div>
          <button
            type="button"
            data-testid="create-custom-report-btn"
            onClick={handleCreateTemplate}
            disabled={!classSections.length}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create Custom Report
          </button>
        </div>

        {customReportTemplates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
            No saved custom reports yet. Create a report sheet to configure its classes, subjects, and score sources.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {customReportTemplates.map(template => {
              const sectionIds = template.sectionIds?.length
                ? template.sectionIds
                : [template.sectionId];
              const sectionNames = sectionIds
                .map(sectionId => classSections.find(section => section.id === sectionId)?.name)
                .filter((name): name is string => Boolean(name));
              const isSelected = selectedTemplateId === template.id;
              return (
                <article
                  key={template.id}
                  className={`rounded-xl border p-4 ${
                    isSelected ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-black text-slate-900">{template.title}</h4>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Classes: {sectionNames.length ? sectionNames.join(', ') : 'No available class assigned'}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {template.selectedSubjectIds.length} subject(s) · {template.columns.length} score column(s)
                        {template.enabledInReportTab ? ' · Enabled in Reports' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${template.title}`}
                        onClick={() => handleEditTemplate(template)}
                        className="rounded-lg border border-indigo-200 bg-white p-2 text-indigo-700 hover:bg-indigo-50"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${template.title}`}
                        onClick={() => handleDeleteTemplate(template)}
                        className="rounded-lg border border-rose-200 bg-white p-2 text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isBuilderOpen && (
      <div data-testid="custom-report-sheet-builder" className="space-y-6">
      {/* Builder Configuration Panel (Hidden when printing) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-5 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Individual Student Custom Report Card Builder
              </h3>
              <p className="text-xs text-slate-500">
                Formatted like the official Student Report Card Sheet with customized CA headers/scores &amp; toggleable in the Report Cards &amp; Transcripts tab
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleReturnToReportList}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Saved Reports
            </button>
            {/* Button to Add or Remove from Report Cards & Transcripts Tab */}
            <button
              type="button"
              data-testid="toggle-custom-card-in-report-tab-btn"
              onClick={handleToggleInReportTab}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-xs ${
                enabledInReportTab
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-600'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>
                {enabledInReportTab
                  ? 'Enabled in Report Cards Tab (Click to Remove)'
                  : 'Add to Report Cards & Transcripts Tab'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              type="button"
              data-testid="save-custom-report-template-btn"
              onClick={() => handleSaveTemplate()}
              className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Custom Card</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Custom Card</span>
            </button>
          </div>
        </div>

        {savedNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Custom Report Card saved for {selectedSectionIds.length} class(es)!{' '}
              {enabledInReportTab
                ? 'It is active in the Report Cards & Transcripts dropdown.'
                : ''}
            </span>
          </div>
        )}

        {/* Primary Template Selector, Custom Name, Subtitle & Color Bar Theme */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Template Base Class
            </label>
            <select
              data-testid="custom-card-base-section-select"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-900"
            >
              {classSections.map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name} ({sec.levelType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Custom Report Card Name (Dropdown Label)
            </label>
            <input
              type="text"
              data-testid="custom-card-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-900"
              placeholder="e.g., Mid-Term Practical & Project Report Card"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Distinctive Color Bar Theme
            </label>
            <div className="relative">
              <select
                data-testid="custom-card-colorbar-select"
                value={colorBarTheme}
                onChange={(e) => setColorBarTheme(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-900"
              >
                {Object.entries(COLOR_BAR_THEMES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Preview / Score Entry Student
            </label>
            <select
              data-testid="custom-card-student-select"
              value={previewStudent?.id || ''}
              onChange={(e) => setPreviewStudentId(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-indigo-950"
            >
              {eligibleStudents.map(st => (
                <option key={st.id} value={st.id}>
                  {st.fullName} ({st.admissionNumber})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Multi-Class Selection for this Custom Report Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Classes Assigned to this Custom Report Card ({selectedSectionIds.length} Selected)
              </h4>
              <p className="text-[11px] text-slate-500">
                When this custom card is selected in the Report Cards &amp; Transcripts tab, ONLY these selected classes will be listed in the Class dropdown.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {classSections.map(sec => {
              const checked = selectedSectionIds.includes(sec.id);
              return (
                <button
                  key={sec.id}
                  type="button"
                  data-testid={`custom-card-class-Check-${sec.id}`}
                  onClick={() => handleToggleClassSection(sec.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-left text-xs font-bold transition-colors cursor-pointer ${
                    checked
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{sec.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom CA Columns Configuration */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Custom CA &amp; Exam Column Headers &amp; Maximum Scores
              </h4>
              <p className="text-[11px] text-slate-500">
                Current Total Possible per Subject:{' '}
                <strong className="text-indigo-600">{totalMaxPossiblePerSubject} Marks</strong>
              </p>
            </div>
            <button
              type="button"
              data-testid="add-custom-ca-col-btn"
              onClick={handleAddColumn}
              className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom CA Column</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {columns.map((col, idx) => (
              <div
                key={col.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    Column #{idx + 1}
                  </span>
                  {columns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveColumn(col.id)}
                      className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                      title="Remove column"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Column Header Label
                  </label>
                  <input
                    type="text"
                    data-testid={`custom-col-header-input-${idx}`}
                    value={col.header}
                    onChange={(e) => handleUpdateColumn(col.id, { header: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Max Score
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      data-testid={`custom-col-max-input-${idx}`}
                      value={col.maxScore}
                      onChange={(e) =>
                        handleUpdateColumn(col.id, { maxScore: Number(e.target.value) || 0 })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Score Source
                    </label>
                    <p className="mb-1 text-[9px] leading-relaxed text-slate-500">
                      Import a score from the current term or leave this column blank for custom entry.
                    </p>
                    <select
                      value={col.sourceKey}
                      onChange={(e) =>
                        handleUpdateColumn(col.id, {
                          sourceKey: e.target.value as CustomReportColumn['sourceKey']
                        })
                      }
                      className="w-full px-2 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
                    >
                      <option value="ca1">Import current 1st CA score</option>
                      <option value="ca2">Import current 2nd CA score</option>
                      <option value="exam">Import current exam score</option>
                      <option value="custom">Blank custom entry</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subjects Checklist */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Subjects Included ({selectedSubjectIds.length} of {applicableSubjects.length})
            </h4>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setSelectedSubjectIds(applicableSubjects.map(s => s.id))}
                className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={() => setSelectedSubjectIds([])}
                className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {applicableSubjects.map(sub => {
              const isSelected = selectedSubjectIds.includes(sub.id);
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => handleToggleSubject(sub.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-left text-xs font-semibold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{sub.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* INDIVIDUAL STUDENT CUSTOM REPORT CARD SHEET (MATCHES REPORT CARD) */}
      {/* ================================================================= */}
      {previewStudent && (
        <div
          data-testid="custom-student-report-card-preview"
          className="bg-white border-2 border-slate-900 rounded-none sm:rounded-xl shadow-xl overflow-hidden max-w-4xl mx-auto text-slate-900"
        >
          {/* Distinctive Custom Report Card Color Bar */}
          <div
            data-testid="custom-report-color-bar"
            className={`${themeStyle.barBg} text-white px-5 py-2 flex items-center justify-between text-xs font-black uppercase tracking-wider`}
          >
            <div className="flex items-center space-x-2">
              <Palette className="w-4 h-4" />
              <span>CUSTOM REPORT CARD FORMAT • {title}</span>
            </div>
            <span>
              {enabledInReportTab
                ? 'ACTIVE IN REPORT CARDS & TRANSCRIPTS TAB'
                : 'PREVIEW MODE (NOT YET ADDED TO REPORT TAB)'}
            </span>
          </div>

          <div className="p-6 space-y-4">
            {/* School Header (Matching Official Report Card Sheet) */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-xl border border-slate-300 p-1 flex items-center justify-center bg-white shrink-0">
                  <img
                    src={logoSrc}
                    alt={schoolProfile.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = DEFAULT_INSTITUTION_LOGO_DATA_URI;
                    }}
                  />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                    {schoolProfile.name}
                  </h2>
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest">
                    Motto: &ldquo;{schoolProfile.motto}&rdquo;
                  </p>
                  <p className="text-[11px] text-slate-600">{schoolProfile.address}</p>
                  <p className="text-xs font-black uppercase text-slate-800 mt-1">{title}</p>
                </div>
              </div>

              <div className="text-right text-xs space-y-0.5">
                <div className="font-black text-slate-900 uppercase">
                  {currentTerm.name} TERM • {currentSession.name}
                </div>
                <div className="text-slate-600 font-semibold">
                  Class: <strong className="text-slate-900">{previewStudentSection?.name}</strong>
                </div>
                <div className="text-slate-600 font-semibold">
                  Level: <strong className="text-slate-900">{previewStudentSection?.levelType} SECONDARY</strong>
                </div>
              </div>
            </div>

            {/* Individual Student Bio Details Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100 p-3 rounded-lg border border-slate-300 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Student Full Name
                </span>
                <span className="font-black text-slate-900 text-sm">
                  {previewStudent.fullName}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Admission Number
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {previewStudent.admissionNumber}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Class Section
                </span>
                <span className="font-bold text-slate-900">
                  {previewStudentSection?.name}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Form Tutor
                </span>
                <span className="font-bold text-slate-900">
                  {previewStudentSection?.classTeacherName}
                </span>
              </div>
            </div>

            {/* Custom Assessment Table for Individual Student */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-slate-900">
                <thead>
                  <tr className={`${themeStyle.headerBg} text-white uppercase`}>
                    <th className="border border-slate-700 py-2 px-3 text-left">
                      Subjects
                    </th>
                    {columns.map(col => (
                      <th
                        key={col.id}
                        className="border border-slate-700 py-2 px-2.5 text-center"
                      >
                        <div>{col.header}</div>
                        <div className="text-[10px] text-amber-300 font-mono">
                          Max: {col.maxScore}
                        </div>
                      </th>
                    ))}
                    <th className="border border-slate-700 py-2 px-2.5 text-center bg-slate-950">
                      <div>
                        {currentTerm.name === 'FIRST'
                          ? 'First Term Total'
                          : currentTerm.name === 'SECOND'
                          ? 'Second Term Total'
                          : 'Third Term Total'}
                      </div>
                      <div className="text-[10px] text-amber-300 font-mono">
                        ({totalMaxPossiblePerSubject})
                      </div>
                    </th>
                    <th className="border border-slate-700 py-2 px-2.5 text-center">
                      Grade
                    </th>
                    <th className="border border-slate-700 py-2 px-3 text-left">
                      Remark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentSubjectRows.map(row => (
                    <tr key={row.subject.id} className="odd:bg-white even:bg-slate-50">
                      <td className="border border-slate-400 py-1.5 px-3 font-bold text-slate-900">
                        {row.subject.name}
                      </td>
                      {row.colValues.map(cell => (
                        <td
                          key={cell.colId}
                          className="border border-slate-400 py-1 px-2 text-center font-mono"
                        >
                          <input
                            type="number"
                            min={0}
                            max={cell.maxScore}
                            step="0.5"
                            disabled={Boolean(previewStudent.isRecordSealed)}
                            value={cell.inputValue}
                            onChange={(e) =>
                              updateStudentCustomReportScore(
                                currentTemplate.id,
                                previewStudent.id,
                                row.subject.id,
                                cell.colId,
                                e.target.value.trim() ? Number(e.target.value) : null
                              )
                            }
                            className="w-16 text-center font-mono font-bold border border-slate-300 rounded px-1 py-0.5 bg-white print:border-none"
                          />
                        </td>
                      ))}
                      <td className="border border-slate-400 py-1.5 px-2.5 text-center font-mono font-black text-indigo-950 bg-indigo-50/40">
                        {row.rawSum.toFixed(1)}
                      </td>
                      <td className="border border-slate-400 py-1.5 px-2.5 text-center font-black">
                        {row.rawSum > 0 ? row.grade : '-'}
                      </td>
                      <td className="border border-slate-400 py-1.5 px-3 font-semibold text-slate-700">
                        {row.rawSum > 0 ? row.remark : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {studentSubjectRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-900">
                      <td className="border border-slate-400 py-2 px-3 uppercase">
                        Sum of Scores ({studentSubjectRows.length} Subjects)
                      </td>
                      {columns.map((col, cIdx) => {
                        const colSum = studentSubjectRows.reduce(
                          (acc, r) => acc + (r.colValues[cIdx]?.value || 0),
                          0
                        );
                        const colPossible = studentSubjectRows.length * col.maxScore;
                        return (
                          <td
                            key={col.id}
                            className="border border-slate-400 py-2 px-2 text-center font-mono text-[11px]"
                          >
                            {colSum.toFixed(1)} over {colPossible}
                          </td>
                        );
                      })}
                      <td className="border border-slate-400 py-2 px-2.5 text-center font-mono text-[11px] bg-indigo-100/70">
                        {studentSubjectRows
                          .reduce((acc, r) => acc + r.rawSum, 0)
                          .toFixed(1)}{' '}
                        over {studentSubjectRows.length * totalMaxPossiblePerSubject}
                      </td>
                      <td colSpan={2} className="border border-slate-400 py-2 px-3 text-right">
                        Average Score:{' '}
                        {(
                          studentSubjectRows.reduce((acc, r) => acc + r.normalizedPct, 0) /
                          studentSubjectRows.length
                        ).toFixed(1)}
                        %
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Official Grading Scale (Single Horizontal Line) */}
            <div className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 flex items-center justify-between gap-2 whitespace-nowrap overflow-x-auto">
              <span className="uppercase font-black text-slate-900">
                Official Grading Scale:
              </span>
              <span>
                {activeCustomGradingScale
                  .map(item => `${item.grade} (${item.range} ${item.remark})`)
                  .join(' • ')}
              </span>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
};
