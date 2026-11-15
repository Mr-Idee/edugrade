import type { UserRole } from '../types/index.ts';

interface LinkableStaffAccount {
  role: UserRole;
  supabaseAuthUserId?: string;
  mustSetPassword: boolean;
  hashHex?: string;
  saltHex?: string;
}

export function findLinkedSuperAdminUsername(
  vault: Record<string, LinkableStaffAccount>,
  authUserId: string
): string | null {
  const matches = Object.entries(vault).filter(
    ([, account]) =>
      account.role === 'SUPER_ADMIN' &&
      account.supabaseAuthUserId === authUserId &&
      !account.mustSetPassword &&
      Boolean(account.hashHex && account.saltHex)
  );
  return matches.length === 1 ? matches[0][0] : null;
}
