import type {
  AcademicSession,
  ClassSection,
  SchoolProfile,
  Student,
  StudentSubjectEnrollment,
  Subject,
  Term
} from '../types/index';
import { isSubjectApplicableToSection } from './staffRolePolicy.ts';

type FormTutorEnrollmentState = {
  students: Array<Pick<Student, 'id' | 'admissionNumber'>>;
  enrollments: Array<Pick<StudentSubjectEnrollment, 'id'>>;
  classSections: Array<Pick<ClassSection, 'id' | 'levelType'>>;
  subjects: Array<Pick<Subject, 'id' | 'applicableLevel' | 'category'>>;
  sessions: Array<Pick<AcademicSession, 'id' | 'name' | 'isCurrent'>>;
  terms: Array<Pick<Term, 'id' | 'sessionId' | 'name'>>;
  schoolProfile: Pick<SchoolProfile, 'currentSession' | 'currentTerm'>;
};

type SubmittedFormTutorData = {
  students: Array<Pick<
    Student,
    'id' | 'fullName' | 'admissionNumber' | 'currentSectionId' | 'gender'
  >>;
  enrollments: Array<Pick<
    StudentSubjectEnrollment,
    'id' | 'studentId' | 'sectionId' | 'subjectId' | 'termId' | 'isIncluded'
  >>;
};

export class FormTutorEnrollmentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FormTutorEnrollmentError';
  }
}

function positiveId(value: unknown): number | undefined {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function prepareFormTutorStudentAdditions(
  current: FormTutorEnrollmentState,
  submitted: SubmittedFormTutorData,
  authorization: { isFormTutor: boolean; formSectionId?: number }
): { students: Student[]; enrollments: StudentSubjectEnrollment[] } {
  const existingStudentIds = new Set(
    current.students.map(student => positiveId(student.id)).filter((id): id is number => id !== undefined)
  );
  const newStudents = submitted.students.filter(
    student => !existingStudentIds.has(positiveId(student.id) || -1)
  );
  if (newStudents.length === 0) return { students: [], enrollments: [] };
  const formSectionId = positiveId(authorization.formSectionId);
  if (!authorization.isFormTutor || formSectionId === undefined) {
    throw new FormTutorEnrollmentError('Only the form tutor can add students to a class.', 403);
  }

  const formSection = current.classSections.find(section => section.id === formSectionId);
  if (!formSection) {
    throw new FormTutorEnrollmentError('The assigned form-tutor class is not available.', 409);
  }

  const admissionNumbers = new Set(
    current.students
      .map(student => student.admissionNumber.trim().toUpperCase())
      .filter(Boolean)
  );
  const newStudentIds = new Set<number>();
  const students: Student[] = [];
  for (const student of newStudents) {
    const studentId = positiveId(student.id);
    const fullName = typeof student.fullName === 'string' ? student.fullName.trim() : '';
    const admissionNumber =
      typeof student.admissionNumber === 'string' ? student.admissionNumber.trim().toUpperCase() : '';
    if (
      studentId === undefined ||
      newStudentIds.has(studentId) ||
      fullName.length === 0 ||
      fullName.length > 160 ||
      admissionNumber.length === 0 ||
      admissionNumber.length > 80 ||
      student.currentSectionId !== formSectionId ||
      !['MALE', 'FEMALE'].includes(student.gender)
    ) {
      throw new FormTutorEnrollmentError(
        'The new student record is incomplete or invalid for your assigned class.',
        400
      );
    }
    if (admissionNumbers.has(admissionNumber)) {
      throw new FormTutorEnrollmentError(`Admission number ${admissionNumber} is already in use.`, 409);
    }

    newStudentIds.add(studentId);
    admissionNumbers.add(admissionNumber);
    students.push({
      id: studentId,
      fullName,
      admissionNumber,
      currentSectionId: formSectionId,
      gender: student.gender,
      promotionStatus: 'ENROLLED'
    });
  }

  const activeSession = current.sessions.find(session => session.isCurrent) ||
    current.sessions.find(session => session.name === current.schoolProfile.currentSession);
  const activeTerm = activeSession && current.terms.find(term =>
    term.sessionId === activeSession.id &&
    term.name === current.schoolProfile.currentTerm
  );
  if (!activeTerm) {
    throw new FormTutorEnrollmentError(
      'The active academic term is not configured; students cannot be enrolled.',
      409
    );
  }

  const usedEnrollmentIds = new Set(
    current.enrollments.map(enrollment => positiveId(enrollment.id)).filter((id): id is number => id !== undefined)
  );
  let nextEnrollmentId = Math.max(0, ...usedEnrollmentIds) + 1;
  const applicableSubjects = current.subjects.filter(subject =>
    isSubjectApplicableToSection(subject, formSection)
  );
  const enrollments: StudentSubjectEnrollment[] = [];
  for (const student of students) {
    const requestedEnrollments = new Map(
      submitted.enrollments
        .filter(enrollment =>
          enrollment.studentId === student.id &&
          enrollment.sectionId === formSectionId &&
          enrollment.termId === activeTerm.id
        )
        .map(enrollment => [enrollment.subjectId, enrollment])
    );
    for (const subject of applicableSubjects) {
      const requested = requestedEnrollments.get(subject.id);
      let enrollmentId = positiveId(requested?.id);
      if (enrollmentId === undefined || usedEnrollmentIds.has(enrollmentId)) {
        while (usedEnrollmentIds.has(nextEnrollmentId)) nextEnrollmentId += 1;
        enrollmentId = nextEnrollmentId++;
      }
      usedEnrollmentIds.add(enrollmentId);
      enrollments.push({
        id: enrollmentId,
        studentId: student.id,
        sectionId: formSectionId,
        subjectId: subject.id,
        termId: activeTerm.id,
        isIncluded: formSection.levelType === 'JUNIOR'
          ? true
          : typeof requested?.isIncluded === 'boolean'
            ? requested.isIncluded
            : subject.category === 'CORE'
      });
    }
  }

  return { students, enrollments };
}
