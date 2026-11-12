/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, Monitor, CheckCircle2, X, Share, PlusSquare, WifiOff } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../utils/usePWAInstall';

interface PWAInstallButtonProps {
  onAction?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ onAction }) => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installSuccessMsg, setInstallSuccessMsg] = useState(false);

  // If already running as an installed standalone PWA, hide the install button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (onAction) {
      onAction();
    }
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setInstallSuccessMsg(true);
        setTimeout(() => setInstallSuccessMsg(false), 4000);
      }
      return;
    }
    setShowInstallModal(true);
  };

  const portalOverlays =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            {!isOnline && (
              <div
                data-testid="pwa-offline-banner"
                className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-xl border border-amber-400"
              >
                <WifiOff className="w-4 h-4 animate-pulse" />
                <span>Offline Mode — Working from local PWA cache</span>
              </div>
            )}

            {installSuccessMsg && (
              <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-xl">
                <CheckCircle2 className="w-4 h-4" />
                <span>App installed on your device successfully!</span>
              </div>
            )}

            {showInstallModal && (
              <div
                data-testid="pwa-install-guide-modal"
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
              >
                <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-slate-900">
                  <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                        {isMobile ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="text-sm font-black tracking-tight">
                          Install Portal on Computer or Mobile Device
                        </h3>
                        <p className="text-[11px] text-amber-300 font-semibold">
                          Progressive Web App (PWA) • Standalone Desktop &amp; Mobile App
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="close-pwa-install-modal-btn"
                      onClick={() => setShowInstallModal(false)}
                      className="p-1 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-5 space-y-4 text-xs">
                    <p className="text-slate-600 leading-relaxed">
                      Install this platform directly onto your computer desktop or mobile home screen for instant 1-click launch, full-screen standalone mode, and offline caching:
                    </p>

                    {/* Desktop Chrome / Edge Instructions */}
                    <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1.5">
                      <div className="flex items-center space-x-2 font-black text-indigo-950 uppercase text-[11px]">
                        <Monitor className="w-4 h-4 text-indigo-600" />
                        <span>Windows / Mac Computer (Chrome, Edge, Brave)</span>
                      </div>
                      <ol className="list-decimal list-inside text-slate-700 space-y-1 font-medium">
                        <li>
                          Click the <strong>Install App icon</strong> in the right side of your browser&apos;s address bar (or open Browser Menu <strong>⋮ → Cast, save, and share → Install page as app</strong>).
                        </li>
                        <li>
                          Click <strong>Install</strong> to add the shortcut to your Desktop and Start Menu / Dock.
                        </li>
                      </ol>
                    </div>

                    {/* Android Mobile Instructions */}
                    <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                      <div className="flex items-center space-x-2 font-black text-emerald-950 uppercase text-[11px]">
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                        <span>Android Phone or Tablet (Chrome)</span>
                      </div>
                      <ol className="list-decimal list-inside text-slate-700 space-y-1 font-medium">
                        <li>
                          Tap the browser menu <strong>⋮</strong> in the top-right corner.
                        </li>
                        <li>
                          Select <strong>Add to Home screen</strong> or <strong>Install app</strong>.
                        </li>
                      </ol>
                    </div>

                    {/* iOS / iPadOS Instructions */}
                    <div className={`p-3.5 rounded-xl border space-y-1.5 ${isIOS ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center space-x-2 font-black text-slate-900 uppercase text-[11px]">
                        <Share className="w-4 h-4 text-amber-600" />
                        <span>iPhone / iPad (iOS Safari)</span>
                      </div>
                      <ol className="list-decimal list-inside text-slate-700 space-y-1 font-medium">
                        <li>
                          Tap the <strong>Share</strong> button in the Safari toolbar.
                        </li>
                        <li className="inline-flex items-center gap-1">
                          Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare className="w-3.5 h-3.5 inline text-slate-600" />.
                        </li>
                      </ol>
                    </div>

                    <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowInstallModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                      >
                        Got It
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        data-testid="pwa-install-device-btn"
        onClick={handleInstallClick}
        title="Install EduGrade App on this Computer or Mobile Device"
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer min-h-[44px] bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/50 text-amber-200 shadow-xs"
      >
        <span className="flex items-center space-x-2.5">
          <Download className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Install on Device</span>
        </span>
        <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
          PWA App
        </span>
      </button>
      {portalOverlays}
    </>
  );
};
