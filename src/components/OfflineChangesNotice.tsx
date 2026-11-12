import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cloud, Database, RefreshCw, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { OfflineConflictResolution } from '../utils/offlineSyncEngine';

function describeCollection(collection: string): string {
  return collection.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
}

function shortValue(value: unknown): string {
  if (value === undefined) return 'Deleted';
  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

export const OfflineChangesNotice: React.FC = () => {
  const {
    isOnline,
    pendingOfflineSnapshot,
    pendingOfflineDocumentCount,
    offlineConflicts,
    offlineSyncMessage,
    backendStatus,
    commitOfflineChanges
  } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, OfflineConflictResolution>>({});
  const hasPendingChanges = Boolean(pendingOfflineSnapshot);

  useEffect(() => {
    if (hasPendingChanges && isOnline) setIsOpen(true);
    if (!hasPendingChanges) {
      setIsOpen(false);
      setResolutions({});
    }
  }, [hasPendingChanges, isOnline]);

  const changeEntries = useMemo(
    () => Object.entries(pendingOfflineSnapshot?.changedAt || {}),
    [pendingOfflineSnapshot]
  );
  if (!pendingOfflineSnapshot) return null;

  const allConflictsResolved = offlineConflicts.every(conflict => resolutions[conflict.key]);
  const handleCommit = async () => {
    setIsCommitting(true);
    try {
      const result = await commitOfflineChanges(resolutions);
      if (result.ok) setResolutions({});
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <div className="fixed bottom-4 right-4 z-[105] flex max-w-sm items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-xl">
          <Cloud className="h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black text-amber-950">
              {isOnline ? 'Offline changes need committing' : 'Changes saved on this device'}
            </div>
            <div className="text-[11px] text-amber-800">
              {changeEntries.length + pendingOfflineDocumentCount} pending changes
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white"
          >
            Review
          </button>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="offline-changes-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 bg-slate-900 p-5 text-white">
              <div className="flex gap-3">
                <div className="rounded-xl bg-amber-400/20 p-2 text-amber-300">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="offline-changes-title" className="text-lg font-black">
                    {isOnline ? 'Review offline changes' : 'Offline changes are saved locally'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-300">
                    {isOnline
                      ? 'Choose whether to commit pending data. Changes are compared with the latest database state before saving.'
                      : 'Your entries are stored on this device and will be offered for database commit when the connection returns.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close offline changes"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">First offline change</div>
                  <div className="mt-1 text-xs font-bold text-slate-900">
                    {new Date(pendingOfflineSnapshot.startedAt).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">Last saved locally</div>
                  <div className="mt-1 text-xs font-bold text-slate-900">
                    {new Date(pendingOfflineSnapshot.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-500">Database</div>
                  <div className="mt-1 text-xs font-bold text-slate-900">
                    {backendStatus.mysqlConnected ? 'Connected' : 'Not confirmed connected'}
                  </div>
                </div>
              </div>

              {offlineSyncMessage && (
                <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                  {offlineSyncMessage}
                </p>
              )}

              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">
                  Pending database records ({changeEntries.length})
                </h3>
                {changeEntries.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                    No changed database records are listed. Queued documents may still be pending below.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {changeEntries.map(([key, timestamp]) => (
                      <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <span className="truncate text-xs font-bold capitalize text-slate-800">
                          {describeCollection(key.split(':')[0])}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-500">
                          {new Date(timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {pendingOfflineDocumentCount > 0 && (
                <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs font-semibold text-indigo-900">
                  {pendingOfflineDocumentCount} document upload or deletion operation(s) will be replayed with the data commit.
                </p>
              )}

              {offlineConflicts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-wide text-rose-700">
                    Conflicts need your choice
                  </h3>
                  {offlineConflicts.map(conflict => (
                    <article key={conflict.key} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <div className="flex items-center gap-2 text-xs font-black text-rose-900">
                        <AlertTriangle className="h-4 w-4" />
                        {describeCollection(conflict.collection)} · {conflict.recordId}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-white p-2 text-[10px]">
                          <div className="font-black uppercase text-indigo-700">Offline value · {conflict.localTimestamp || 'time unknown'}</div>
                          <div className="mt-1 break-all text-slate-700">{shortValue(conflict.localValue)}</div>
                          <button
                            type="button"
                            onClick={() => setResolutions(previous => ({ ...previous, [conflict.key]: 'LOCAL' }))}
                            aria-pressed={resolutions[conflict.key] === 'LOCAL'}
                            className={`mt-2 rounded px-2 py-1 font-bold ${
                              resolutions[conflict.key] === 'LOCAL' ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-900'
                            }`}
                          >
                            Use offline value
                          </button>
                        </div>
                        <div className="rounded-lg bg-white p-2 text-[10px]">
                          <div className="font-black uppercase text-emerald-700">Database value · {conflict.serverTimestamp || 'time unknown'}</div>
                          <div className="mt-1 break-all text-slate-700">{shortValue(conflict.serverValue)}</div>
                          <button
                            type="button"
                            onClick={() => setResolutions(previous => ({ ...previous, [conflict.key]: 'SERVER' }))}
                            aria-pressed={resolutions[conflict.key] === 'SERVER'}
                            className={`mt-2 rounded px-2 py-1 font-bold ${
                              resolutions[conflict.key] === 'SERVER' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            Keep database value
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
                >
                  Review later
                </button>
                <button
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={!isOnline || isCommitting || !allConflictsResolved}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCommitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  {isCommitting ? 'Committing…' : 'Confirm and commit changes'}
                </button>
              </footer>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
