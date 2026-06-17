import { useState, useEffect } from "react";
import { Copy, FolderOpen, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { launcher } from "@/lib/launcher";

interface CrashReport {
  filename: string;
  path: string;
  modified: number;
  content?: string;
}

export default function CrashViewer() {
  const [crashReports, setCrashReports] = useState<CrashReport[]>([]);
  const [selectedCrash, setSelectedCrash] = useState<CrashReport | null>(null);
  const [crashContent, setCrashContent] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCrashReports();
    
    // Check URL params for specific crash path
    const params = new URLSearchParams(window.location.search);
    const crashPath = params.get('path');
    if (crashPath) {
      loadSpecificCrash(crashPath);
    }
  }, []);

  const loadCrashReports = async () => {
    try {
      const reports = await launcher.getCrashReports();
      setCrashReports(reports);
      
      // Auto-select the latest crash if no specific one requested
      if (reports.length > 0 && !selectedCrash) {
        const latest = reports[0];
        setSelectedCrash(latest);
        const content = await launcher.readCrashReport(latest.path);
        setCrashContent(content);
      }
    } catch (e) {
      console.error('Failed to load crash reports:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadSpecificCrash = async (path: string) => {
    try {
      const content = await launcher.readCrashReport(path);
      const filename = path.split('/').pop() || path.split('\\').pop() || 'crash-report.txt';
      setSelectedCrash({ filename, path, modified: Date.now() / 1000 });
      setCrashContent(content);
    } catch (e) {
      console.error('Failed to load crash report:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCrash = async (crash: CrashReport) => {
    setSelectedCrash(crash);
    try {
      const content = await launcher.readCrashReport(crash.path);
      setCrashContent(content);
    } catch (e) {
      console.error('Failed to read crash report:', e);
      setCrashContent('Failed to read crash report');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(crashContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await launcher.openCrashFolder();
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  };

  // Extract error summary from crash log
  const getErrorSummary = () => {
    if (!crashContent) return "No crash report loaded";
    const lines = crashContent.split('\n');
    for (const line of lines) {
      if (line.includes('Description:')) {
        return line.replace('Description:', '').trim();
      }
      if (line.includes('Error') || line.includes('Exception') || line.includes('requires version')) {
        return line.trim().substring(0, 100);
      }
    }
    return "Game crashed unexpectedly";
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-zinc-400">Loading crash reports...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col select-none">
      {/* Header - draggable */}
      <div 
        className="flex items-center justify-between px-5 py-3 bg-black border-b border-zinc-950"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <div>
            <h1 className="font-serif italic font-semibold text-sm text-white">Crash Reports</h1>
            <p className="text-xs text-zinc-500">
              {crashReports.length} report{crashReports.length !== 1 ? 's' : ''} found
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - crash list */}
        <div className="w-52 min-w-[208px] max-w-[208px] border-r border-zinc-800/50 flex flex-col flex-shrink-0">
          <div className="px-3 py-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Recent Crashes</span>
          </div>
          <ScrollArea className="flex-1 scrollbar-hide">
            <div className="px-2 pb-2 space-y-0.5">
              {crashReports.length === 0 ? (
                <div className="p-3 text-center text-zinc-600 text-xs">
                  No crash reports found
                </div>
              ) : (
                crashReports.map((crash) => (
                  <button
                    key={crash.path}
                    onClick={() => handleSelectCrash(crash)}
                    className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                      selectedCrash?.path === crash.path
                        ? 'bg-zinc-800'
                        : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    <span className="text-xs text-zinc-300">{formatDate(crash.modified)}</span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedCrash ? (
            <>
              {/* Error Summary */}
              <div className="px-5 py-3 bg-red-500/10">
                <p className="text-red-400 font-mono text-xs truncate">{getErrorSummary()}</p>
              </div>

              {/* Crash Log Content */}
              <ScrollArea className="flex-1 scrollbar-hide">
                <div className="p-5">
                  <pre className="font-mono text-[11px] text-zinc-400 whitespace-pre-wrap leading-relaxed">
                    {crashContent}
                  </pre>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-zinc-600">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-xs">Select a crash report to view</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-900/50">
        <Button
          onClick={handleOpenFolder}
          variant="outline"
          size="sm"
          className="h-8 px-3 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white text-xs"
        >
          <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
          Open Folder
        </Button>
        <Button
          onClick={handleCopy}
          variant="outline"
          size="sm"
          disabled={!crashContent}
          className="h-8 px-3 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white text-xs disabled:opacity-50"
        >
          <Copy className="w-3.5 h-3.5 mr-1.5" />
          {copied ? "Copied!" : "Copy Log"}
        </Button>
      </div>
    </div>
  );
}
