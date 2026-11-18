import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStaffVisibleToUser,
  findTeacherForUser,
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
