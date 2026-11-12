/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { getMySqlSchemaDDL, generatePhpMyAdminSqlDump } from '../utils/sqlExportGenerator';
import {
  Database,
  Server,
  Download,
  RefreshCw,
  CheckCircle2,
  Terminal,
  Code2,
  Globe,
  Copy,
  Check,
  HardDrive,
  FileCode,
  Layers,
  KeyRound,
  FolderArchive,
  Package,
  FileArchive,
  ShieldAlert,
  ArrowDownToLine,
  Info
} from 'lucide-react';

export const DatabasePublishHub: React.FC = () => {
  const {
    schoolProfile,
    sessions,
    terms,
    classSections,
    teachers,
    subjects,
    students,
    assessmentComponents,
    enrollments,
    scores,
    termSubjectRecords,
    termSummaries,
    auditLogs,
    commentBank,
    customReportTemplates,
    promotionLogs,
    backendStatus,
    initializeMysqlDatabase,
    downloadPhpMyAdminSql
  } = useApp();

  const [initFeedback, setInitFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSqlPreview, setShowSqlPreview] = useState(false);

  const [dbHostInput, setDbHostInput] = useState(backendStatus.dbHost || '127.0.0.1');
  const [dbPortInput, setDbPortInput] = useState(String(backendStatus.dbPort || 3306));
  const [dbUserInput, setDbUserInput] = useState(backendStatus.dbUser || 'root');
  const [dbNameInput, setDbNameInput] = useState(backendStatus.dbName || 'edugrade_db');
  const [emptyPasswordChecked, setEmptyPasswordChecked] = useState(!backendStatus.hasPassword);
  const [dbPasswordInput, setDbPasswordInput] = useState('');

  // Local Network (LAN) & WAMP Custom Domain Sharing state (backed by /network.config.json)
  const [lanDomainName, setLanDomainName] = useState('BHS-Assment-portal');
  const [lanPort, setLanPort] = useState('3000');
  const [detectedLanIps, setDetectedLanIps] = useState<string[]>(['192.168.1.100']);
  const [lanSaveNotice, setLanSaveNotice] = useState<string | null>(null);

  // Database files manifest state
  const [dbManifestFiles, setDbManifestFiles] = useState<Array<{
    name: string;
    sizeBytes: number;
    formattedSize: string;
    downloadUrl: string;
    description: string;
    updatedAt: string;
  }>>([]);
  const [isExportingZip, setIsExportingZip] = useState<'bundle' | 'project' | null>(null);

  const fetchDatabaseManifest = React.useCallback(() => {
    fetch('/api/database/files-manifest')
      .then(r => r.json())
      .then(data => {
        if (data && data.ok && Array.isArray(data.files)) {
          setDbManifestFiles(data.files);
        }
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    fetch('/api/network/config')
      .then(r => r.json())
      .then(data => {
        if (data && data.ok) {
          if (data.domainName) setLanDomainName(data.domainName);
          if (data.port) setLanPort(String(data.port));
          if (Array.isArray(data.lanIps) && data.lanIps.length > 0) {
            setDetectedLanIps(data.lanIps);
          }
        }
      })
      .catch(() => {});

    fetchDatabaseManifest();
  }, [fetchDatabaseManifest]);

  const handleSaveLanDomainConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/network/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: lanDomainName.trim() || 'BHS-Assment-portal',
          port: Number(lanPort) || 3000
        })
      });
      const data = await res.json();
      if (data && data.ok) {
        setLanDomainName(data.domainName);
        setLanSaveNotice(
          `Saved "${data.domainName}" to network.config.json! Other computers on your LAN can access http://${data.domainName}:${data.port} or http://${(data.lanIps && data.lanIps[0]) || '192.168.1.100'}:${data.port}`
        );
        setTimeout(() => setLanSaveNotice(null), 6000);
      }
    } catch {
      setLanSaveNotice('Updated domain name configuration.');
      setTimeout(() => setLanSaveNotice(null), 4000);
    }
  };

  const tableStats = useMemo(() => {
    const assignmentCount = teachers.reduce(
      (acc, t) => acc + (t.assignedSubjects ? t.assignedSubjects.length : 0),
      0
    );
    const counts: Record<string, number> = {
      school_profile: 1,
      academic_sessions: sessions.length,
      terms: terms.length,
      class_sections: classSections.length,
      teachers: teachers.length,
      teacher_subject_assignments: assignmentCount,
      subjects: subjects.length,
      students: students.length,
      assessment_components: assessmentComponents.length,
      student_subject_enrollments: enrollments.length,
      assessment_scores: scores.length,
      term_subject_records: termSubjectRecords.length,
      student_term_summaries: termSummaries.length,
      custom_report_templates: customReportTemplates.length,
      student_promotion_history: promotionLogs.length,
      score_audit_logs: auditLogs.length,
      comment_bank: commentBank.length,
      app_state_store: 1
    };
    return getMySqlSchemaDDL().map(item => ({
      tableName: item.tableName,
      rowCount: counts[item.tableName] ?? 0,
      ddl: item.ddl
    }));
  }, [
    sessions.length,
    terms.length,
    classSections.length,
    teachers,
    subjects.length,
    students.length,
    assessmentComponents.length,
    enrollments.length,
    scores.length,
    termSubjectRecords.length,
    termSummaries.length,
    customReportTemplates.length,
    promotionLogs.length,
    auditLogs.length,
    commentBank.length
  ]);

  const totalRelationalRows = useMemo(() => {
    return tableStats.reduce((acc, t) => acc + t.rowCount, 0);
  }, [tableStats]);

  const sqlDumpPreview = useMemo(() => {
    if (!showSqlPreview) return '';
    return generatePhpMyAdminSqlDump(
      {
        schoolProfile,
        sessions,
        terms,
        classSections,
        teachers,
        subjects,
        students,
        assessmentComponents,
        enrollments,
        scores,
        termSubjectRecords,
        termSummaries,
        auditLogs,
        commentBank,
        customReportTemplates,
        promotionLogs
      },
      backendStatus.dbName || 'edugrade_db'
    );
  }, [
    showSqlPreview,
    schoolProfile,
    sessions,
    terms,
    classSections,
    teachers,
    subjects,
    students,
    assessmentComponents,
    enrollments,
    scores,
    termSubjectRecords,
    termSummaries,
    auditLogs,
    commentBank,
    customReportTemplates,
    promotionLogs,
    backendStatus.dbName
  ]);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const handleInitializeMySql = async () => {
    const res = await initializeMysqlDatabase();
    setInitFeedback(res);
    setTimeout(() => setInitFeedback(null), 6000);
  };

  const envFileSnippet = `PORT=3000
NODE_ENV=development
DB_HOST=${dbHostInput || '127.0.0.1'}
DB_PORT=${dbPortInput || '3306'}
DB_USER=${dbUserInput || 'root'}
# Empty password (no password) for local phpMyAdmin / XAMPP root user:
DB_PASSWORD=${emptyPasswordChecked ? '' : dbPasswordInput}
DB_NAME=${dbNameInput || 'edugrade_db'}`;

  const vscodeTerminalCommands = `# 1. Install all Node.js + MySQL dependencies
npm install

# 2. Start the full-stack Node.js + Vite + MySQL server on port 3000
npm run dev

# 3. (When deploying online) Build frontend & launch production Node.js server
npm run build
npm start`;

  return (
    <div className="space-y-6">
      {/* Top Status & Control Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Server className="w-3.5 h-3.5" />
                <span>Node.js Full-Stack Runtime ({backendStatus.nodeVersion})</span>
              </span>
              <span
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                  backendStatus.databaseConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>
                  {backendStatus.databaseConnected
                    ? 'Supabase PostgreSQL Connected'
                    : backendStatus.nodeConnected
                      ? 'Supabase PostgreSQL Disconnected'
                      : 'Database Backend Unavailable'}
                </span>
              </span>
              {backendStatus.lastSyncedAt && (
                <span className="text-[11px] text-slate-400">
                  Last Auto-Synced: <strong className="text-slate-200">{backendStatus.lastSyncedAt}</strong>
                </span>
              )}
            </div>

            <h3 className="text-lg font-black tracking-tight text-white">
              Supabase PostgreSQL Database &amp; Deployment Center
            </h3>
            {backendStatus.statusMessage && (
              <p
                role="status"
                className={`text-xs max-w-3xl leading-relaxed ${
                  backendStatus.databaseConnected ? 'text-emerald-300' : 'text-amber-200'
                }`}
              >
                {backendStatus.statusMessage}
              </p>
            )}
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              The application reads and writes its canonical school snapshot through the server-side API to <strong className="text-white">Supabase PostgreSQL</strong>. Configure the Supabase project URL and server-only secret in the hosting environment; database credentials are never entered in the browser.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={downloadPhpMyAdminSql}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download phpMyAdmin SQL ({backendStatus.sqlDumpSizeKb || 145} KB)</span>
            </button>

            <button
              type="button"
              onClick={handleInitializeMySql}
              disabled={backendStatus.isSyncing}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${backendStatus.isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {backendStatus.isSyncing ? 'Saving to Supabase...' : 'Save Current School Data to Supabase'}
              </span>
            </button>
          </div>
        </div>

        {initFeedback && (
          <div className="mt-4 p-3 rounded-xl bg-slate-800/90 border border-indigo-500/40 flex items-center space-x-2.5 text-xs text-indigo-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{initFeedback.message}</span>
          </div>
        )}

        {/* Quick Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800">
          <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">MySQL Database &amp; Host</div>
            <div className="text-sm font-mono font-bold text-amber-300 mt-0.5">{backendStatus.dbName}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Host: {backendStatus.dbHost}:{backendStatus.dbPort}</div>
          </div>

          <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">MySQL Auth Credentials</div>
            <div className="text-sm font-mono font-bold text-emerald-300 mt-0.5">
              User: {backendStatus.dbUser || 'root'}
            </div>
            <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">
              Password: {backendStatus.hasPassword ? 'Set (Custom)' : 'EMPTY (No Password)'}
            </div>
          </div>

          <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Synced Records</div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">{totalRelationalRows.toLocaleString()} Rows</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{tableStats.length} Tables • {students.length} Students</div>
          </div>

          <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">VS Code Ready Files</div>
            <div className="text-sm font-mono font-bold text-indigo-300 mt-0.5">server.ts + .vscode</div>
            <div className="text-[11px] text-slate-400 mt-0.5">database/edugrade_phpmyadmin.sql</div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 📦 DATABASE FOLDER & PROJECT EXPORT CENTER (LOCAL DEPLOYMENT) */}
      {/* ================================================================= */}
      <div
        data-testid="database-export-center-card"
        className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <FolderArchive className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-base font-black text-slate-900">
                  Database Folder &amp; Full Project Export Center
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Offline Ready
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                If the standard platform export ZIP excluded your <code className="bg-slate-100 px-1 py-0.5 rounded font-bold text-indigo-900">/database</code> folder, you can download the complete database bundle here, or download a 100% complete project archive with all source code and database files included.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Download Complete Database Folder (.ZIP) */}
            <a
              href="/api/database/bundle-zip"
              download="edugrade_database_bundle.zip"
              data-testid="download-database-bundle-btn"
              onClick={() => {
                setIsExportingZip('bundle');
                setTimeout(() => setIsExportingZip(null), 3000);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md flex items-center space-x-2 transition-all cursor-pointer"
            >
              <FolderArchive className="w-4 h-4 text-emerald-100" />
              <span>{isExportingZip === 'bundle' ? 'Downloading Database ZIP...' : 'Download Database Folder (.ZIP)'}</span>
            </a>

            {/* Download Entire Project + Database (.ZIP) */}
            <a
              href="/api/project/export-full-zip"
              download="edugrade_full_project_source_and_database.zip"
              data-testid="download-full-project-btn"
              onClick={() => {
                setIsExportingZip('project');
                setTimeout(() => setIsExportingZip(null), 5000);
              }}
              className="px-4 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-black shadow-md flex items-center space-x-2 transition-all cursor-pointer"
            >
              <Package className="w-4 h-4 text-indigo-200" />
              <span>{isExportingZip === 'project' ? 'Packaging Complete Project...' : 'Download Full Project + Database (.ZIP)'}</span>
            </a>
          </div>
        </div>

        {/* Informational Guidance Alert */}
        <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-950 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-indigo-900">
            <Info className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Why was the /database folder not available in the platform ZIP export?</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-700">
            Standard cloud/browser development downloads only package committed git source files and skip runtime-generated directories like <code className="bg-white px-1 py-0.5 rounded border text-indigo-900 font-bold">/database</code>. By clicking <strong>Download Database Folder (.ZIP)</strong> above, you receive the full bundle. Simply unzip it and place the <code className="bg-white px-1 py-0.5 rounded border font-bold">database</code> folder directly inside your extracted project root.
          </p>
          <div className="p-2.5 bg-white/80 rounded-lg border border-indigo-200/70 text-[11px] text-emerald-900 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Automated Self-Healing:</strong> Even if you start the project on your computer without the database folder, running <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold">node installer.js</code> or <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold">npm run dev</code> will automatically auto-create the database directory, schemas, and master credentials without failing!
            </span>
          </div>
        </div>

        {/* Database Files Manifest Table / Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Files Present in /database (Ready for Individual Download):
            </div>
            <button
              type="button"
              onClick={fetchDatabaseManifest}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Files</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dbManifestFiles.length > 0 ? (
              dbManifestFiles.map(file => (
                <div
                  key={file.name}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-indigo-300 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-900 truncate" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                        {file.formattedSize}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1">{file.description}</p>
                  </div>
                  <div className="pt-2.5 mt-2 border-t border-slate-200/60 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {new Date(file.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <a
                      href={file.downloadUrl}
                      download={file.name.split('/').pop()}
                      className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full p-4 rounded-xl bg-slate-50 text-center text-xs text-slate-500">
                Loading database files manifest...
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h4 className="text-sm font-black text-slate-900">Supabase connection</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          The API uses the server-only Supabase secret to read and write school state. Apply the
          checked-in migration and configure <code>SUPABASE_URL</code>, <code>SUPABASE_SECRET_KEY</code>,
          <code> AUTH_VAULT_ENCRYPTION_KEY</code>, and <code>SESSION_SECRET</code> in your host settings.
          Use <code>npm run db:check</code> to verify the schema and database access without changing school records.
        </p>
      </section>

      {/* Local Network (LAN) & WAMP Custom Domain Sharing Configurator (network.config.json) */}
      <form
        onSubmit={handleSaveLanDomainConfig}
        data-testid="lan-wamp-domain-config-card"
        className="bg-white rounded-2xl border border-indigo-200 shadow-xs p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900">
                Local Network (LAN) &amp; WAMP Custom Domain Sharing (<code className="text-indigo-700">network.config.json</code>)
              </h4>
              <p className="text-xs text-slate-500">
                Share this platform with other computers, tablets, and phones connected to the same Wi-Fi / LAN using either your computer&apos;s IP address and port or your custom domain name (e.g., <strong>{lanDomainName}</strong>).
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
            Config File: network.config.json
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
              Custom LAN Domain / Portal Name
            </label>
            <input
              type="text"
              data-testid="lan-domain-name-input"
              value={lanDomainName}
              onChange={e => setLanDomainName(e.target.value)}
              placeholder="BHS-Assment-portal"
              className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
              Application Port (0.0.0.0)
            </label>
            <input
              type="number"
              value={lanPort}
              onChange={e => setLanPort(e.target.value)}
              placeholder="3000"
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div>
            <button
              type="submit"
              data-testid="save-lan-domain-btn"
              className="w-full py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              Save Domain to network.config.json
            </button>
          </div>
        </div>

        {lanSaveNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900">
            ✓ {lanSaveNotice}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Option A: Access via Local Computer IP &amp; Port
            </div>
            <div className="font-mono font-bold text-indigo-700">
              {detectedLanIps.map(ip => `http://${ip}:${lanPort}`).join('  or  ')}
            </div>
            <p className="text-[11px] text-slate-500">
              On the host PC, allow inbound TCP port {lanPort} through Windows Firewall for the Private network. MySQL stays on the host; client devices use this app URL and do not connect to port 3306 directly.
            </p>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Option B: Access via Custom Domain Name ({lanDomainName})
            </div>
            <div className="font-mono font-bold text-emerald-700">
              http://{lanDomainName}:{lanPort} &nbsp;or&nbsp; http://{lanDomainName}
            </div>
            <p className="text-[11px] text-slate-500">
              Edit <code className="bg-white px-1 py-0.5 rounded border">network.config.json</code> (line 2: <code className="bg-white px-1 py-0.5 rounded border">&quot;domainName&quot;: &quot;{lanDomainName}&quot;</code>) or use the input above to change the portal name at any time.
            </p>
          </div>
        </div>
      </form>

      {/* Step-by-Step Guide: Local VS Code + phpMyAdmin -> Online Hosting */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Local Computer Setup (VS Code + XAMPP phpMyAdmin) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Code2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Step 1: Run on Your Local Computer (VS Code + phpMyAdmin)
                </h4>
                <p className="text-xs text-slate-500">
                  Manage and test locally with XAMPP / WAMP / MAMP before moving online
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              Local Workflow
            </span>
          </div>

          <ol className="space-y-3 text-xs text-slate-700">
            <li className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                1
              </span>
              <div>
                <span className="font-bold text-slate-900">Start MySQL &amp; phpMyAdmin (XAMPP / WAMP):</span> Open XAMPP Control Panel and start <strong className="text-slate-900">Apache</strong> and <strong className="text-slate-900">MySQL</strong> (runs on <code className="bg-slate-100 px-1 py-0.5 rounded">127.0.0.1:3306</code>).
              </div>
            </li>

            <li className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <div>
                <span className="font-bold text-slate-900">Import or Auto-Create in phpMyAdmin:</span> Open <code className="bg-slate-100 px-1 py-0.5 rounded">http://localhost/phpmyadmin</code>. Either click <strong>Import</strong> and select <code className="bg-slate-100 px-1 py-0.5 rounded">database/edugrade_phpmyadmin.sql</code> (or click the green <strong>Download phpMyAdmin SQL</strong> button above), OR simply let <code className="bg-slate-100 px-1 py-0.5 rounded">server.ts</code> auto-create the database and all 15 tables on startup!
              </div>
            </li>

            <li className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                3
              </span>
              <div>
                <span className="font-bold text-slate-900">Open Project in VS Code:</span> Copy <code className="bg-slate-100 px-1 py-0.5 rounded">.env.example</code> to <code className="bg-slate-100 px-1 py-0.5 rounded">.env</code>:
              </div>
            </li>
          </ol>

          {/* .env Box */}
          <div className="bg-slate-900 rounded-xl p-3.5 text-xs font-mono text-slate-200 relative">
            <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 mb-2 border-b border-slate-800">
              <span className="flex items-center space-x-1.5">
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>.env (Local XAMPP / phpMyAdmin Defaults)</span>
              </span>
              <button
                type="button"
                onClick={() => handleCopy('env', envFileSnippet)}
                className="flex items-center space-x-1 text-indigo-300 hover:text-white cursor-pointer"
              >
                {copiedKey === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'env' ? 'Copied' : 'Copy .env'}</span>
              </button>
            </div>
            <pre className="overflow-x-auto leading-relaxed text-[11px] text-amber-300">{envFileSnippet}</pre>
          </div>

          {/* Terminal Commands Box */}
          <div className="bg-slate-900 rounded-xl p-3.5 text-xs font-mono text-slate-200 relative">
            <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 mb-2 border-b border-slate-800">
              <span className="flex items-center space-x-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>VS Code Integrated Terminal Commands</span>
              </span>
              <button
                type="button"
                onClick={() => handleCopy('cmd', vscodeTerminalCommands)}
                className="flex items-center space-x-1 text-indigo-300 hover:text-white cursor-pointer"
              >
                {copiedKey === 'cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'cmd' ? 'Copied' : 'Copy Commands'}</span>
              </button>
            </div>
            <pre className="overflow-x-auto leading-relaxed text-[11px] text-emerald-300">{vscodeTerminalCommands}</pre>
          </div>
        </div>

        {/* Column 2: Moving Online & Relational Schema Explorer */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    Step 2: Move Online (cPanel / Cloud Node.js + phpMyAdmin)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Deploy your local VS Code build to your online web host &amp; online phpMyAdmin
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                Online Hosting
              </span>
            </div>

            <ol className="space-y-3 text-xs text-slate-700">
              <li className="flex items-start space-x-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <span className="font-bold text-slate-900">Create Online MySQL Database:</span> In your hosting control panel (cPanel / Hostinger / Plesk), open <strong>MySQL Databases</strong>, create your database and user, then open <strong>phpMyAdmin</strong> online.
                </div>
              </li>

              <li className="flex items-start space-x-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <span className="font-bold text-slate-900">Import SQL into Online phpMyAdmin:</span> Click <strong>Download phpMyAdmin SQL</strong> above to get your latest local records, then in your online phpMyAdmin click <strong>Import</strong> and upload the <code className="bg-slate-100 px-1 py-0.5 rounded">.sql</code> file.
                </div>
              </li>

              <li className="flex items-start space-x-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <span className="font-bold text-slate-900">Build &amp; Start Node.js Server:</span> Update <code className="bg-slate-100 px-1 py-0.5 rounded">.env</code> with your online MySQL credentials (<code className="bg-slate-100 px-1 py-0.5 rounded">DB_HOST</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">DB_USER</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">DB_PASSWORD</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">DB_NAME</code>) and run <code className="bg-slate-100 px-1 py-0.5 rounded">npm run build &amp;&amp; npm start</code>.
                </div>
              </li>
            </ol>
          </div>

          {/* 15 MySQL Tables Live Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs font-black text-slate-900 uppercase">
                  phpMyAdmin Relational Schema ({tableStats.length} Tables)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlPreview(prev => !prev)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                {showSqlPreview ? 'Hide Raw SQL' : 'Inspect SQL Script'}
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {tableStats.map(t => (
                <div key={t.tableName} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                  <div className="flex items-center space-x-2">
                    <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono font-bold text-slate-800">{t.tableName}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px] font-semibold">
                    {t.rowCount.toLocaleString()} {t.rowCount === 1 ? 'row' : 'rows'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Optional SQL Script Preview Modal/Drawer */}
      {showSqlPreview && (
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 text-white space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-amber-300 font-mono">
                database/edugrade_phpmyadmin.sql (Live Generated SQL Dump)
              </h4>
              <p className="text-xs text-slate-400">
                You can copy this entire SQL script and paste it directly into the &quot;SQL&quot; tab in phpMyAdmin.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleCopy('sql', sqlDumpPreview)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
              >
                {copiedKey === 'sql' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'sql' ? 'Copied SQL!' : 'Copy Full SQL'}</span>
              </button>
            </div>
          </div>
          <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-300 max-h-80 overflow-y-auto leading-relaxed">
            {sqlDumpPreview.slice(0, 8000)}
            {sqlDumpPreview.length > 8000 ? '\n\n-- ... [Download SQL file for full dump] ...' : ''}
          </pre>
        </div>
      )}
    </div>
  );
};
