import assert from 'node:assert/strict';
import test from 'node:test';
import { findLinkedSuperAdminUsername } from './supabaseAuthMapping.ts';

const activeSuperAdmin = {
  role: 'SUPER_ADMIN' as const,
  supabaseAuthUserId: 'auth-user-1',
  mustSetPassword: false,
  hashHex: 'hash',
  saltHex: 'salt'
};

test('Supabase identity resolves only to one active linked Super Admin account', () => {
  assert.equal(
    findLinkedSuperAdminUsername({ superadmin: activeSuperAdmin }, 'auth-user-1'),
    'superadmin'
  );
  assert.equal(findLinkedSuperAdminUsername({ superadmin: activeSuperAdmin }, 'other-user'), null);
});

test('Supabase identity cannot log in as staff, an uninitialized account, or an ambiguous link', () => {
  assert.equal(
    findLinkedSuperAdminUsername(
      { teacher: { ...activeSuperAdmin, role: 'CLASS_TEACHER' } },
      'auth-user-1'
    ),
    null
  );
  assert.equal(
    findLinkedSuperAdminUsername(
      { superadmin: { ...activeSuperAdmin, mustSetPassword: true } },
      'auth-user-1'
    ),
    null
  );
  assert.equal(
    findLinkedSuperAdminUsername(
      { superadmin: activeSuperAdmin, admin: activeSuperAdmin },
      'auth-user-1'
    ),
    null
  );
});
