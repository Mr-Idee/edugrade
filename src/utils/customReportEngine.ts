import type { CustomReportColumn, CustomReportTemplate } from '../types';

interface CustomReportTermRecord {
  ca1Score?: number | null;
  ca2Score?: number | null;
  examScore?: number | null;
}

export function getCustomReportSectionIds(
  template: Pick<CustomReportTemplate, 'sectionId' | 'sectionIds'>,
  availableSectionIds?: readonly number[]
): number[] {
  const templateSectionIds = template.sectionIds?.length
    ? template.sectionIds
    : [template.sectionId];
  return availableSectionIds
    ? templateSectionIds.filter(sectionId => availableSectionIds.includes(sectionId))
    : [...templateSectionIds];
}

export function getCustomReportTemplatesForSection<T extends Pick<CustomReportTemplate, 'sectionId' | 'sectionIds'>>(
  templates: T[],
  sectionId: number
): T[] {
  return templates.filter(template => getCustomReportSectionIds(template).includes(sectionId));
}

export function resolveCustomReportColumnScore(
  column: CustomReportColumn,
  customScores: Record<string, number | null | undefined> | undefined,
  termRecord: CustomReportTermRecord | undefined
): number {
  let value: number | null | undefined;
  if (customScores && Object.prototype.hasOwnProperty.call(customScores, column.id)) {
    value = customScores[column.id];
  } else if (column.sourceKey === 'ca1') {
    value = termRecord?.ca1Score;
  } else if (column.sourceKey === 'ca2') {
    value = termRecord?.ca2Score;
  } else if (column.sourceKey === 'exam') {
    value = termRecord?.examScore;
  } else {
    value = column.defaultValue;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Number(Math.min(column.maxScore, Math.max(0, numericValue)).toFixed(1));
}

export function resolveCustomReportColumnEntryValue(
  column: CustomReportColumn,
  customScores: Record<string, number | null | undefined> | undefined,
  termRecord: CustomReportTermRecord | undefined
): number | '' {
  const hasSavedOverride = Boolean(
    customScores &&
    Object.prototype.hasOwnProperty.call(customScores, column.id) &&
    customScores[column.id] !== null &&
    customScores[column.id] !== undefined
  );
  if (column.sourceKey === 'custom' && !hasSavedOverride) return '';
  return resolveCustomReportColumnScore(column, customScores, termRecord);
}

export function mergeScopedCustomReportScores(
  existingScores: Record<string, unknown> | undefined,
  submittedScores: Record<string, unknown> | undefined,
  canEdit: (studentId: number, subjectId: number) => boolean
): Record<string, unknown> {
  const merged = { ...(existingScores || {}) };
  const incoming = submittedScores || {};
  const keys = new Set([...Object.keys(merged), ...Object.keys(incoming)]);
  for (const key of keys) {
    const match = /^(\d+)_(\d+)$/.exec(key);
    if (!match || !canEdit(Number(match[1]), Number(match[2]))) continue;
    if (Object.prototype.hasOwnProperty.call(incoming, key)) merged[key] = incoming[key];
    else delete merged[key];
  }
  return merged;
}
