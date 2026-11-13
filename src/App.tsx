/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navigation } from './components/Navigation';
import { HomeView } from './components/HomeView';
import { ScoreEntryGrid } from './components/ScoreEntryGrid';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { ReportCardView } from './components/ReportCardView';
import { SheetsDataExplorer } from './components/SheetsDataExplorer';
import { AuditLogView } from './components/AuditLogView';
import { MasterManagement } from './components/MasterManagement';
import { ClassManagementView } from './components/ClassManagementView';
import { TeachersCornerView } from './components/TeachersCornerView';
import { OfflineChangesNotice } from './components/OfflineChangesNotice';
import {
  AppTab,
  canAccessMasterSettings,
  canAccessClassManagement,
  resolveInstitutionLogoUrl
} from './utils/rbacAndAuth';

export type TabType = AppTab;

function MainAppContent() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('edugrade_active_tab_v2');
        if (saved) return saved as TabType;
      } catch {}
    }
    return 'home';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('edugrade_active_tab_v2', activeTab);
      } catch {}
    }
  }, [activeTab]);

  const {
    currentRole,
    isStaffLoggedIn,
    openAuthModal,
    schoolProfile,
    currentSession,
    setSelectedStudentId,
    setSelectedSectionId,
    setSelectedSubjectId
  } = useApp();

  // Dynamically sync browser web tab title and favicon with the School Name and School Logo
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const cleanSchoolName = (schoolProfile.name || '').trim();
    if (cleanSchoolName) {
      document.title = cleanSchoolName;
    }
    const resolvedLogo = resolveInstitutionLogoUrl(schoolProfile.logoUrl);
    if (resolvedLogo) {
      let iconLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = resolvedLogo;

      let appleIconLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
      if (!appleIconLink) {
        appleIconLink = document.createElement('link');
        appleIconLink.rel = 'apple-touch-icon';
        document.head.appendChild(appleIconLink);
      }
      appleIconLink.href = resolvedLogo;
    }
  }, [schoolProfile.name, schoolProfile.logoUrl]);

  // Enforce RBAC view restrictions when role changes
  useEffect(() => {
    if (!canAccessMasterSettings(currentRole) && activeTab === 'settings') {
      setActiveTab('home');
    }
    if (!canAccessClassManagement(currentRole) && activeTab === 'class_management') {
      setActiveTab('home');
    }
  }, [currentRole, activeTab]);

  // Only display the Home Overview while the system is locked (!isStaffLoggedIn)
  useEffect(() => {
    if (!isStaffLoggedIn && activeTab !== 'home') {
      setActiveTab('home');
    }
  }, [isStaffLoggedIn, activeTab]);

  const handleGuardedTabChange = (targetTab: TabType) => {
    if (targetTab === 'home') {
      setActiveTab('home');
      return;
    }
    if (!isStaffLoggedIn) {
      openAuthModal(() => {
        setActiveTab(targetTab);
      });
      return;
    }
    setActiveTab(targetTab);
  };

  const handleViewReportCard = (studentId: number) => {
    const proceed = () => {
      setSelectedStudentId(studentId);
      setActiveTab('report');
    };
    if (!isStaffLoggedIn) {
      openAuthModal(proceed);
      return;
    }
    proceed();
  };

  const handleOpenClass = (sectionId: number) => {
    const proceed = () => {
      setSelectedSectionId(sectionId);
      setActiveTab('grid');
    };
    if (!isStaffLoggedIn) {
      openAuthModal(proceed);
      return;
    }
    proceed();
  };

  const handleOpenScoreGridSubject = (sectionId: number, subjectId: number) => {
    const proceed = () => {
      setSelectedSectionId(sectionId);
      setSelectedSubjectId(subjectId);
      setActiveTab('grid');
    };
    if (!isStaffLoggedIn) {
      openAuthModal(proceed);
      return;
    }
    proceed();
  };

  const handleOpenReportFromSheets = (studentId: number, sectionId: number) => {
    const proceed = () => {
      setSelectedSectionId(sectionId);
      setSelectedStudentId(studentId);
      setActiveTab('report');
    };
    if (!isStaffLoggedIn) {
      openAuthModal(proceed);
      return;
    }
    proceed();
  };

  const effectiveTab: TabType = isStaffLoggedIn ? activeTab : 'home';

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans pb-20 sm:pb-0">
      {/* Top App Header, Role Switcher, Staff Auth Modal & Floating Action Button (FAB) */}
      <Navigation activeTab={effectiveTab} setActiveTab={handleGuardedTabChange} />
      {isStaffLoggedIn && <OfflineChangesNotice />}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 print:p-0 print:m-0 print:max-w-none">
        {effectiveTab === 'home' && (
          <HomeView
            onSelectClassAndSubject={handleOpenScoreGridSubject}
            onNavigateTab={handleGuardedTabChange}
          />
        )}

        {isStaffLoggedIn && effectiveTab === 'teachers_corner' && (
          <TeachersCornerView onOpenReportCard={handleViewReportCard} />
        )}

        {isStaffLoggedIn && (effectiveTab === 'grid' || effectiveTab === 'registry') && (
          <ScoreEntryGrid onViewReportCard={handleViewReportCard} />
        )}

        {isStaffLoggedIn && effectiveTab === 'dashboard' && (
          <ExecutiveDashboard onSelectStudent={handleViewReportCard} />
        )}

        {isStaffLoggedIn && effectiveTab === 'report' && (
          <ReportCardView />
        )}

        {isStaffLoggedIn && effectiveTab === 'sheets' && (
          <SheetsDataExplorer
            onOpenClass={handleOpenClass}
            onOpenReportCard={handleOpenReportFromSheets}
          />
        )}

        {isStaffLoggedIn && effectiveTab === 'audit' && (
          <AuditLogView onOpenScoreGrid={handleOpenScoreGridSubject} />
        )}

        {isStaffLoggedIn &&
          effectiveTab === 'class_management' &&
          canAccessClassManagement(currentRole) && (
            <ClassManagementView onOpenMasterSettings={() => setActiveTab('settings')} />
          )}

        {isStaffLoggedIn && effectiveTab === 'settings' && canAccessMasterSettings(currentRole) && (
          <MasterManagement initialSubTab="school" />
        )}
      </main>

      {/* Institutional Footer (Hidden on Print) */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-6 px-4 text-xs print:hidden mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="font-bold text-slate-200">
              {schoolProfile.name} • Continuous Assessment &amp; Academic Transcript Engine
            </div>
            <div data-testid="footer-school-details" className="text-[11px] text-slate-400 mt-0.5">
              Motto: &ldquo;{schoolProfile.motto || 'CHARACTER AND KNOWLEDGE'}&rdquo; • {schoolProfile.address || 'School address'} • Tel: {schoolProfile.phone || 'Contact details set by school'}
            </div>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span className="inline-flex items-center space-x-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span data-testid="footer-developer-credit">Developed by Mr Idee</span>
            </span>
            <span>•</span>
            <span>Academic Session {currentSession.name}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
