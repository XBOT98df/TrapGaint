import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, Pause, Play, RefreshCw } from "lucide-react";

interface RepairDialogProps {
  isOpen: boolean;
  onClose: () => void;
  versionId: string;
  issueType: "corrupted" | "missing_files" | "font_error" | "crash" | "unknown";
  issueDetails?: string;
  onRepairComplete?: () => void;
  onLaunchGame?: () => void;
}

type RepairState = "repairing" | "paused" | "success" | "error";

export function RepairDialog({ 
  isOpen, 
  onClose,    
  versionId,    
  issueType,    
  onRepairComplete,   
  onLaunchGame
}: RepairDialogProps) {
  const [repairState, setRepairState] = useState<RepairState>("repairing");
  const [errorMessage, setErrorMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState("Download");
  const [downloadedSize, setDownloadedSize] = useState("0 MB");
  const [totalSize, setTotalSize] = useState("500 MB");
  const [downloadSpeed, setDownloadSpeed] = useState("0.00 MB/s");
  const networkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false);

  // Auto-start repair when dialog opens
  useEffect(() => {
    if (isOpen && !hasStartedRef.current) {
      hasStartedRef.current = true;
      setRepairState("repairing");
      setErrorMessage("");
      setProgress(0);
      
      // Estimate sizes based on issue type
      if (issueType === "font_error" || issueType === "missing_files") {
        setTotalSize("500 MB");
      } else {
        setTotalSize("200 MB");
      }
      
      // Start repair immediately
      startRepair();
    }
    
    if (!isOpen) {
      hasStartedRef.current = false;
    }
  }, [isOpen, versionId]);

  const startRepair = async () => {
    setRepairState("repairing");
    setProgress(0);
    setCurrentTask("Download");
    
    // Simulate download speed updates
    networkIntervalRef.current = setInterval(() => {
      const speed = Math.random() * 50 + 10;
      setDownloadSpeed(`${speed.toFixed(2)} MB/s`);
    }, 500);
    
    const unlisten = await listen<{ step: number; total: number; message: string; progress: number }>("repair-progress", (event) => {
      const { message, progress: prog } = event.payload;
      setProgress(prog);
      setCurrentTask(message);
      
      const total = issueType === "font_error" || issueType === "missing_files" ? 500 : 200;
      const downloaded = (prog / 100) * total;
      setDownloadedSize(`${downloaded.toFixed(0)} MB`);
    });
    
    try {
      await invoke("repair_installation", {
        versionId,
        fullRepair: true
      });
      
      if (networkIntervalRef.current) clearInterval(networkIntervalRef.current);
      setProgress(100);
      setRepairState("success");
      setCurrentTask("All files verified");
      setDownloadedSize(totalSize);
      
    } catch (error: any) {
      if (networkIntervalRef.current) clearInterval(networkIntervalRef.current);
      setErrorMessage(error.toString());
      setRepairState("error");
    } finally {
      unlisten();
    }
  };

  const handleClose = () => {
    if (networkIntervalRef.current) clearInterval(networkIntervalRef.current);
    onClose();
  };

  const handleDone = () => {
    onRepairComplete?.();
    handleClose();
    // Launch the game after repair
    onLaunchGame?.();
  };

  if (!isOpen) return null;

  const displayVersion = versionId.replace('lapetus-', 'Dragon ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {/* Dialog Wrapper with floating logo */}
      <div className="relative pt-[60px]">
        {/* Floating Logo - positioned above dialog */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
          <img 
            src="/Re.png" 
            alt="Resonance" 
            className="w-[120px] h-[120px] object-contain rounded-2xl drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
          />
        </div>
        
        {/* Dialog */}
        <div className="w-[600px] bg-[#0a0a0a] rounded-lg overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] pt-[70px]">
          {/* Title */}
          <div className="px-6 pb-4">
            <h2 className="text-white text-lg font-medium" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}>{displayVersion}</h2>
          </div>

          {/* Progress Bar */}
          <div className="px-6 pb-4">
            <div className="relative h-10 bg-[#1a1a1a] rounded overflow-hidden">
              {/* Progress Fill */}
              <div 
                className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                  repairState === "success" 
                    ? "bg-gradient-to-r from-green-600 to-green-500" 
                    : "bg-gradient-to-r from-blue-600 to-blue-500"
                }`}
                style={{ width: `${progress}%` }}
              />
              
              {/* Progress Content */}
              <div className="absolute inset-0 flex items-center justify-between px-4">
                <span className="text-white text-sm font-medium z-10" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {repairState === "success" ? "COMPLETE" :
                   repairState === "error" ? "FAILED" :
                   repairState === "paused" ? "PAUSED" :
                   `INSTALLING ${progress.toFixed(0)}%`}
                </span>
                
                {/* Controls - X and Pause buttons */}
                {(repairState === "repairing" || repairState === "paused") && (
                  <div className="flex items-center z-10">
                    <button 
                      onClick={handleClose}
                      className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="w-px h-5 bg-white/20 mx-1" />
                    <button 
                      onClick={() => setRepairState(repairState === "paused" ? "repairing" : "paused")}
                      className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                    >
                      {repairState === "paused" ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Download Info */}
          <div className="px-6 pb-6">
            <div className="flex items-center justify-between text-sm" style={{ fontFamily: "'Outfit', sans-serif" }}>
              <span className="text-white/60">{currentTask}</span>
              <div className="flex items-center gap-4">
                <span className="text-white/80">{downloadedSize} of {totalSize}</span>
                <span className="text-white/60">{downloadSpeed}</span>
              </div>
            </div>
          </div>

          {/* Error State */}
          {repairState === "error" && (
            <div className="mx-6 mb-6 bg-red-500/10 border border-red-500/20 rounded p-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
              <p className="text-red-500 font-medium mb-1">Repair Failed</p>
              <p className="text-white/60 text-sm">{errorMessage}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 pb-6 flex justify-center gap-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {repairState === "error" && (
              <>
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 text-sm text-white/60 hover:text-white transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setErrorMessage("");
                    startRepair();
                  }}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-pink-600 hover:bg-pink-500 rounded transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              </>
            )}
            
            {repairState === "success" && (
              <button
                onClick={handleDone}
                className="px-8 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-500 rounded transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
