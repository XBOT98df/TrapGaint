import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check } from "lucide-react";

interface CrashReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  versionId: string;
  username: string;
  uuid?: string;
}

type DialogState = "form" | "sending" | "success" | "error";

export function CrashReportDialog({ isOpen, onClose, versionId, username, uuid }: CrashReportDialogProps) {
  const [dialogState, setDialogState] = useState<DialogState>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [userDescription, setUserDescription] = useState("");
  const [includeData, setIncludeData] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setDialogState("form");
      setErrorMessage("");
      setUserDescription("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setDialogState("sending");
    try {
      const result = await invoke<{ success: boolean; message: string; reportId?: string }>("submit_crash_report", {
        username,
        uuid,
        versionId,
        userDescription: userDescription || null,
      });
      
      if (result.success) {
        setDialogState("success");
        setTimeout(() => onClose(), 2500);
      } else {
        setErrorMessage(result.message);
        setDialogState("error");
      }
    } catch (error) {
      setErrorMessage(`Failed to submit: ${error}`);
      setDialogState("error");
    }
  };

  const getHeaderTitle = () => {
    switch (dialogState) {
      case "sending": return "Sending Report...";
      case "success": return "Report Sent Successfully";
      case "error": return "Submission Failed";
      default: return "Oops! Something Went Wrong";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0a0a0a] border border-[#222] rounded-xl w-[480px] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-center px-4 py-4 bg-[#0a0a0a]">
          <span className="text-lg font-semibold text-white text-center">{getHeaderTitle()}</span>
        </div>

        {/* Content */}
        <div className="p-6">
          {dialogState === "form" && (
            <>
              {/* Logo */}
              <div className="flex justify-center mb-5">
                <img 
                  src="/NewIcons.svg" 
                  alt="Resonance" 
                  className="w-[72px] h-[72px] rounded-2xl"
                />
              </div>

              {/* Description */}
              <p className="text-[#b0b0b0] text-[13px] leading-relaxed mb-2">
                A crash report has been generated. Resonance may use this report to try to find a solution to the problem.
              </p>
              <p className="text-pink-400 text-[13px] mb-5">
                By clicking 'Send Report', Resonance will receive crash report from you.
              </p>

              {/* Text Area */}
              <div className="mb-4">
                <label className="text-[#d0d0d0] text-[13px] font-medium block mb-2">
                  Please tell us more
                </label>
                <textarea
                  value={userDescription}
                  onChange={(e) => setUserDescription(e.target.value)}
                  placeholder="What were you doing when the crash happened?"
                  className="w-full h-[100px] bg-[#0d0d0d] border border-[#404040] rounded-md px-3 py-3 text-[13px] text-white placeholder-[#555] resize-none focus:outline-none focus:border-pink-500 transition-colors"
                />
              </div>

              {/* Checkbox */}
              <div className="mb-5">
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={includeData}
                    onChange={(e) => setIncludeData(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-500 bg-[#0d0d0d] accent-blue-500 cursor-pointer"
                  />
                  <span className="text-[#a0a0a0] text-xs leading-relaxed group-hover:text-[#e0e0e0] transition-colors">
                    Include my application usage related data to help Resonance diagnose the crash
                  </span>
                </label>
              </div>

              {/* Privacy Link */}
              <p className="text-pink-400 text-[11px] hover:text-pink-300 hover:underline cursor-pointer transition-colors">
                See our Privacy Policy for more details or to change your mind at any time.
              </p>
            </>
          )}

          {dialogState === "sending" && (
            <div className="text-center py-10">
              <div className="flex items-center justify-center gap-5 mb-6 h-20">
                {/* Sender Logo */}
                <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0">
                  <img 
                    src="/NewIcons.svg" 
                    alt="Resonance" 
                    className="w-full h-full"
                  />
                </div>

                {/* Animated Dots */}
                <div className="flex items-center gap-1 px-4">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="w-[5px] h-[5px] rounded-full bg-pink-500 animate-dot-travel"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>

                {/* Server Icon */}
                <svg className="w-[52px] h-[52px] flex-shrink-0" viewBox="0 0 32 32" fill="none">
                  <rect x="4" y="4" width="24" height="8" rx="2" fill="#2a2a2a" stroke="#444" strokeWidth="1"/>
                  <rect x="4" y="14" width="24" height="8" rx="2" fill="#2a2a2a" stroke="#444" strokeWidth="1"/>
                  <rect x="4" y="24" width="24" height="6" rx="1.5" fill="#2a2a2a" stroke="#444" strokeWidth="1"/>
                  <circle cx="8" cy="8" r="1.5" fill="#3b82f6"/>
                  <circle cx="8" cy="18" r="1.5" fill="#3b82f6"/>
                  <circle cx="8" cy="27" r="1.2" fill="#3b82f6"/>
                  <rect x="12" y="6" width="12" height="4" rx="1" fill="#1a1a1a"/>
                  <rect x="12" y="16" width="12" height="4" rx="1" fill="#1a1a1a"/>
                  <line x1="14" y1="7" x2="22" y2="7" stroke="#333" strokeWidth="1"/>
                  <line x1="14" y1="9" x2="22" y2="9" stroke="#333" strokeWidth="1"/>
                  <line x1="14" y1="17" x2="22" y2="17" stroke="#333" strokeWidth="1"/>
                  <line x1="14" y1="19" x2="22" y2="19" stroke="#333" strokeWidth="1"/>
                </svg>
              </div>
            </div>
          )}

          {dialogState === "success" && (
            <div className="text-center py-8">
              <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mx-auto mb-5 animate-scale-in shadow-lg shadow-green-500/30">
                <Check className="w-9 h-9 text-white" strokeWidth={3} />
              </div>
              <p className="text-white text-[15px] font-medium mb-1">Report Sent Successfully!</p>
              <p className="text-[#666] text-xs">Thank you for helping us improve Resonance.</p>
            </div>
          )}

          {dialogState === "error" && (
            <div className="text-center py-8">
              <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-yellow-500/30">
                <span className="text-white text-3xl">!</span>
              </div>
              <p className="text-white text-[15px] font-medium mb-1">Submission Failed</p>
              <p className="text-[#888] text-xs">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {dialogState === "form" && (
          <div className="flex items-center justify-center px-6 py-4 bg-[#0a0a0a]">
            <button
              onClick={handleSubmit}
              className="px-5 py-2 text-[13px] font-medium text-white bg-pink-500 hover:bg-pink-600 border border-pink-400 rounded-md transition-colors"
            >
              Send Crash Report
            </button>
          </div>
        )}

        {(dialogState === "success" || dialogState === "error") && (
          <div className="flex items-center justify-center px-6 py-4 bg-[#0a0a0a]">
            <button
              onClick={onClose}
              className="px-5 py-2 text-[13px] font-medium text-white bg-pink-500 hover:bg-pink-600 border border-pink-400 rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Custom animation styles */}
      <style>{`
        @keyframes dotTravel {
          0%, 100% {
            opacity: 0.2;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
            box-shadow: 0 0 10px #3b82f6;
          }
        }
        
        @keyframes scaleIn {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .animate-dot-travel {
          animation: dotTravel 1.5s ease-in-out infinite;
        }
        
        .animate-scale-in {
          animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
      `}</style>
    </div>
  );
}
