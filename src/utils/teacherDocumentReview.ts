import type {
  AcademicDepartment,
  Teacher,
  TeacherDocumentExecutiveRemark,
  TeacherDocumentUpload
} from '../types/index';
import { getDepartmentForSubject } from './rbacAndAuth';

export function resolveDocumentRemarkAuthorName(
  remark: TeacherDocumentExecutiveRemark,
  teachers: Teacher[],
  departments: AcademicDepartment[]
): string {
  const designation = remark.authorDesignation || '';
  if (/hod|head of department/i.test(designation)) {
    const department =
      departments.find(item => item.id === remark.departmentId) ||
      departments.find(item => designation.includes(item.name));
    const currentHod = department
      ? teachers.find(teacher => teacher.id === department.hodTeacherId)
      : undefined;
    if (currentHod) return currentHod.fullName;
  }

  if (
    remark.authorRole === 'PRINCIPAL' ||
    remark.authorRole === 'VICE_PRINCIPAL' ||
    remark.authorRole === 'HEAD_OF_SCHOOLS'
  ) {
    const currentRoleHolder = teachers.find(teacher => teacher.systemRole === remark.authorRole);
    if (currentRoleHolder) return currentRoleHolder.fullName;
  }

  return remark.authorName;
}

export function resolveCurrentHodReviewer(
  document: TeacherDocumentUpload,
  teachers: Teacher[],
  departments: AcademicDepartment[]
): string | undefined {
  if (!document.hodReviewedBy) return undefined;
  const department =
    departments.find(item => item.id === document.departmentId) ||
    getDepartmentForSubject(document.subjectId, departments);
  if (!department) return document.hodReviewedBy;

  const currentHod =
    teachers.find(teacher => teacher.id === department.hodTeacherId)?.fullName ||
    department.hodTeacherName;
  return currentHod
    ? `${currentHod} (Head of Department (${department.name}))`
    : document.hodReviewedBy;
}

export function isDocumentInHodScope(
  document: TeacherDocumentUpload,
  departments: AcademicDepartment[]
): boolean {
  return departments.some(
    department =>
      document.departmentId === department.id ||
      (department.subjectIds || []).some(subjectId => Number(subjectId) === Number(document.subjectId))
  );
}

export function mergeDocumentReviewUpdate(
  existing: TeacherDocumentUpload,
  submitted: TeacherDocumentUpload
): TeacherDocumentUpload {
  return {
    ...existing,
    status: submitted.status,
    hodReviewStatus: submitted.hodReviewStatus,
    hodReviewedBy: submitted.hodReviewedBy,
    hodReviewedAt: submitted.hodReviewedAt,
    executiveRemarks: submitted.executiveRemarks
  };
}
