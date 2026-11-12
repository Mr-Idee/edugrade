/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types/index';
import {
  ALLOWED_ROLES,
  AppTab,
  canAccessMasterSettings,
  canAccessClassManagement,
  canFreelySwitchRoles,
  generateTeacherUsername,
  validateStrictPassword,
  resolveInstitutionLogoUrl,
  DEFAULT_INSTITUTION_LOGO_DATA_URI,
  getTeachersCornerTabTitle,
  getTeacherHodDesignation
} from '../utils/rbacAndAuth';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Home,
  Table,
  LayoutDashboard,
  FileText,
  History,
  Settings,
  GraduationCap,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  Layers,
  KeyRound,
  Menu,
  X,
  Lock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  Briefcase,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface NavigationProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const {
    schoolProfile,
    currentRole,
    setCurrentRole,
    currentUser,
    currentSession,
    currentTerm,
    classSections,
    selectedSectionId,
    setSelectedSectionId,
    teachers,
    academicDepartments,
    completeTeacherPasswordSetup,
    requestPasswordResetForUsername,
    isStaffLoggedIn,
    isSecurityUnlocked,
    welcomeNotification,
    dismissWelcomeNotification,
    isAuthModalOpen,
    openAuthModal,
    closeAuthModal,
    completeStaffLogin,
    lockSecurity
  } = useApp();

  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  // Floating Action Button (FAB) fluid menu state
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  // Staff Login / First-Time Password Setup / Forgot Password Modal State
  const [authStep, setAuthStep] = useState<'LOGIN' | 'FIRST_TIME_SETUP' | 'FORGOT_PASSWORD'>('LOGIN');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [pendingServerAccountSetup, setPendingServerAccountSetup] = useState<{
    username: string;
    fullName: string;
    role: UserRole;
  } | null>(null);

  const passwordValidation = validateStrictPassword(newPassword);

  // Role Switch Password Verification Modal State (for non-Super Admin users)
  const [pendingRoleSwitch, setPendingRoleSwitch] = useState<UserRole | null>(null);
  const [roleSwitchPassword, setRoleSwitchPassword] = useState('');
  const [showRoleSwitchPassword, setShowRoleSwitchPassword] = useState(false);
  const [roleSwitchError, setRoleSwitchError] = useState<string | null>(null);

  const findRepresentativeTeacherForRole = (role: UserRole) => {
    if (role === 'SUPER_ADMIN') {
      return {
        id: 999,
        staffId: 'ADMIN-01',
        fullName: 'Administrator',
        username: 'superadmin',
        email: 'admin@example.invalid',
        phone: '',
        role: 'BOTH' as const,
        systemRole: 'SUPER_ADMIN' as UserRole,
        mustSetPassword: false,
        hasPasswordSet: true,
        passwordResetRequested: false
      };
    }
    return (
      teachers.find(t => t.systemRole === role) ||
      (role === 'SUBJECT_TEACHER'
        ? teachers.find(t => t.role === 'SUBJECT_TEACHER')
        : role === 'CLASS_TEACHER'
        ? teachers.find(t => t.role === 'FORM_TUTOR' || t.role === 'BOTH')
        : teachers[0])
    );
  };

  const applyRoleSwitchSuccess = (role: UserRole) => {
    const roleTeacher = findRepresentativeTeacherForRole(role);
    if (roleTeacher) {
      completeStaffLogin(
        {
          id: roleTeacher.id,
          fullName: roleTeacher.fullName,
          username: roleTeacher.username || generateTeacherUsername(roleTeacher.fullName),
          email: roleTeacher.email,
          role,
          isActive: true,
          assignedSectionId: roleTeacher.assignedSectionId || undefined,
          assignedSubjects: roleTeacher.assignedSubjects || []
        },
        role,
        roleTeacher.assignedSectionId || undefined
      );
    } else {
      setCurrentRole(role);
    }

    if (!canAccessMasterSettings(role) && activeTab === 'settings') {
      setActiveTab('home');
    }
    if (!canAccessClassManagement(role) && activeTab === 'class_management') {
      setActiveTab('home');
    }
  };

  const handleRoleSwitch = (role: UserRole) => {
    setIsRoleMenuOpen(false);
    if (role === currentRole && isStaffLoggedIn) {
      return;
    }

    // Only SUPER_ADMIN reserves the absolute right to change roles freely
    if (canFreelySwitchRoles(currentRole, isStaffLoggedIn, currentUser.role)) {
      applyRoleSwitchSuccess(role);
      return;
    }

    // Block immediate role switch for any other user and require password verification
    setPendingRoleSwitch(role);
    setRoleSwitchPassword('');
    setShowRoleSwitchPassword(false);
    setRoleSwitchError(null);
  };

  const handleConfirmRoleSwitchPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRoleSwitch) return;
    setRoleSwitchError(null);

    const entered = roleSwitchPassword.trim();
    if (!entered) {
      setRoleSwitchError('Password or authorization PIN is required to access this role.');
      return;
    }

    const roleTeacher = findRepresentativeTeacherForRole(pendingRoleSwitch);
    if (!roleTeacher) {
      setRoleSwitchError('Access blocked: Invalid password or authorization PIN for the requested role.');
      return;
    }
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: roleTeacher.username || generateTeacherUsername(roleTeacher.fullName),
          password: entered
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok || result.requiresPasswordSetup) {
        setRoleSwitchError(result.error || 'Sign in with this role’s staff password first.');
        return;
      }
    } catch {
      setRoleSwitchError('Could not verify this role with the server. Check your connection and try again.');
      return;
    }

    const target = pendingRoleSwitch;
    setPendingRoleSwitch(null);
    setRoleSwitchPassword('');
    setRoleSwitchError(null);
    applyRoleSwitchSuccess(target);
    window.setTimeout(() => window.location.reload(), 0);
  };

  // Staff Username + 4-Digit Initial PIN / Password Login handler
  const handleStaffLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    const cleanUser = loginUsername.trim().toLowerCase();
    const enteredPinOrPass = loginPassword.trim();
    if (!cleanUser) {
      setAuthMessage({ type: 'error', text: 'Please enter your staff username.' });
      return;
    }

    try {
      const username = cleanUser === 'idee' ? 'superadmin' : cleanUser;
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: loginPassword.trim(),
          initialPin: loginPassword.trim()
        })
      });
      const result = await response.json();
      const serverRole = ALLOWED_ROLES.find(item => item.role === result.role)?.role;
      if (!response.ok || !result.ok || !serverRole) {
        setAuthMessage({ type: 'error', text: result.error || 'The username or password is invalid.' });
        return;
      }
      if (result.requiresPasswordSetup) {
        setPendingServerAccountSetup({
          username: result.username,
          fullName: result.fullName || 'Staff Member',
          role: serverRole
        });
        setAuthStep('FIRST_TIME_SETUP');
        setAuthMessage({
          type: 'info',
          text: 'Initial PIN verified. Create a new password to secure this account.'
        });
        return;
      }
      const teacher = teachers.find(
        item => (item.username || generateTeacherUsername(item.fullName)).toLowerCase() === username
      );
      completeStaffLogin(
        {
          id: teacher?.id ?? (serverRole === 'SUPER_ADMIN' ? 999 : 0),
          fullName: result.fullName || teacher?.fullName || 'Staff Member',
          username: result.username,
          email: teacher?.email || '',
          role: serverRole,
          isActive: true,
          hasPasswordSet: true,
          mustSetPassword: false,
          assignedSectionId: teacher?.assignedSectionId || undefined,
          assignedSubjects: teacher?.assignedSubjects || []
        },
        serverRole,
        teacher?.assignedSectionId || undefined
      );
      setLoginPassword('');
      setShowLoginPassword(false);
      closeAuthModal();
      window.setTimeout(() => window.location.reload(), 0);
    } catch {
      setAuthMessage({
        type: 'error',
        text: 'Could not verify this account with the server. Check your connection and try again.'
      });
    }
    return;
  };

  // First-Time Password Setup submit handler (enforces >8 chars, 1 uppercase, 1 number/special char)
  const handleFirstTimePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);

    const validation = validateStrictPassword(newPassword);
    if (!validation.valid) {
      setAuthMessage({
        type: 'error',
        text: validation.errors[0] || 'Password must be longer than 8 characters, with at least 1 uppercase letter and 1 number or special character.'
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setAuthMessage({ type: 'error', text: 'New password and confirmation password do not match.' });
      return;
    }

    const cleanUser = loginUsername.trim().toLowerCase();
    const result = await completeTeacherPasswordSetup(cleanUser, newPassword, loginPassword);
    if (!result.ok) {
      setAuthMessage({ type: 'error', text: result.message });
      return;
    }
    try {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: newPassword })
      });
      const loginResult = await loginResponse.json();
      if (!loginResponse.ok || !loginResult.ok || loginResult.requiresPasswordSetup) {
        setAuthMessage({
          type: 'error',
          text: loginResult.error || 'Password was saved, but sign-in could not be completed. Please sign in again.'
        });
        return;
      }
    } catch {
      setAuthMessage({
        type: 'error',
        text: 'Password was saved, but sign-in could not be completed. Please sign in again.'
      });
      return;
    }

    const matchedTeacher = teachers.find(
      t => (t.username || generateTeacherUsername(t.fullName)).toLowerCase() === cleanUser
    );
    const pendingSetup =
      pendingServerAccountSetup?.username === cleanUser ? pendingServerAccountSetup : null;
    const targetRole: UserRole = matchedTeacher
      ? matchedTeacher.systemRole ||
        (matchedTeacher.role === 'SUBJECT_TEACHER' ? 'SUBJECT_TEACHER' : 'CLASS_TEACHER')
      : pendingSetup?.role || 'CLASS_TEACHER';

    setNewPassword('');
    setConfirmNewPassword('');
    setLoginPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setAuthStep('LOGIN');
    setAuthMessage(null);
    setPendingServerAccountSetup(null);

    if (matchedTeacher || pendingSetup) {
      completeStaffLogin(
        {
          id: matchedTeacher?.id ?? (targetRole === 'SUPER_ADMIN' ? 999 : 0),
          fullName: matchedTeacher?.fullName || pendingSetup?.fullName || 'Staff Member',
          username: cleanUser,
          email: matchedTeacher?.email || '',
          role: targetRole,
          isActive: true,
          assignedSectionId: matchedTeacher?.assignedSectionId || undefined,
          assignedSubjects: matchedTeacher?.assignedSubjects || []
        },
        targetRole,
        matchedTeacher?.assignedSectionId || undefined
      );
      window.setTimeout(() => window.location.reload(), 0);
    }
  };

  // Request Forgotten Password Reset handler
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    const result = await requestPasswordResetForUsername(loginUsername);
    setAuthMessage({
      type: result.ok ? 'success' : 'error',
      text: result.message
    });
  };

  const logoSrc = resolveInstitutionLogoUrl(schoolProfile.logoUrl);

  const activeHodInfo = getTeacherHodDesignation(
    currentUser.id,
    academicDepartments,
    currentUser.username,
    currentUser.fullName
  );

  const teachersCornerLabel =
    currentRole !== 'SUPER_ADMIN' &&
    currentRole !== 'PRINCIPAL' &&
    currentRole !== 'HEAD_OF_SCHOOLS' &&
    currentRole !== 'VICE_PRINCIPAL' &&
    activeHodInfo.isHod
      ? `${getTeachersCornerTabTitle(currentRole)} • HOD Office`
      : getTeachersCornerTabTitle(currentRole);

  const navItems: Array<{
    id: AppTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
    accent?: boolean;
  }> = [
    {
      id: 'home',
      label: 'Home Overview',
      shortLabel: 'Home',
      icon: Home,
      visible: true
    },
    {
      id: 'teachers_corner',
      label: teachersCornerLabel,
      shortLabel: teachersCornerLabel,
      icon: Briefcase,
      visible: true,
      accent: true
    },
    {
      id: 'grid',
      label: 'Assessment Grid & Registry',
      shortLabel: 'Assessment Grid',
      icon: Table,
      visible: true
    },
    {
      id: 'dashboard',
      label: 'Executive Dashboard',
      shortLabel: 'Dashboard',
      icon: LayoutDashboard,
      visible: true
    },
    {
      id: 'report',
      label: 'Report Cards & Transcripts',
      shortLabel: 'Report Cards',
      icon: FileText,
      visible: true
    },
    {
      id: 'sheets',
      label: 'Student Enrollment Matrix',
      shortLabel: 'Enrollment Matrix',
      icon: Layers,
      visible: true,
      accent: true
    },
    {
      id: 'audit',
      label: 'Audit Trail & Missing Checker',
      shortLabel: 'Audit Trail',
      icon: History,
      visible: true
    },
    {
      id: 'class_management',
      label: 'Class Management',
      shortLabel: 'Class Mgmt',
      icon: GraduationCap,
      visible: canAccessClassManagement(currentRole)
    },
    {
      id: 'settings',
      label: 'Master Settings',
      shortLabel: 'Master Settings',
      icon: Settings,
      visible: canAccessMasterSettings(currentRole)
    }
  ];

  const visibleNavItems = navItems.filter(item => item.visible);
  const pendingResetCount = teachers.filter(t => t.passwordResetRequested).length;
  const navScrollRef = useRef<HTMLElement | null>(null);

  const handleSlideNavTabs = (direction: 'left' | 'right') => {
    // 1. Scroll the horizontal navigation bar smoothly
    if (navScrollRef.current) {
      const offset = direction === 'left' ? -240 : 240;
      navScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
    // 2. Also slide active tab left or right across Home Overview and other visible tabs
    const currentIndex = visibleNavItems.findIndex(
      item => item.id === activeTab || (item.id === 'grid' && activeTab === 'registry')
    );
    if (currentIndex !== -1 && visibleNavItems.length > 1) {
      const nextIndex =
        direction === 'left'
          ? (currentIndex - 1 + visibleNavItems.length) % visibleNavItems.length
          : (currentIndex + 1) % visibleNavItems.length;
      const targetTab = visibleNavItems[nextIndex];
      if (targetTab) {
        setActiveTab(targetTab.id);
      }
    }
  };

  useEffect(() => {
    if (!navScrollRef.current) return;
    const activeBtn = navScrollRef.current.querySelector(
      `[data-testid="nav-tab-${activeTab === 'registry' ? 'grid' : activeTab}"]`
    ) as HTMLElement | null;
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  return (
    <>
      <header className="bg-slate-900 text-white shadow-lg border-b border-slate-800 print:hidden">
        {/* Top Institutional Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="w-11 h-11 rounded-xl bg-white p-1 flex items-center justify-center shadow-md shadow-indigo-500/20 overflow-hidden shrink-0 border border-slate-700 cursor-pointer"
              title="Go to Home Overview"
            >
              <img
                src={logoSrc}
                alt={schoolProfile.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_INSTITUTION_LOGO_DATA_URI;
                }}
              />
            </button>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base sm:text-xl font-bold tracking-tight text-white">
                  {schoolProfile.name}
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 text-xs font-semibold rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Continuous Assessment Engine
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400">
                {schoolProfile.motto} • Session {currentSession.name} • {currentTerm.name} TERM
              </p>
            </div>
          </div>

          {/* Quick Context, HOD Badge, Staff Login & Role Controls */}
          <div className="flex items-center flex-wrap gap-2">
            {/* HOD Designation Badge if active user is appointed Head of Department */}
            {activeHodInfo.isHod && (
              <button
                type="button"
                data-testid="nav-hod-designation-badge"
                onClick={() => setActiveTab('teachers_corner')}
                title={`Appointed ${activeHodInfo.badgeText} — Click to open HOD Office`}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/80 border border-amber-600/70 text-amber-200 hover:bg-amber-900/90 text-[11px] font-bold transition-colors cursor-pointer min-h-[38px]"
              >
                <Briefcase className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate max-w-[190px]">{activeHodInfo.badgeText}</span>
              </button>
            )}

            {/* Class Section Quick Picker */}
            <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700 min-h-[38px]">
              <span className="text-xs text-slate-400 font-medium">Class:</span>
              <select
                aria-label="Class Section Selector"
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(Number(e.target.value))}
                className="bg-transparent text-xs font-semibold text-amber-300 focus:outline-none cursor-pointer"
              >
                {classSections.map((sec) => (
                  <option key={sec.id} value={sec.id} className="bg-slate-800 text-white">
                    {sec.name} ({sec.levelType})
                  </option>
                ))}
              </select>
            </div>

            {/* Staff Username Login / First-Time Password Button */}
            <button
              type="button"
              data-testid="staff-login-button"
              onClick={() => {
                setAuthStep('LOGIN');
                setAuthMessage(null);
                openAuthModal();
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/90 border border-indigo-700/70 text-indigo-200 hover:bg-indigo-900 hover:text-white text-xs font-semibold transition-colors cursor-pointer min-h-[38px]"
              title="Staff Login / 4-Digit Initial PIN / Password Setup"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>{isStaffLoggedIn ? `@${currentUser.username || 'superadmin'}` : 'Staff Login'}</span>
              {pendingResetCount > 0 && canAccessMasterSettings(currentRole) && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                  {pendingResetCount}
                </span>
              )}
            </button>

            {/* Security Lock Status Button (UNLOCKED if staff logged in, LOCKED if not logged in) */}
            {isStaffLoggedIn && isSecurityUnlocked ? (
              <button
                type="button"
                data-testid="security-lock-status"
                onClick={() => {
                  lockSecurity();
                  setActiveTab('home');
                }}
                title="System Unlocked - Click to Lock System & Sign Out"
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 text-xs font-bold hover:bg-emerald-900/60 transition-colors cursor-pointer min-h-[38px]"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>UNLOCKED</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="security-lock-status"
                onClick={() => {
                  setAuthStep('LOGIN');
                  setAuthMessage(null);
                  openAuthModal();
                }}
                title="System Locked - Click to Sign In & Unlock"
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/70 border border-rose-700/60 text-rose-300 text-xs font-bold hover:bg-rose-900/60 transition-colors cursor-pointer min-h-[38px]"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>LOCKED</span>
              </button>
            )}

            {/* Role Switcher (Strictly the 5 Approved Roles) */}
            <div className="relative">
              <button
                type="button"
                data-testid="role-switcher-trigger"
                onClick={() => setIsRoleMenuOpen(prev => !prev)}
                className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer text-left min-h-[38px]"
              >
                <div className={`w-2 h-2 rounded-full ${isStaffLoggedIn ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 leading-none">
                    Role Mode
                  </div>
                  <div className="text-xs font-semibold text-white flex items-center space-x-1 mt-0.5">
                    <span>{ALLOWED_ROLES.find(r => r.role === currentRole)?.label}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </div>
                </div>
              </button>

              {/* Role Dropdown */}
              {isRoleMenuOpen && (
                <div
                  data-testid="role-switcher-menu"
                  className="absolute right-0 mt-1.5 w-64 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 p-1.5 z-50"
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    Switch Active Role (5 Roles)
                  </div>
                  {ALLOWED_ROLES.map((r) => (
                    <button
                      key={r.role}
                      type="button"
                      data-testid={`role-option-${r.role}`}
                      onClick={() => handleRoleSwitch(r.role)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer mt-0.5 ${
                        currentRole === r.role
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                      }`}
                    >
                      <span>{r.label}</span>
                      {currentRole === r.role && (
                        <span className="text-[10px] bg-indigo-800 px-1.5 py-0.5 rounded">Active</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Primary Desktop/Tablet Navigation Tabs with Left & Right Slide Arrows */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 py-2">
            <button
              type="button"
              data-testid="nav-slide-left"
              aria-label="Slide Navigation Left"
              onClick={() => handleSlideNavTabs('left')}
              title="Slide Tabs Left (Previous Tab)"
              className="w-8 h-9 rounded-lg bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <nav
              ref={navScrollRef}
              aria-label="Main Navigation"
              className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth"
            >
              {visibleNavItems.map(item => {
                const Icon = item.icon;
                const isActive =
                  activeTab === item.id || (item.id === 'grid' && activeTab === 'registry');
                const isRestrictedWhenLocked = !isStaffLoggedIn && item.id !== 'home';

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`nav-tab-${item.id}`}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer min-h-[38px] ${
                      isActive
                        ? item.accent
                          ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                          : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : isRestrictedWhenLocked
                        ? 'text-slate-400 hover:text-white hover:bg-slate-800/90 border border-slate-800'
                        : item.accent
                        ? 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-950/40'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                    {isRestrictedWhenLocked && (
                      <Lock className="w-3.5 h-3 text-rose-400/90 ml-1 shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              data-testid="nav-slide-right"
              aria-label="Slide Navigation Right"
              onClick={() => handleSlideNavTabs('right')}
              title="Slide Tabs Right (Next Tab)"
              className="w-8 h-9 rounded-lg bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Welcome User Notification Banner */}
        {welcomeNotification && (
          <div
            data-testid="welcome-user-notification"
            className="bg-emerald-950/95 border-t border-emerald-700/70 text-emerald-100 px-4 py-2 text-xs font-semibold"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{welcomeNotification}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss welcome notification"
                onClick={dismissWelcomeNotification}
                className="text-emerald-300 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ===================================================================== */}
      {/* FLOATING ACTION BUTTON (FAB) WITH FLUID ANIMATION FOR MOBILE & DESKTOP */}
      {/* ===================================================================== */}
      <div className="fixed bottom-5 right-5 z-50 print:hidden">
        {/* Fluid Backdrop when open */}
        <div
          onClick={() => setIsFabMenuOpen(false)}
          className={`fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
            isFabMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Fluid Animated Navigation Sheet */}
        <div
          data-testid="fab-navigation-menu"
          className={`absolute bottom-16 right-0 w-72 sm:w-80 bg-slate-900 text-white border border-slate-700/90 rounded-2xl shadow-2xl p-3 transition-all duration-300 origin-bottom-right ${
            isFabMenuOpen
              ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 scale-75 translate-y-4 pointer-events-none'
          }`}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div className="px-2.5 py-2 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
                Quick Navigation Menu
              </div>
              <div className="text-xs font-bold text-slate-200">
                {isStaffLoggedIn
                  ? `@${currentUser.username || 'superadmin'} (${ALLOWED_ROLES.find(r => r.role === currentRole)?.shortLabel})`
                  : 'System Locked • Sign In Required'}
              </div>
            </div>
            <span className="text-[10px] font-mono bg-slate-800 text-amber-300 px-2 py-0.5 rounded border border-slate-700">
              {currentTerm.name}
            </span>
          </div>

          {/* Mobile Quick Class Switcher inside FAB */}
          <div className="p-2 mt-1 bg-slate-800/80 rounded-xl border border-slate-700/70">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Active Class Section
            </label>
            <select
              aria-label="Mobile Quick Class Section"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(Number(e.target.value))}
              className="w-full bg-slate-900 text-amber-300 text-xs font-bold px-2.5 py-2 rounded-lg border border-slate-700 focus:outline-none min-h-[40px]"
            >
              {classSections.map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name} ({sec.levelType})
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Items with Fluid Stagger */}
          <div className="mt-2 space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeTab === item.id || (item.id === 'grid' && activeTab === 'registry');
              const isLockedItem = !isStaffLoggedIn && item.id !== 'home';
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`fab-item-${item.id}`}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsFabMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[44px] ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="flex items-center space-x-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {isLockedItem ? (
                    <Lock className="w-3.5 h-3.5 text-rose-400" />
                  ) : isActive ? (
                    <span className="w-2 h-2 rounded-full bg-amber-300" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Install on Device (PWA) inside FAB Only */}
          <div className="mt-2 pt-2 border-t border-slate-800">
            <PWAInstallButton onAction={() => setIsFabMenuOpen(false)} />
          </div>
        </div>

        {/* Floating Action Button Trigger */}
        <button
          type="button"
          data-testid="fab-navigation-toggle"
          aria-label={isFabMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
          onClick={() => setIsFabMenuOpen(prev => !prev)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white border-2 cursor-pointer transition-all duration-300 ${
            isFabMenuOpen
              ? 'bg-rose-600 border-rose-400 rotate-90 scale-105'
              : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-400/80 rotate-0 scale-100'
          }`}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {isFabMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* ===================================================================== */}
      {/* STAFF USERNAME LOGIN / 4-DIGIT PIN / STRICT PASSWORD SETUP MODAL       */}
      {/* ===================================================================== */}
      {isAuthModalOpen && (
        <div
          data-testid="staff-auth-modal"
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">
                    {authStep === 'LOGIN'
                      ? 'Staff Sign In & PIN Verification'
                      : authStep === 'FIRST_TIME_SETUP'
                      ? 'Create New Account Password'
                      : 'Request Password Reset'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {authStep === 'LOGIN'
                      ? 'Sign in with your username & 4-digit initial PIN or password'
                      : authStep === 'FIRST_TIME_SETUP'
                      ? '4-Digit PIN verified • Set your personal password to unlock'
                      : 'Notify Super Admin, Principal, or Vice Principal'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close Authentication Modal"
                onClick={closeAuthModal}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {authMessage && (
              <div
                data-testid="auth-modal-message"
                className={`p-3 rounded-xl text-xs font-semibold flex items-start space-x-2 border ${
                  authMessage.type === 'success'
                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                    : authMessage.type === 'info'
                    ? 'bg-indigo-950/80 border-indigo-700 text-indigo-200'
                    : 'bg-rose-950/80 border-rose-700 text-rose-200'
                }`}
              >
                {authMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{authMessage.text}</span>
              </div>
            )}

            {authStep === 'LOGIN' && (
              <form onSubmit={handleStaffLoginSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                    Staff Username
                  </label>
                  <input
                    type="text"
                    data-testid="login-username-input"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Enter your staff username"
                    autoComplete="off"
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                    4-Digit Initial PIN or Password
                  </label>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      data-testid="login-password-input"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter 4-digit PIN or password"
                      autoComplete="new-password"
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <button
                      type="button"
                      data-testid="toggle-login-password-visibility"
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowLoginPassword(prev => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    New users enter their generated 4-digit PIN to proceed to password creation.
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    data-testid="forgot-password-link"
                    onClick={() => {
                      setAuthStep('FORGOT_PASSWORD');
                      setAuthMessage(null);
                    }}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
                  >
                    Forgot Password? Request Reset
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeAuthModal}
                    className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="login-submit-button"
                    className="w-1/2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30 cursor-pointer"
                  >
                    Sign In &amp; Unlock
                  </button>
                </div>
              </form>
            )}

            {authStep === 'FIRST_TIME_SETUP' && (
              <form onSubmit={handleFirstTimePasswordSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                    Verified Staff Username
                  </label>
                  <input
                    type="text"
                    value={loginUsername}
                    disabled
                    className="w-full px-3.5 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-amber-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                    Create New Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      data-testid="first-time-new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Must be >8 chars, 1 uppercase, 1 number/special"
                      autoComplete="new-password"
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <button
                      type="button"
                      data-testid="toggle-new-password-visibility"
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      onClick={() => setShowNewPassword(prev => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Live Password Policy Checklist */}
                <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-2.5 space-y-1 text-[11px]">
                  <div className="font-bold text-slate-300 uppercase text-[10px] mb-1">
                    Password Security Requirements:
                  </div>
                  <div className={passwordValidation.hasMinLength ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {passwordValidation.hasMinLength ? '✓' : '○'} Longer than 8 characters (9+ characters)
                  </div>
                  <div className={passwordValidation.hasUppercase ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {passwordValidation.hasUppercase ? '✓' : '○'} At least 1 uppercase letter (A–Z)
                  </div>
                  <div className={passwordValidation.hasNumberOrSpecial ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {passwordValidation.hasNumberOrSpecial ? '✓' : '○'} At least 1 number or special character
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                    Confirm New Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      data-testid="first-time-confirm-password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <button
                      type="button"
                      data-testid="toggle-confirm-password-visibility"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      onClick={() => setShowConfirmPassword(prev => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAuthStep('LOGIN')}
                    className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    data-testid="save-first-time-password-btn"
                    className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 cursor-pointer"
                  >
                    Save Password &amp; Login
                  </button>
                </div>
              </form>
            )}

            {authStep === 'FORGOT_PASSWORD' && (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                    Enter Your Staff Username
                  </label>
                  <input
                    type="text"
                    data-testid="reset-request-username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Enter your staff username"
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Your request will be sent to the Super Admin, Principal, and Vice Principal for immediate reset approval.
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAuthStep('LOGIN')}
                    className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                  >
                    Back to Login
                  </button>
                  <button
                    type="submit"
                    data-testid="submit-reset-request-btn"
                    className="w-1/2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer"
                  >
                    Request Password Reset
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Role Change Password Verification Modal (Blocks non-Super Admin users from switching roles without password) */}
      {pendingRoleSwitch && (
        <div
          data-testid="role-switch-auth-modal"
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Role Switch Blocked</h3>
                  <p className="text-[11px] text-rose-300 font-semibold">
                    Super Admin Clearance or Role Password Required
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingRoleSwitch(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-700/50 text-amber-200 text-xs mb-4">
              Only the <strong>Super Admin</strong> reserves the absolute right to change roles freely. To switch to{' '}
              <strong>{ALLOWED_ROLES.find(r => r.role === pendingRoleSwitch)?.label}</strong>, enter the password or authorization PIN for that role.
            </div>

            {roleSwitchError && (
              <div
                data-testid="role-switch-error"
                className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs mb-3 flex items-center space-x-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{roleSwitchError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmRoleSwitchPassword} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                  Password or Authorization PIN for {ALLOWED_ROLES.find(r => r.role === pendingRoleSwitch)?.label}
                </label>
                <div className="relative">
                  <input
                    type={showRoleSwitchPassword ? 'text' : 'password'}
                    data-testid="role-switch-password-input"
                    value={roleSwitchPassword}
                    onChange={(e) => setRoleSwitchPassword(e.target.value)}
                    placeholder="Enter role password or PIN"
                    autoFocus
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRoleSwitchPassword(prev => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showRoleSwitchPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingRoleSwitch(null)}
                  className="w-1/2 py-2.5 text-xs font-bold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-role-switch-btn"
                  className="w-1/2 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  Verify &amp; Switch Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
