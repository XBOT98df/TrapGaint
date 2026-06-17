import { useState, useEffect, useRef } from "react";
import { Copy, X, Terminal, Trash2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export default function GameConsole() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen for game logs from the main process
    const unlisten = listen<{ line: string }>("game-log", (event) => {
      const line = event.payload.line;
      if (line && line.trim()) {
        setLogs(prev => [...prev.slice(-500), formatLog(line)]);
      }
    });

    // Listen for game status changes
    const unlistenStatus = listen<{ status: string }>("game-status", (event) => {
      if (event.payload.status === "stopped") {
        setIsPlaying(false);
        setLogs(prev => [...prev, `[${getTimestamp()}] Game process ended`]);
      }
    });

    // Check initial game status
    checkGameStatus();

    return () => {
      unlisten.then(fn => fn());
      unlistenStatus.then(fn => fn());
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const checkGameStatus = async () => {
    try {
      const running = await invoke<boolean>("is_game_running");
      setIsPlaying(running);
    } catch (e) {
      console.error("Failed to check game status:", e);
    }
  };

  const getTimestamp = () => {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  };

  const formatLog = (line: string): string => {
    // Add timestamp if not present
    if (/^\d{2}:\d{2}:\d{2}/.test(line)) {
      return line;
    }
    const cleanLine = line.replace(/^\[(INFO|ERROR|WARN|STDERR|GAME)\]\s*/, '');
    return `[${getTimestamp()}] ${cleanLine}`;
  };

  const getLogColor = (line: string): string => {
    if (line.includes("ERROR") || line.includes("❌") || line.includes("Exception") || line.includes("Error:")) {
      return "text-red-400";
    }
    if (line.includes("WARN") || line.includes("⚠")) {
      return "text-yellow-400";
    }
    if (line.includes("✓") || line.includes("complete") || line.includes("success")) {
      return "text-emerald-400";
    }
    if (line.includes("[GAME]")) {
      return "text-pink-400";
    }
    return "text-zinc-400";
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const handleClear = () => {
    setLogs([`[${getTimestamp()}] Console cleared`]);
  };

  const handleStop = async () => {
    try {
      await invoke("stop_game");
      setIsPlaying(false);
      setLogs(prev => [...prev, `[${getTimestamp()}] Game stopped by user`]);
    } catch (e) {
      console.error("Failed to stop game:", e);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col select-none">
      {/* Header - draggable */}
      <div 
        className="flex items-center justify-between px-5 py-3 bg-black border-b border-zinc-950"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-emerald-500" />
          <div>
            <h1 className="font-serif italic font-semibold text-sm text-white">Game Console</h1>
            <p className="text-xs text-zinc-500">
              {isPlaying ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Game Running
                </span>
              ) : (
                "Game Stopped"
              )}
            </p>
          </div>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {isPlaying && (
            <Button
              onClick={handleStop}
              variant="outline"
              size="sm"
              className="h-7 px-2.5 bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400 text-xs"
            >
              <Square className="w-3 h-3 mr-1.5 fill-current" />
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* Console Output - no scrollbar */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>
        {logs.length === 0 ? (
          <div className="text-zinc-600 text-center py-8">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Waiting for game output...</p>
          </div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={`${getLogColor(line)} whitespace-pre-wrap break-all`}>
              {line}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-900/50 border-t border-zinc-800/50">
        <div className="text-xs text-zinc-600">
          {logs.length} lines
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleClear}
            variant="outline"
            size="sm"
            className="h-7 px-2.5 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white text-xs"
          >
            <Trash2 className="w-3 h-3 mr-1.5" />
            Clear
          </Button>
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            disabled={logs.length === 0}
            className="h-7 px-2.5 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white text-xs disabled:opacity-50"
          >
            <Copy className="w-3 h-3 mr-1.5" />
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
