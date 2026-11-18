import type { ReligiousStudiesChoice, Student, Subject } from '../types';

export const RELIGIOUS_STUDIES_SUBJECT_ID = 35;

export const isReligiousStudiesSubject = (
  subject: Pick<Subject, 'id'> | undefined
): boolean => Number(subject?.id) === RELIGIOUS_STUDIES_SUBJECT_ID;

export const getStudentReligiousStudiesChoice = (
  student: Pick<Student, 'religiousStudiesChoiceBySession'> | undefined,
  sessionId: number | undefined
): ReligiousStudiesChoice | undefined => {
  if (!student || sessionId === undefined) return undefined;
  const choice = student.religiousStudiesChoiceBySession?.[String(sessionId)];
  return choice === 'CRS' || choice === 'IRS' ? choice : undefined;
};

export const getReligiousStudiesLabel = (choice: ReligiousStudiesChoice): string =>
  choice === 'CRS' ? 'CHRISTIAN RELIGIOUS STUDIES' : 'ISLAMIC RELIGIOUS STUDIES';

export const getSubjectDisplayName = (
  subject: (Pick<Subject, 'name' | 'sectionNameOverrides'> & Partial<Pick<Subject, 'id'>>) | undefined,
  sectionId?: number,
  religiousStudiesChoice?: ReligiousStudiesChoice
): string => {
  if (!subject) return '';
  if (Number(subject.id) === RELIGIOUS_STUDIES_SUBJECT_ID) {
    return religiousStudiesChoice
      ? getReligiousStudiesLabel(religiousStudiesChoice)
      : 'RELIGIOUS STUDIES (CRS / IRS)';
  }
  return (sectionId === undefined ? undefined : subject.sectionNameOverrides?.[String(sectionId)]) || subject.name;
};

export const withStudentReligiousStudiesChoice = (
  student: Pick<Student, 'religiousStudiesChoiceBySession'>,
  sessionId: number,
  choice: ReligiousStudiesChoice | undefined
): Record<string, ReligiousStudiesChoice> => {
  const next = { ...(student.religiousStudiesChoiceBySession || {}) };
  if (choice) next[String(sessionId)] = choice;
  else delete next[String(sessionId)];
  return next;
};
