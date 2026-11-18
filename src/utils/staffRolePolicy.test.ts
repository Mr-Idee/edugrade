import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canViewSubjectRecordInReport,
  getStaffVisibleToUser,
  findTeacherForUser,
  findNewInvalidTeacherSubjectAssignments,
  isSubjectApplicableToSection,
  resolveTeacherScoreSelection
} from './staffRolePolicy';
import type { ClassSection, Subject, TeacherSubjectAssignment } from '../types/index';

test('staff lookup prefers username over a colliding numeric ID', () => {
  const teachers = [
    { id: 7, username: 'other.teacher' },
    { id: 8, username: 'etentuk.idara' }
  ];

  assert.equal(
    findTeacherForUser(teachers, { id: 7, username: 'ETENTUK.IDARA' }),
    teachers[1]
  );
});

test('staff lookup does not fall back to a different teacher ID when a username is present', () => {
  const teachers = [{ id: 7, username: 'other.teacher' }];

  assert.equal(
    findTeacherForUser(teachers, { id: 7, username: 'missing.teacher' }),
    undefined
  );
});

test('staff lookup uses numeric ID only for identities without a username', () => {
  const teachers = [{ id: 7, username: 'other.teacher' }];

  assert.equal(findTeacherForUser(teachers, { id: 7 }), teachers[0]);
});

test('restricted staff snapshots expose only the matching staff record', () => {
  const teachers = [
    { id: 7, username: 'etentuk.victor' },
    { id: 8, username: 'head.of.schools' }
  ];

  assert.deepEqual(
    getStaffVisibleToUser(teachers, { id: 7, username: 'etentuk.victor' }, false),
    [teachers[0]]
  );
  assert.deepEqual(getStaffVisibleToUser(teachers, { id: 7 }, true), teachers);
});

test('score selection restores a valid assigned class and subject when the saved class is stale', () => {
  const assignments: TeacherSubjectAssignment[] = [
    { sectionId: 8, subjectId: 12 }
  ];
  const sections: Pick<ClassSection, 'id' | 'levelType'>[] = [
    { id: 8, levelType: 'JUNIOR' }
  ];
  const subjects: Subject[] = [
    { id: 12, name: 'Digital Technologies', code: 'DT', category: 'CORE', applicableLevel: 'JUNIOR' }
  ];

  assert.deepEqual(
    resolveTeacherScoreSelection(assignments, sections, subjects, 4, 1),
    assignments[0]
  );
});

test('score selection preserves a valid current assignment and rejects invalid class-level pairs', () => {
  const assignments: TeacherSubjectAssignment[] = [
    { sectionId: 8, subjectId: 12 },
    { sectionId: 9, subjectId: 15 }
  ];
  const sections: Pick<ClassSection, 'id' | 'levelType'>[] = [
    { id: 8, levelType: 'JUNIOR' },
    { id: 9, levelType: 'SENIOR' }
  ];
  const subjects: Subject[] = [
    { id: 12, name: 'Digital Technologies', code: 'DT', category: 'CORE', applicableLevel: 'JUNIOR' },
    { id: 15, name: 'Physics', code: 'PHY', category: 'CORE', applicableLevel: 'SENIOR' },
    { id: 16, name: 'Mathematics', code: 'MATH', category: 'CORE', applicableLevel: 'JUNIOR' }
  ];

  assert.deepEqual(
    resolveTeacherScoreSelection(assignments, sections, subjects, 9, 15),
    assignments[1]
  );
  assert.deepEqual(
    resolveTeacherScoreSelection([{ sectionId: 9, subjectId: 16 }], sections, subjects, 9, 16),
    undefined
  );
});

test('subject assignment validation rejects new level mismatches but tolerates unchanged legacy data', () => {
  const previous = {
    teachers: [{ id: 7, assignedSubjects: [] as TeacherSubjectAssignment[] }],
    classSections: [{ id: 1, levelType: 'JUNIOR' as const }],
    subjects: [
      { id: 5, applicableLevel: 'SENIOR' as const },
      { id: 31, applicableLevel: 'JUNIOR' as const }
    ]
  };
  const invalidNext = {
    ...previous,
    teachers: [{ id: 7, assignedSubjects: [{ sectionId: 1, subjectId: 5 }] }]
  };
  const validNext = {
    ...previous,
    teachers: [{ id: 7, assignedSubjects: [{ sectionId: 1, subjectId: 31 }] }]
  };

  assert.deepEqual(
    findNewInvalidTeacherSubjectAssignments(previous, invalidNext),
    [{ teacherId: 7, sectionId: 1, subjectId: 5, reason: 'level-mismatch' }]
  );
  assert.deepEqual(findNewInvalidTeacherSubjectAssignments(previous, validNext), []);
  assert.deepEqual(
    findNewInvalidTeacherSubjectAssignments(invalidNext, invalidNext),
    []
  );
});

test('subject applicability includes BOTH and rejects cross-level assignments', () => {
  const junior = { levelType: 'JUNIOR' as const };
  const senior = { levelType: 'SENIOR' as const };

  assert.equal(isSubjectApplicableToSection({ applicableLevel: 'BOTH' }, junior), true);
  assert.equal(isSubjectApplicableToSection({ applicableLevel: 'JUNIOR' }, junior), true);
  assert.equal(isSubjectApplicableToSection({ applicableLevel: 'SENIOR' }, junior), false);
  assert.equal(isSubjectApplicableToSection({ applicableLevel: 'SENIOR' }, senior), true);
});

test('subject teachers can view all applicable report subjects in their assigned classes', () => {
  const junior = { levelType: 'JUNIOR' as const };

  assert.equal(
    canViewSubjectRecordInReport(
      'SUBJECT_TEACHER',
      junior,
      { applicableLevel: 'JUNIOR' },
      false
    ),
    true
  );
  assert.equal(
    canViewSubjectRecordInReport(
      'SUBJECT_TEACHER',
      junior,
      { applicableLevel: 'SENIOR' },
      false
    ),
    false
  );
  assert.equal(
    canViewSubjectRecordInReport(
      'CLASS_TEACHER',
      junior,
      { applicableLevel: 'JUNIOR' },
      false
    ),
    false
  );
  assert.equal(
    canViewSubjectRecordInReport(
      'CLASS_TEACHER',
      junior,
      { applicableLevel: 'JUNIOR' },
      true
    ),
    true
  );
});
