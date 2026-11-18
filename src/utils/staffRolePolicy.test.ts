import assert from 'node:assert/strict';
import test from 'node:test';
import { findTeacherForUser } from './staffRolePolicy';

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
