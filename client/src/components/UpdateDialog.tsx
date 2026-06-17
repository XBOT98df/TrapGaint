import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { launcher } from '@/lib/launcher';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';

interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  date?: string;
}

export interface UpdateDialogRef {
  checkForUpdates: () => Promise<void>;
}

export const UpdateDialog = forwardRef<UpdateDialogRef>((_, ref): ReactElement | null => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<'none' | 'up-to-date' | 'error'>('none');
  const [showPanel, setShowPanel] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const checkUpdates = async () => {
    setIsChecking(true);
    setCheckResult('none');
    try {
      const version = await launcher.getAppVersion();
      setCurrentVersion(version);
      console.log(`Manual update check - Current version: ${version}`);
      
      const update = await launcher.checkForUpdates();
      console.log('Manual update check result:', update);
      
      if (update.available && update.version) {
        setUpdateInfo(update);
        setShowPanel(true);
        setCheckResult('none');
      } else {
        setCheckResult('up-to-date');
        setTimeout(() => setCheckResult('none'), 3000);
      }
    } catch (e) {
      console.error('Failed to check for updates:', e);
      setCheckResult('error');
      setTimeout(() => setCheckResult('none'), 3000);
    } finally {
      setIsChecking(false);
    }
  };

  useImperativeHandle(ref, () => ({
    checkForUpdates: checkUpdates
  }));

  useEffect(() => {
    // Silent updates removed - only use StartupUpdate screen
    // Just get current version for display
    const getCurrentVersion = async () => {
      try {
        const version = await launcher.getAppVersion();
        setCurrentVersion(version);
      } catch (e) {
        console.error('[UpdateDialog] Failed to get version:', e);
      }
    };
    getCurrentVersion();
  }, []);

  const handleUpdate = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setUpdateError(null);

    try {
      await launcher.downloadAndInstallUpdate((downloaded, total) => {
        const progress = total > 0 ? (downloaded / total) * 100 : 0;
        setDownloadProgress(progress);
      });
    } catch (e) {
      console.error('Update failed:', e);
      setIsDownloading(false);
      
      // Show error message
      const errorMsg = String(e);
      if (errorMsg.includes('could not find update') || errorMsg.includes('No update available')) {
        setUpdateError('Auto-update unavailable. Please download manually.');
      } else {
        setUpdateError('Update failed. Please try again or download manually.');
      }
    }
  };

  const handleClose = () => {
    if (!isDownloading) {
      setShowPanel(false);
      setUpdateError(null);
    }
  };

  const handleManualDownload = () => {
    window.open('https://github.com/dhhd67807-lgtm/Block-Launcher/releases/latest', '_blank');
    setShowPanel(false);
  };

  if (!showPanel || !updateInfo?.available) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.9 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <div className="bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-80">
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-[#ff6600]/20 to-[#ff9900]/20 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">Update Available</h3>
                <p className="text-white/60 text-sm">v{currentVersion} → v{updateInfo.version}</p>
              </div>
              {!isDownloading && (
                <button
                  onClick={handleClose}
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-5">
            {updateError ? (
              <div className="space-y-4">
                <p className="text-red-400 text-sm">{updateError}</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleManualDownload}
                    className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all"
                    style={{
                      background: 'linear-gradient(to bottom, #ff6600, #cc5500)',
                      boxShadow: '0 4px 0 0 #993d00',
                      transform: 'translateY(-2px)',
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 0 0 #993d00';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 0 0 #993d00';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 0 0 #993d00';
                    }}
                  >
                    Download Manually
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-4 py-2.5 rounded-xl text-white/70 text-sm font-medium bg-white/5 hover:bg-white/10 transition-all"
                  >
                    Continue to App
                  </button>
                </div>
              </div>
            ) : isDownloading ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Downloading update...</span>
                  <span className="text-white font-medium">{Math.round(downloadProgress)}%</span>
                </div>
                {/* Progress bar with 3D orange style */}
                <div 
                  className="relative h-3 rounded-full overflow-hidden border-b-2 border-[#993d00]" 
                  style={{ boxShadow: '0 3px 0 0 #993d00' }}
                >
                  <div className="absolute inset-0 bg-zinc-800" />
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#ff6600] to-[#ff8833] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${downloadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                  {/* Shimmer effect */}
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
                <p className="text-white/40 text-xs text-center">
                  App will restart automatically
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {updateInfo.notes && (
                  <p className="text-white/70 text-sm line-clamp-3">
                    {updateInfo.notes}
                  </p>
                )}
                <button
                  onClick={handleUpdate}
                  className="w-full px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all"
                  style={{
                    background: 'linear-gradient(to bottom, #ff6600, #cc5500)',
                    boxShadow: '0 4px 0 0 #993d00',
                    transform: 'translateY(-2px)',
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 0 0 #993d00';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 0 0 #993d00';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 0 0 #993d00';
                  }}
                >
                  Update Now
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

UpdateDialog.displayName = 'UpdateDialog';

// Check for Updates Button Component
export function CheckForUpdatesButton() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<'none' | 'up-to-date' | 'found' | 'error'>('none');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState('');

  const handleCheck = async () => {
    setIsChecking(true);
    setResult('none');
    try {
      const version = await launcher.getAppVersion();
      setCurrentVersion(version);
      
      const update = await launcher.checkForUpdates();
      
      if (update.available && update.version) {
        setUpdateInfo(update);
        setResult('found');
        setShowPanel(true);
      } else {
        setResult('up-to-date');
        setTimeout(() => setResult('none'), 3000);
      }
    } catch (e) {
      console.error('Failed to check for updates:', e);
      setResult('error');
      setTimeout(() => setResult('none'), 3000);
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdateFromButton = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      await launcher.downloadAndInstallUpdate((downloaded, total) => {
        const progress = total > 0 ? (downloaded / total) * 100 : 0;
        setDownloadProgress(progress);
      });
    } catch (e) {
      console.error('Update failed:', e);
      setIsDownloading(false);
      window.open('https://github.com/dhhd67807-lgtm/Block-Launcher/releases/latest', '_blank');
      setShowPanel(false);
    }
  };

  return (
    <>
      <button
        onClick={handleCheck}
        disabled={isChecking}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
        <span className="text-sm">
          {isChecking ? 'Checking...' : 
           result === 'up-to-date' ? 'Up to date!' :
           result === 'error' ? 'Check failed' :
           'Check for Updates'}
        </span>
        {result === 'up-to-date' && <CheckCircle className="w-4 h-4 text-green-500" />}
        {result === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
      </button>

      {/* Update Panel */}
      <AnimatePresence>
        {showPanel && updateInfo?.available && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className="bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-80">
              <div className="px-5 py-4 bg-gradient-to-r from-[#ff6600]/20 to-[#ff9900]/20 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold">Update Available</h3>
                    <p className="text-white/60 text-sm">v{currentVersion} → v{updateInfo.version}</p>
                  </div>
                  {!isDownloading && (
                    <button onClick={() => setShowPanel(false)} className="text-white/40 hover:text-white/80">✕</button>
                  )}
                </div>
              </div>
              <div className="p-5">
                {isDownloading ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">Downloading...</span>
                      <span className="text-white font-medium">{Math.round(downloadProgress)}%</span>
                    </div>
                    <div className="relative h-3 rounded-full overflow-hidden" style={{ boxShadow: '0 3px 0 0 #993d00' }}>
                      <div className="absolute inset-0 bg-zinc-800" />
                      <motion.div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#ff6600] to-[#ff8833] rounded-full"
                        animate={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                    <p className="text-white/40 text-xs text-center">App will restart automatically</p>
                  </div>
                ) : (
                  <button
                    onClick={handleUpdateFromButton}
                    className="w-full px-4 py-2.5 rounded-xl text-white text-sm font-medium"
                    style={{ background: 'linear-gradient(to bottom, #ff6600, #cc5500)', boxShadow: '0 4px 0 0 #993d00' }}
                  >
                    Update Now
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

UpdateDialog.displayName = 'UpdateDialog';

export default UpdateDialog;
