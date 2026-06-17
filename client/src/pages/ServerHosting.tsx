import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Server, Play, Square, Trash2, Settings, Users, Copy, ExternalLink, Plus, Terminal, Globe, Lock, Wifi, Loader2, FolderOpen, ArrowLeft, Activity, HardDrive, Pencil, Save, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedGradientBackground from "@/components/ui/animated-gradient-background";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { EulaDialog } from "@/components/EulaDialog";
import { AIInput } from "@/components/ui/ai-input";
import { DotFlow } from "@/components/ui/dot-flow";
import { ParticleButton } from "@/components/ui/particle-button";
import { TabButton } from "@/components/ui/tab-button";
import { GrassBlockIcon, OakPlanksIcon, StoneIcon, CobblestoneIcon } from "@/components/ui/minecraft-icons";
import { ServerNotification } from "@/components/ui/server-notification";
import RotatingEarth from "@/components/ui/wireframe-dotted-globe";

interface MinecraftServer {
  id: string;
  name: string;
  version: string;
  loader: string;
  port: number;
  max_players: number;
  ram_mb: number;
  is_online: boolean;
  is_public: boolean;
  ngrok_url?: string;
  server_dir: string;
  created_at: number;
}

interface ServerFile {
  name: string;
  is_directory: boolean;
  size: number;
}

interface ServerTemplate {
  name: string;
  description: string;
  icon: any;
  version: string;
  loader: string;
  ram: number;
}

const SERVER_TEMPLATES: ServerTemplate[] = [
  {
    name: "Survival",
    description: "Classic survival experience",
    icon: GrassBlockIcon,
    version: "1.21.11",
    loader: "vanilla",
    ram: 2048,
  },
  {
    name: "Creative",
    description: "Build without limits",
    icon: OakPlanksIcon,
    version: "1.21.11",
    loader: "vanilla",
    ram: 1024,
  },
  {
    name: "PvP Arena",
    description: "Competitive combat server",
    icon: StoneIcon,
    version: "1.8.9",
    loader: "vanilla",
    ram: 2048,
  },
  {
    name: "Modded",
    description: "Paper server with plugins",
    icon: CobblestoneIcon,
    version: "1.21.1",
    loader: "paper",
    ram: 4096,
  },
];

export default function ServerHosting() {
  const [servers, setServers] = useState<MinecraftServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<MinecraftServer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showServerManagement, setShowServerManagement] = useState(false);
  const showServerManagementRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    console.log('[ServerHosting] State changed - showServerManagement:', showServerManagement);
    showServerManagementRef.current = showServerManagement;
  }, [showServerManagement]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [consoleCommand, setConsoleCommand] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [serverFiles, setServerFiles] = useState<ServerFile[]>([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [showEulaDialog, setShowEulaDialog] = useState(false);
  const [eulaServerId, setEulaServerId] = useState<string | null>(null);
  const [eulaServerName, setEulaServerName] = useState<string>("");
  const [openFile, setOpenFile] = useState<{ name: string; content: string } | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isDeletingServer, setIsDeletingServer] = useState(false);
  const [userClickedBack, setUserClickedBack] = useState(false);
  const [lastLogUpdate, setLastLogUpdate] = useState(Date.now());
  const [previousOnlineStatus, setPreviousOnlineStatus] = useState<boolean | null>(null);
  const [serverStats, setServerStats] = useState<{cpu: number, memory: number, disk: number} | null>(null);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);
  const [publicIP, setPublicIP] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"console" | "files" | "players" | "settings">("console");
  const isDeletingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const isStartingRef = useRef<string | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedNotificationRef = useRef<Set<string>>(new Set());
  
  // Notification state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationData, setNotificationData] = useState({
    title: "",
    message: "",
    type: "info" as "info" | "success" | "error" | "loading"
  });

  // Initialize audio element
  useEffect(() => {
    notificationAudioRef.current = new Audio('/server-start.mp3');
    notificationAudioRef.current.volume = 0.5; // Set volume to 50%
    
    return () => {
      if (notificationAudioRef.current) {
        notificationAudioRef.current.pause();
        notificationAudioRef.current = null;
      }
    };
  }, []);

  // Helper function to play notification sound only once per server start
  const playNotificationOnce = (serverId: string) => {
    if (!hasPlayedNotificationRef.current.has(serverId)) {
      hasPlayedNotificationRef.current.add(serverId);
      if (notificationAudioRef.current) {
        notificationAudioRef.current.play().catch(err => {
          console.log("[ServerHosting] Could not play notification sound:", err);
        });
      }
    }
  };

  // Clear notification flag when server goes offline
  useEffect(() => {
    if (selectedServer && !selectedServer.is_online) {
      hasPlayedNotificationRef.current.delete(selectedServer.id);
    }
  }, [selectedServer?.is_online, selectedServer?.id]);

  // Manual refresh function
  const refreshLogs = async () => {
    if (!selectedServer) return;
    setIsRefreshingLogs(true);
    try {
      const logs = await invoke<string[]>("get_server_logs", { serverId: selectedServer.id });
      setConsoleLogs(logs);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  const acceptEula = async () => {
    if (!eulaServerId) return;

    try {
      // Close dialog first
      setShowEulaDialog(false);

      // Accept EULA
      await invoke("accept_server_eula", { serverId: eulaServerId });

      toast({
        title: "EULA Accepted",
        description: "Starting server now...",
      });

      // Wait a moment for file to be written
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start the server after accepting EULA
      await startServer(eulaServerId);

      // Clear EULA state
      setEulaServerId(null);
      setEulaServerName("");
    } catch (error) {
      console.error("Failed to accept EULA:", error);
      toast({
        title: "Error",
        description: `Failed to accept EULA: ${error}`,
        variant: "destructive",
      });
    }
  };

  // Auto-scroll disabled - users can scroll freely in console
  // useEffect(() => {
  //   if (consoleEndRef.current) {
  //     const container = consoleEndRef.current.parentElement;
  //     if (container) {
  //       // Check if user is already near the bottom (within 100px)
  //       const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  //       
  //       // Only auto-scroll if user is already at the bottom
  //       if (isNearBottom) {
  //         consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
  //       }
  //     }
  //   }
  // }, [consoleLogs, lastLogUpdate]);

  // Auto-refresh logs when server is selected or its online status changes
  useEffect(() => {
    if (!selectedServer) {
      console.log("[ServerHosting] No server selected, skipping log fetch");
      return;
    }

    console.log("[ServerHosting] Setting up log auto-refresh for server:", selectedServer.id);

    const fetchLogs = async () => {
      try {
        const logs = await invoke<string[]>("get_server_logs", { serverId: selectedServer.id });
        
        // Check if server just came online (logs contain "Done" but console doesn't have our message yet)
        const hasDoneMessage = logs.some(log => log.includes("Done (") || log.includes("Done!"));
        const hasOnlineMessage = logs.some(log => log.includes("[Dragon Panel]: ✓ SERVER IS NOW ONLINE!"));
        
        if (hasDoneMessage && !hasOnlineMessage && selectedServer.is_online) {
          // Server is online but we haven't added our message yet
          console.log("[ServerHosting] Server is online! Adding success message");
          
          // Play notification sound once
          playNotificationOnce(selectedServer.id);
          
          setConsoleLogs([
            ...logs,
            "",
            "═══════════════════════════════════════════════════════════",
            "[Dragon Panel]: ✓ SERVER IS NOW ONLINE!",
            `[Dragon Panel]: Players can connect at: localhost:${selectedServer.port}`,
            "═══════════════════════════════════════════════════════════",
            ""
          ]);
        } else {
          setConsoleLogs(logs);
        }
        
        // Force re-render by updating a timestamp
        setLastLogUpdate(Date.now());
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      }
    };

    fetchLogs();
    // Refresh every 500ms for smoother real-time updates
    const interval = setInterval(fetchLogs, 500);

    return () => {
      console.log("[ServerHosting] Cleaning up log auto-refresh");
      clearInterval(interval);
    };
  }, [selectedServer?.id, selectedServer?.is_online, selectedServer?.port]); // Watch both id and online status

  // Watch for server status changes and add console messages
  useEffect(() => {
    if (!selectedServer) {
      setPreviousOnlineStatus(null);
      return;
    }

    console.log("[ServerHosting] Status check - Previous:", previousOnlineStatus, "Current:", selectedServer.is_online);

    // Check if status changed
    if (previousOnlineStatus !== null && previousOnlineStatus !== selectedServer.is_online) {
      console.log("[ServerHosting] Status changed! Adding message to console");
      if (selectedServer.is_online) {
        // Server just came online
        console.log("[ServerHosting] Server came ONLINE");
        
        // Play notification sound once
        playNotificationOnce(selectedServer.id);
        
        setConsoleLogs(prev => [
          ...prev,
          "",
          "═══════════════════════════════════════════════════════════",
          "[Dragon Panel]: ✓ SERVER IS NOW ONLINE!",
          `[Dragon Panel]: Players can connect at: localhost:${selectedServer.port}`,
          "═══════════════════════════════════════════════════════════",
          ""
        ]);
      } else {
        // Server went offline
        console.log("[ServerHosting] Server went OFFLINE");
        setConsoleLogs(prev => [
          ...prev,
          "",
          "[Dragon Panel]: ✗ Server is now offline",
          ""
        ]);
      }
    }

    // Update previous status
    setPreviousOnlineStatus(selectedServer.is_online);
  }, [selectedServer?.is_online, selectedServer?.port, previousOnlineStatus]);

  // Fetch server stats periodically
  useEffect(() => {
    if (!selectedServer) {
      setServerStats(null);
      return;
    }

    const fetchStats = async () => {
      try {
        const stats = await invoke<{cpu_usage: number, memory_usage_mb: number, disk_usage_mb: number, is_online: boolean}>("get_server_stats", { serverId: selectedServer.id });
        setServerStats({
          cpu: stats.cpu_usage,
          memory: stats.memory_usage_mb,
          disk: stats.disk_usage_mb
        });
      } catch (error) {
        console.error("Failed to fetch server stats:", error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [selectedServer?.id]);

  // Fetch server files when server is selected
  useEffect(() => {
    if (!selectedServer) return;

    const fetchFiles = async () => {
      try {
        const files = await invoke<ServerFile[]>("list_server_files", { serverId: selectedServer.id });
        setServerFiles(files);
      } catch (error) {
        console.error("Failed to fetch files:", error);
      }
    };

    fetchFiles();
  }, [selectedServer]);

  // Create server form
  const [serverName, setServerName] = useState("");
  const [serverVersion, setServerVersion] = useState("1.21.11");
  const [serverLoader, setServerLoader] = useState("vanilla");
  const [serverPort, setServerPort] = useState(25565);
  const [serverRam, setServerRam] = useState(2048);
  const [selectedTemplate, setSelectedTemplate] = useState<ServerTemplate | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const CARDS_PER_PAGE = 8;

  useEffect(() => {
    loadServers();

    // Auto-refresh server list every 2 seconds for real-time status updates
    const interval = setInterval(() => {
      // Only auto-refresh if not currently deleting
      if (!isDeletingRef.current) {
        loadServers();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const loadServers = async () => {
    // Don't load if we're currently deleting
    if (isDeletingRef.current || isLoadingRef.current) {
      console.log("[ServerHosting] Skipping loadServers - operation in progress");
      return;
    }

    isLoadingRef.current = true;
    
    try {
      const serverList = await invoke<MinecraftServer[]>("get_servers");
      
      console.log("[ServerHosting] loadServers - fetched", serverList.length, "servers");
      console.log("[ServerHosting] loadServers - current selectedServer:", selectedServer?.id || "null");
      console.log("[ServerHosting] loadServers - userClickedBack:", userClickedBack);

      // Always update the server list
      setServers(serverList);

      // Don't auto-update if user intentionally clicked back
      if (userClickedBack) {
        console.log("[ServerHosting] User clicked back, not re-selecting server");
        isLoadingRef.current = false;
        return;
      }

      // Update selected server if it exists in the new list
      if (selectedServer) {
        const updatedServer = serverList.find(s => s.id === selectedServer.id);
        if (updatedServer) {
          console.log("[ServerHosting] Updating selected server with fresh data");
          // Only update if there are actual changes to prevent unnecessary re-renders
          if (JSON.stringify(updatedServer) !== JSON.stringify(selectedServer)) {
            setSelectedServer(updatedServer);
          }
        } else {
          // Server was deleted, clear selection
          console.log("[ServerHosting] Selected server was deleted, clearing selection");
          setSelectedServer(null);
          setUserClickedBack(true);
        }
      } else {
        console.log("[ServerHosting] No server selected, staying on list view");
      }
      
    } catch (error) {
      console.error("Failed to load servers:", error);
      toast({
        title: "Error",
        description: "Failed to load servers",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const createServer = async () => {
    if (!serverName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a server name",
        variant: "destructive",
      });
      return;
    }

    // Check if server name already exists
    const nameExists = servers.some(
      server => server.name.toLowerCase() === serverName.trim().toLowerCase()
    );
    
    if (nameExists) {
      toast({
        title: "Error",
        description: `A server named "${serverName}" already exists. Please choose a different name.`,
        variant: "destructive",
      });
      return;
    }

    try {
      await invoke("create_server", {
        name: serverName,
        version: serverVersion,
        loader: serverLoader,
        port: serverPort,
        ramMb: serverRam,
      });

      toast({
        title: "Success",
        description: `Server "${serverName}" created successfully!`,
      });

      setShowCreateDialog(false);
      resetCreateForm();
      loadServers();
    } catch (error) {
      console.error("Failed to create server:", error);
      toast({
        title: "Error",
        description: `Failed to create server: ${error}`,
        variant: "destructive",
      });
    }
  };

  const startServer = async (serverId: string) => {
    try {
      console.log("[ServerHosting] Start button clicked for server:", serverId);
      setIsStarting(serverId);
      isStartingRef.current = serverId; // Also set ref to persist across re-renders

      // Log server info for debugging
      const server = servers.find(s => s.id === serverId);
      console.log("[ServerHosting] Starting server:", server?.name, "Version:", server?.version, "Loader:", server?.loader);

      // Check if EULA has been accepted for this server
      // If server has never been started (no eula.txt), show dialog first
      try {
        console.log("[ServerHosting] Checking EULA status...");
        const hasEula = await invoke<boolean>("check_server_eula", { serverId: serverId });
        console.log("[ServerHosting] EULA status:", hasEula);
        
        if (!hasEula) {
          // EULA not accepted yet - show dialog BEFORE starting
          console.log("[ServerHosting] EULA not found, showing dialog");
          setEulaServerId(serverId);
          setEulaServerName(server?.name || "Server");
          setShowEulaDialog(true);
          setIsStarting(null);
          isStartingRef.current = null;
          
          toast({
            title: "EULA Required",
            description: "You must accept the Minecraft EULA before starting this server",
          });
          return;
        }
      } catch (error) {
        console.log("[ServerHosting] Error checking EULA, will proceed:", error);
        // If check fails, proceed anyway and let server handle it
      }

      // Clear old logs immediately
      setConsoleLogs(["[Dragon Panel]: Starting server...", "[Dragon Panel]: Please wait..."]);

      await invoke("start_server", { serverId: serverId });
      console.log("[ServerHosting] start_server called with serverId:", serverId);

      // Wait a moment for server to start writing logs
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Reload servers to update UI
      await loadServers();

      // Fetch initial logs
      try {
        const logs = await invoke<string[]>("get_server_logs", { serverId: serverId });
        setConsoleLogs(logs);

        // Check for port binding error
        const hasPortError = logs.some(log =>
          log.includes("FAILED TO BIND TO PORT") ||
          log.includes("Address already in use") ||
          log.includes("BindException")
        );

        if (hasPortError) {
          toast({
            title: "Port Already In Use",
            description: "Delete this server and create a new one. It will automatically use an available port.",
            variant: "destructive",
          });
          return;
        }

        // Check if logs contain EULA error - be more aggressive with detection
        const hasEulaError = logs.some(log => {
          const lowerLog = log.toLowerCase();
          return (
            lowerLog.includes("eula") ||
            lowerLog.includes("you need to agree") ||
            (lowerLog.includes("eula.txt") && lowerLog.includes("false"))
          );
        });

        console.log("[ServerHosting] Checking for EULA error. Has error:", hasEulaError);
        console.log("[ServerHosting] Sample logs:", logs.slice(0, 10));

        if (hasEulaError) {
          // EULA not accepted - show dialog
          const server = servers.find(s => s.id === serverId);
          setEulaServerId(serverId);
          setEulaServerName(server?.name || "Server");
          setShowEulaDialog(true);

          toast({
            title: "EULA Required",
            description: "You must accept the Minecraft EULA to run this server",
          });
        } else {
          // Poll for server to come online
          // Server is starting, poll for status without showing toast

          // Poll every second for up to 60 seconds to detect when server comes online
          let pollCount = 0;
          const maxPolls = 60;
          const pollInterval = setInterval(async () => {
            pollCount++;
            
            try {
              const updatedServers = await invoke<MinecraftServer[]>("get_servers");
              const updatedServer = updatedServers.find(s => s.id === serverId);

              if (updatedServer?.is_online) {
                // Server is online! Clear starting state and update selected server
                clearInterval(pollInterval);
                setIsStarting(null);
                isStartingRef.current = null;
                
                // Update the selected server with the online status
                setSelectedServer(updatedServer);
                
                // Also update the servers list
                setServers(updatedServers);
                
                console.log("[ServerHosting] Server is now ONLINE! Updated selectedServer:", updatedServer);
                
                // Play notification sound once
                playNotificationOnce(updatedServer.id);
                
                // Show success notification
                setNotificationData({
                  title: `${updatedServer.name} is Online`,
                  message: `Server started successfully on port ${updatedServer.port}`,
                  type: "success"
                });
                setShowNotification(true);
                setTimeout(() => setShowNotification(false), 5000);
                
                setConsoleLogs(prev => [
                  ...prev,
                  "",
                  "═══════════════════════════════════════════════════════════",
                  "[Dragon Panel]: ✓ SERVER IS NOW ONLINE!",
                  `[Dragon Panel]: Players can connect at: localhost:${updatedServer.port}`,
                  "═══════════════════════════════════════════════════════════",
                  ""
                ]);
                
                // Force a final refresh to ensure UI is in sync
                setTimeout(() => {
                  loadServers();
                }, 500);
              } else if (pollCount >= maxPolls) {
                // Timeout - stop polling and clear starting state
                clearInterval(pollInterval);
                setIsStarting(null);
                isStartingRef.current = null;
                
                toast({
                  title: "Server Taking Long",
                  description: "Server is still starting. Check console for progress.",
                });
              }
            } catch (error) {
              console.error("Error polling server status:", error);
              clearInterval(pollInterval);
              setIsStarting(null);
              isStartingRef.current = null;
            }
          }, 1000);
        }
      } catch (error) {
        console.error("Failed to fetch logs:", error);
        setIsStarting(null);
        isStartingRef.current = null;
      }

      // Fetch files too
      try {
        const files = await invoke<ServerFile[]>("list_server_files", { serverId: serverId });
        setServerFiles(files);
      } catch (error) {
        console.error("Failed to fetch files:", error);
      }
    } catch (error: any) {
      console.error("Failed to start server:", error);

      toast({
        title: "Error",
        description: `Failed to start server: ${error}`,
        variant: "destructive",
      });

      setConsoleLogs(prev => [...prev, `[ERROR]: ${error}`]);
      setIsStarting(null);
      isStartingRef.current = null;
    }
  };

  const stopServer = async (serverId: string) => {
    console.log("[ServerHosting] Stop button clicked for server:", serverId);
    try {
      // Show stopping message immediately
      setConsoleLogs(prev => [...prev, "[Dragon Panel]: Stopping server..."]);

      console.log("[ServerHosting] Calling stop_server...");
      await invoke("stop_server", { serverId: serverId });
      console.log("[ServerHosting] stop_server completed");

      // Reload servers to update UI
      await loadServers();

      // Wait a moment for final logs, then force refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      await refreshLogs();

      // Add final message
      setConsoleLogs(prev => [...prev, "[Dragon Panel]: Server stopped"]);
    } catch (error) {
      console.error("[ServerHosting] Failed to stop server:", error);
      toast({
        title: "Error",
        description: `Failed to stop server: ${error}`,
        variant: "destructive",
      });
    }
  };

  const deleteServer = async (serverId: string, serverName: string) => {
    console.log("========================================");
    console.log("[ServerHosting] DELETE INITIATED");
    console.log("[ServerHosting] Server ID:", serverId);
    console.log("[ServerHosting] Server Name:", serverName);
    console.log("[ServerHosting] Current servers:", servers.map(s => ({ id: s.id, name: s.name })));
    console.log("========================================");
    
    if (!window.confirm(`Are you sure you want to delete "${serverName}"? This cannot be undone.`)) {
      console.log("[ServerHosting] User cancelled deletion");
      return;
    }

    console.log("[ServerHosting] User confirmed deletion, proceeding...");
    setIsDeletingServer(true);
    isDeletingRef.current = true; // This blocks auto-refresh

    try {
      // Stop server first if it's running
      const server = servers.find(s => s.id === serverId);
      if (server?.is_online) {
        console.log("[ServerHosting] Server is online, stopping first...");
        await invoke("stop_server", { serverId: serverId });
        console.log("[ServerHosting] Stop command sent, waiting 2s...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log("[ServerHosting] Server is offline, proceeding to delete");
      }

      console.log("[ServerHosting] Calling backend delete_server...");
      await invoke("delete_server", { serverId: serverId });
      console.log("[ServerHosting] ✓ Backend delete_server completed successfully!");

      // Immediately remove from UI for instant feedback
      setServers(prev => {
        const filtered = prev.filter(s => s.id !== serverId);
        console.log("[ServerHosting] Updated UI - removed server. Remaining:", filtered.map(s => ({ id: s.id, name: s.name })));
        return filtered;
      });
      
      // Clear selection if this was the selected server
      if (selectedServer?.id === serverId) {
        console.log("[ServerHosting] Clearing selected server (was viewing deleted server)");
        setUserClickedBack(true);
        setSelectedServer(null);
      }

      toast({
        title: "Server Deleted",
        description: `Server "${serverName}" has been deleted`,
      });

      // Wait a bit, then reload to ensure sync
      console.log("[ServerHosting] Waiting 1s before final sync...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Re-enable auto-refresh and force a reload
      isDeletingRef.current = false;
      console.log("[ServerHosting] Re-enabling auto-refresh, fetching fresh server list...");
      
      // Force reload from backend to ensure sync
      const updatedServers = await invoke<MinecraftServer[]>("get_servers");
      console.log("[ServerHosting] ✓ Fresh server list from backend:", updatedServers.map(s => ({ id: s.id, name: s.name })));
      
      // Check if deleted server is still in the list
      const stillExists = updatedServers.find(s => s.id === serverId);
      if (stillExists) {
        console.error("[ServerHosting] ✗ ERROR: Deleted server still exists in backend!");
        console.error("[ServerHosting] This should not happen - backend delete may have failed");
      } else {
        console.log("[ServerHosting] ✓ Confirmed: Server not in backend list");
      }
      
      setServers(updatedServers);
      
      // If we deleted the last card on the current page, go back one page
      const totalPages = Math.ceil(updatedServers.length / CARDS_PER_PAGE);
      if (currentPage >= totalPages && currentPage > 0) {
        setCurrentPage(currentPage - 1);
      }
      
      console.log("========================================");
      console.log("[ServerHosting] DELETE COMPLETE");
      console.log("========================================");
      
    } catch (error) {
      console.error("========================================");
      console.error("[ServerHosting] ✗ DELETE FAILED");
      console.error("[ServerHosting] Error:", error);
      console.error("========================================");
      
      // Restore the server in UI if backend delete failed
      isDeletingRef.current = false;
      const updatedServers = await invoke<MinecraftServer[]>("get_servers");
      console.log("[ServerHosting] Restored server list from backend:", updatedServers.map(s => ({ id: s.id, name: s.name })));
      setServers(updatedServers);
      
      toast({
        title: "Error",
        description: `Failed to delete server: ${error}`,
        variant: "destructive",
      });
    } finally {
      setIsDeletingServer(false);
    }
  };


  const copyServerAddress = (server: MinecraftServer) => {
    const address = server.ngrok_url || (publicIP && server.is_public ? `${publicIP}:${server.port}` : `localhost:${server.port}`);
    navigator.clipboard.writeText(address);
    toast({
      title: "Copied!",
      description: `Server address copied: ${address}`,
    });
  };

  const openServerFolder = async (server: MinecraftServer) => {
    try {
      await invoke("open_folder", { path: server.server_dir });
    } catch (error) {
      console.error("Failed to open folder:", error);
      toast({
        title: "Error",
        description: `Failed to open folder: ${error}`,
        variant: "destructive",
      });
    }
  };

  const startTunnel = async (serverId: string) => {
    console.log("[ServerHosting] Make Public button clicked for server:", serverId);
    setIsStartingTunnel(true);
    try {
      // First, get the public IP
      let publicIPAddress = "";
      try {
        publicIPAddress = await invoke<string>("get_public_ip");
        console.log("[ServerHosting] Public IP:", publicIPAddress);
        setPublicIP(publicIPAddress); // Store in state
      } catch (e) {
        console.error("[ServerHosting] Failed to get public IP:", e);
      }

      setNotificationData({
        title: "Starting Tunnel",
        message: publicIPAddress ? `Your public IP: ${publicIPAddress}` : "Setting up public access...",
        type: "loading"
      });
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);

      console.log("[ServerHosting] Calling start_tunnel...");
      const url = await invoke<string>("start_tunnel", { serverId: serverId });
      console.log("[ServerHosting] start_tunnel completed, URL:", url);
      
      console.log("[Tunnel] Initial URL response:", url);
      
      // Poll for the URL if it's not ready yet
      if (url === "Tunnel starting..." || url === "Waiting for tunnel...") {
        console.log("[Tunnel] URL not ready, polling...");
        
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds (increased for download time)
        
        const pollInterval = setInterval(async () => {
          attempts++;
          
          try {
            const updatedServers = await invoke<MinecraftServer[]>("get_servers");
            const updatedServer = updatedServers.find(s => s.id === serverId);
            
            if (updatedServer?.ngrok_url && updatedServer.ngrok_url !== "Tunnel starting..." && updatedServer.ngrok_url !== "Waiting for tunnel...") {
              clearInterval(pollInterval);
              setIsStartingTunnel(false);
              
              // Update UI
              setServers(updatedServers);
              if (selectedServer?.id === serverId) {
                setSelectedServer(updatedServer);
              }
              
              setNotificationData({
                title: "Tunnel Active!",
                message: `Share this address: ${updatedServer.ngrok_url}`,
                type: "success"
              });
              setShowNotification(true);
              setTimeout(() => setShowNotification(false), 10000);
              
              console.log("[Tunnel] ✓ URL found:", updatedServer.ngrok_url);
            } else if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              setIsStartingTunnel(false);
              
              setNotificationData({
                title: "Tunnel Started",
                message: "Check the console for the public address",
                type: "info"
              });
              setShowNotification(true);
              setTimeout(() => setShowNotification(false), 5000);
            } else if (attempts % 5 === 0) {
              // Show progress every 5 seconds
              setNotificationData({
                title: "Still Setting Up...",
                message: `Please wait (${attempts}s elapsed)`,
                type: "loading"
              });
              setShowNotification(true);
              setTimeout(() => setShowNotification(false), 3000);
            }
          } catch (error) {
            console.error("[Tunnel] Polling error:", error);
          }
        }, 1000);
      } else {
        // URL is ready immediately
        await loadServers();
        
        setNotificationData({
          title: "Tunnel Active!",
          message: `Share this address: ${url}`,
          type: "success"
        });
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 10000);
        
        setIsStartingTunnel(false);
      }
    } catch (error) {
      console.error("Failed to start tunnel:", error);
      setNotificationData({
        title: "Error",
        message: `Failed to start tunnel: ${error}`,
        type: "error"
      });
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);
      setIsStartingTunnel(false);
    }
  };

  const stopTunnel = async (serverId: string) => {
    console.log("[ServerHosting] Make Private button clicked for server:", serverId);
    try {
      console.log("[ServerHosting] Calling stop_tunnel...");
      await invoke("stop_tunnel", { serverId: serverId });
      console.log("[ServerHosting] stop_tunnel completed");
      
      // Reload servers to clear URL
      await loadServers();

      toast({
        title: "Tunnel Stopped",
        description: "Server is now private",
      });
    } catch (error) {
      console.error("[ServerHosting] Failed to stop tunnel:", error);
      toast({
        title: "Error",
        description: `Failed to stop tunnel: ${error}`,
        variant: "destructive",
      });
    }
  };

  const openServerFile = async (fileName: string) => {
    if (!selectedServer) return;

    setIsLoadingFile(true);
    try {
      const filePath = `${selectedServer.server_dir}/${fileName}`;
      const content = await invoke<string>("read_server_file", { path: filePath });
      setOpenFile({ name: fileName, content });
      setEditedContent(content);
      setIsEditingFile(false);
    } catch (error) {
      console.error("Failed to read file:", error);
      toast({
        title: "Error",
        description: `Failed to read file: ${error}`,
        variant: "destructive",
      });
    } finally {
      setIsLoadingFile(false);
    }
  };

  const saveServerFile = async () => {
    if (!selectedServer || !openFile) return;

    setIsSavingFile(true);
    try {
      const filePath = `${selectedServer.server_dir}/${openFile.name}`;
      await invoke("write_server_file", { path: filePath, content: editedContent });

      setOpenFile({ ...openFile, content: editedContent });
      setIsEditingFile(false);

      toast({
        title: "Saved!",
        description: `${openFile.name} has been saved successfully`,
      });
    } catch (error) {
      console.error("Failed to save file:", error);
      toast({
        title: "Error",
        description: `Failed to save file: ${error}`,
        variant: "destructive",
      });
    } finally {
      setIsSavingFile(false);
    }
  };

  const resetCreateForm = () => {
    setServerName("");
    setServerVersion("1.21.8");
    setServerLoader("vanilla");
    setServerPort(25565);
    setServerRam(2048);
    setSelectedTemplate(null);
  };

  const applyTemplate = (template: ServerTemplate) => {
    setSelectedTemplate(template);
    setServerVersion(template.version);
    setServerLoader(template.loader);
    setServerRam(template.ram);
  };

  // If no server selected, show server list
  if (!selectedServer) {
    console.log('[ServerHosting] Render - showServerManagement:', showServerManagement);
    console.log('[ServerHosting] Render - showServerManagementRef:', showServerManagementRef.current);
    console.log('[ServerHosting] Render - servers count:', servers.length);
    console.log('[ServerHosting] Render - userClickedBack:', userClickedBack);
    
    // Show hero page if not in server management mode
    // Use ref to ensure state persists across re-renders
    if (!showServerManagement && !showServerManagementRef.current) {
      console.log('[ServerHosting] Rendering hero page');
      return (
        <div className="h-full flex flex-col bg-black relative overflow-hidden">
          {/* Background Gradient with Image - Local files */}
          <div className="absolute inset-0 w-full h-full z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-black/0 to-black/0 z-10" />
            <img
              src="/hero-gradient.png"
              alt=""
              className="w-full h-full object-cover mix-blend-hard-light opacity-100 z-0"
              style={{
                filter: 'hue-rotate(-150deg) contrast(1.4) saturate(1.5) brightness(1.1)',
              }}
            />
            <div
              className="absolute inset-0 opacity-5 z-20"
              style={{
                backgroundImage: 'url("/hero-texture.png")',
                backgroundSize: "cover",
              }}
            />
          </div>

          {/* Content */}
          <div className="relative z-30 h-full flex flex-col pointer-events-none">
            {/* Hero Section */}
            <section className="relative w-full flex flex-col items-center justify-center px-8 pt-24 pb-16 flex-1 pointer-events-none">
              <div className="w-full max-w-5xl flex flex-col items-center gap-8 pointer-events-none">
                {/* Badge */}
                <div className="inline-flex items-center justify-center px-3 py-1.5 rounded-2xl bg-white/10 backdrop-blur-sm pointer-events-none">
                  <span className="text-white font-mono text-xs uppercase tracking-wide">
                    Server Hosting
                  </span>
                </div>

                {/* Heading */}
                <h1 className="text-center text-5xl md:text-6xl font-medium leading-tight tracking-tight text-white pointer-events-none">
                  Host your own
                  <br />
                  Minecraft servers
                </h1>

                {/* Subheading */}
                <p className="text-center text-base leading-relaxed text-white/60 max-w-2xl pointer-events-none">
                  Create and manage powerful Minecraft servers with just a few clicks.
                  <br />
                  Full control, zero hassle.
                </p>

                {/* CTA Button */}
                <button 
                  onMouseEnter={() => console.log('[ServerHosting] Button hover detected')}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[ServerHosting] ========== BUTTON CLICKED ==========');
                    console.log('[ServerHosting] Event:', e);
                    console.log('[ServerHosting] BEFORE - showServerManagement:', showServerManagement);
                    console.log('[ServerHosting] BEFORE - showServerManagementRef:', showServerManagementRef.current);
                    
                    setShowServerManagement(true);
                    showServerManagementRef.current = true;
                    
                    console.log('[ServerHosting] AFTER setState - ref is now:', showServerManagementRef.current);
                    console.log('[ServerHosting] State update scheduled, will render on next cycle');
                    console.log('[ServerHosting] ========================================');
                  }}
                  className="px-5 py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-all shadow-lg hover:shadow-xl cursor-pointer pointer-events-auto"
                >
                  Start Creating
                </button>
              </div>
            </section>
          </div>
        </div>
      );
    }

    // Show server management view
    console.log('[ServerHosting] ===== RENDERING SERVER MANAGEMENT VIEW =====');
    console.log('[ServerHosting] showServerManagement:', showServerManagement);
    console.log('[ServerHosting] showServerManagementRef:', showServerManagementRef.current);
    console.log('[ServerHosting] servers.length:', servers.length);
    return (
      <div className="h-full flex flex-col bg-black relative overflow-hidden">
        {/* Background Gradient with Image - Local files - Fullscreen */}
        <div className="absolute inset-0 w-full h-full z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black via-black/0 to-black/0 z-10" />
          <img
            src="/hero-gradient.png"
            alt=""
            className="w-full h-full object-cover mix-blend-hard-light opacity-100 z-0"
            style={{
              filter: 'hue-rotate(-150deg) contrast(1.4) saturate(1.5) brightness(1.1)',
            }}
          />
          <div
            className="absolute inset-0 opacity-5 z-20"
            style={{
              backgroundImage: 'url("/hero-texture.png")',
              backgroundSize: "cover",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-30 h-full flex flex-col">
          {/* Back Button and Add Button - Top-left corner */}
          <div className="absolute top-6 left-6 z-50 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log('[ServerHosting] Back to Home clicked');
                setShowServerManagement(false);
                showServerManagementRef.current = false;
              }}
              className="text-zinc-400 hover:text-white backdrop-blur-sm bg-black/30 hover:bg-black/50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>

            {/* Add Server Button */}
            <button
              onClick={() => setShowCreateDialog(true)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 hover:border-white/40 flex items-center justify-center transition-all hover:scale-110 group"
              title="Create new server"
            >
              <Plus className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
            </button>
          </div>

          {/* Hidden Create Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="max-w-2xl bg-black border-zinc-800">
                  <DialogHeader>
                    <DialogTitle>Create New Server</DialogTitle>
                  </DialogHeader>
                  <Tabs defaultValue="template" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-black">
                      <TabsTrigger value="template">Templates</TabsTrigger>
                      <TabsTrigger value="custom">Custom</TabsTrigger>
                    </TabsList>

                    <TabsContent value="template" className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {SERVER_TEMPLATES.map((template) => (
                          <Card
                            key={template.name}
                            className={`relative cursor-pointer transition-all overflow-hidden ${
                              selectedTemplate?.name === template.name 
                                ? "bg-black border-2 border-primary animate-pulse" 
                                : "bg-black border border-zinc-700 hover:border-zinc-500"
                            }`}
                            onClick={() => applyTemplate(template)}
                            style={{
                              boxShadow: selectedTemplate?.name === template.name 
                                ? '0 0 20px rgba(59, 130, 246, 0.3)' 
                                : 'none'
                            }}
                          >
                            {selectedTemplate?.name === template.name && (
                              <div 
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  background: 'linear-gradient(45deg, transparent 30%, rgba(59, 130, 246, 0.1) 50%, transparent 70%)',
                                  backgroundSize: '200% 200%',
                                  animation: 'shimmer 3s ease-in-out infinite'
                                }}
                              />
                            )}
                            <CardHeader>
                              <div className="flex items-center gap-3 relative z-10">
                                <template.icon className="w-8 h-8" />
                                <div>
                                  <CardTitle className="text-lg">{template.name}</CardTitle>
                                  <p className="text-sm text-zinc-400">{template.description}</p>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="flex gap-2 flex-wrap relative z-10">
                                <Badge variant="secondary">{template.version}</Badge>
                                <Badge variant="secondary">{template.loader}</Badge>
                                <Badge variant="secondary">{template.ram}MB RAM</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                    <div className="space-y-4 pt-4">
                      <div>
                        <Label>Server Name</Label>
                        <Input
                          placeholder="My Awesome Server"
                          value={serverName}
                          onChange={(e) => setServerName(e.target.value)}
                          className="bg-black border-zinc-800"
                        />
                      </div>
                      <div>
                        <Label>Port</Label>
                        <Input
                          type="number"
                          value={serverPort}
                          onChange={(e) => setServerPort(parseInt(e.target.value))}
                          className="bg-black border-zinc-800"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="custom" className="space-y-4">
                    <div>
                      <Label>Server Name</Label>
                      <Input
                        placeholder="My Awesome Server"
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value)}
                        className="bg-black border-zinc-800"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Version</Label>
                        <Select value={serverVersion} onValueChange={setServerVersion}>
                          <SelectTrigger className="bg-black border-zinc-800">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1.21.11">1.21.11 (Latest)</SelectItem>
                            <SelectItem value="1.21.1">1.21.1</SelectItem>
                            <SelectItem value="1.21">1.21</SelectItem>
                            <SelectItem value="1.20.1">1.20.1</SelectItem>
                            <SelectItem value="1.19.4">1.19.4</SelectItem>
                            <SelectItem value="1.18.2">1.18.2</SelectItem>
                            <SelectItem value="1.16.5">1.16.5</SelectItem>
                            <SelectItem value="1.12.2">1.12.2</SelectItem>
                            <SelectItem value="1.8.9">1.8.9</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Loader</Label>
                        <Select value={serverLoader} onValueChange={setServerLoader}>
                          <SelectTrigger className="bg-black border-zinc-800">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vanilla">Vanilla</SelectItem>
                            <SelectItem value="paper">Paper</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={serverPort}
                        onChange={(e) => setServerPort(parseInt(e.target.value))}
                        className="bg-black border-zinc-800"
                      />
                    </div>

                    <div>
                      <Label>RAM Allocation (MB): {serverRam}MB</Label>
                      <Slider
                        value={[serverRam]}
                        onValueChange={([value]) => setServerRam(value)}
                        min={512}
                        max={8192}
                        step={512}
                        className="mt-2"
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createServer}>Create Server</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          {/* Server Grid - Clean grid layout */}
          <div className="absolute inset-0 w-full h-full flex items-center justify-center p-8 pt-24">
            {isLoading ? (
              <div className="flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-white/50" />
              </div>
            ) : servers.length === 0 ? (
              <div className="text-center space-y-6">
                <Server className="w-20 h-20 mx-auto text-white/20" />
                <div>
                  <h3 
                    className="text-3xl font-bold text-white/90"
                    style={{
                      textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 -1px 0 rgba(255,255,255,0.1)'
                    }}
                  >
                    No servers yet
                  </h3>
                  <p 
                    className="text-lg text-white/50 mt-2"
                    style={{
                      textShadow: '0 1px 2px rgba(0,0,0,0.6)'
                    }}
                  >
                    Create your first server to get started
                  </p>
                </div>
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  size="lg"
                  className="backdrop-blur-sm"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Server
                </Button>
              </div>
            ) : (
              <div className="w-full h-full relative">
                {/* Pagination dots */}
                {servers.length > CARDS_PER_PAGE && (
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
                    {Array.from({ length: Math.ceil(servers.length / CARDS_PER_PAGE) }).map((_, pageIndex) => (
                      <button
                        key={pageIndex}
                        onClick={() => setCurrentPage(pageIndex)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          currentPage === pageIndex 
                            ? 'bg-white w-8' 
                            : 'bg-white/30 hover:bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                )}

                {/* Server cards - 4x2 grid layout (8 cards per page) - ON TOP of wires */}
                <div className="w-full h-full flex items-center justify-center px-16 relative z-10">
                  <div className="grid grid-cols-4 gap-6 w-full max-w-[1400px]" id="server-grid">
                    {servers
                      .slice(currentPage * CARDS_PER_PAGE, (currentPage + 1) * CARDS_PER_PAGE)
                      .map((server, index) => {
                        return (
                          <motion.div
                            key={server.id}
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ 
                              opacity: 1, 
                              scale: 1,
                              y: 0
                            }}
                            whileHover={{
                              scale: 1.05,
                              y: -8,
                              zIndex: 100
                            }}
                            transition={{
                              delay: index * 0.08,
                              duration: 0.4,
                              ease: [0.4, 0, 0.2, 1]
                            }}
                            className="group cursor-pointer relative"
                            onClick={() => {
                              setUserClickedBack(false);
                              setSelectedServer(server);
                            }}
                            onDoubleClick={() => setShowCreateDialog(true)}
                          >
                            {/* Card Container - Smaller size */}
                            <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden bg-black/60 backdrop-blur-xl border border-white/20 hover:border-white/40 transition-all shadow-2xl hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]">
                              {/* Background Pattern */}
                              <div className="absolute inset-0">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                              </div>

                              {/* Delete Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log("[ServerHosting] Delete button clicked for:", server.id, server.name);
                                  deleteServer(server.id, server.name);
                                }}
                                className="absolute top-3 right-3 w-8 h-8 bg-red-500/10 hover:bg-red-500 backdrop-blur-md rounded-lg flex items-center justify-center z-50 transition-all opacity-0 group-hover:opacity-100 border border-red-500/20 hover:border-red-500"
                                title="Delete server"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400 group-hover:text-white transition-colors" />
                              </button>

                              {/* Status Badge */}
                              <div className="absolute top-3 left-3 z-40">
                                {server.is_online ? (
                                  <div className="px-2.5 py-1 bg-emerald-500/20 backdrop-blur-md rounded-lg flex items-center gap-1.5 border border-emerald-500/30">
                                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                                    <span className="text-[10px] font-semibold text-emerald-300 tracking-wide">
                                      ONLINE
                                    </span>
                                  </div>
                                ) : (
                                  <div className="px-2.5 py-1 bg-zinc-800/40 backdrop-blur-md rounded-lg flex items-center gap-1.5 border border-zinc-700/50">
                                    <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
                                    <span className="text-[10px] font-semibold text-zinc-400 tracking-wide">
                                      OFFLINE
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Content */}
                              <div className="absolute inset-0 p-4 flex flex-col justify-end z-30">
                                <div className="space-y-2">
                                  {/* Server Name */}
                                  <h3 className="text-base font-bold text-white line-clamp-1 tracking-tight">
                                    {server.name}
                                  </h3>

                                  {/* Server Info */}
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 bg-white/10 backdrop-blur-sm rounded text-[10px] font-medium text-white/90 border border-white/10">
                                      {server.loader}
                                    </span>
                                    <span className="px-2 py-0.5 bg-white/10 backdrop-blur-sm rounded text-[10px] font-medium text-white/90 border border-white/10">
                                      {server.version}
                                    </span>
                                  </div>

                                  {/* Stats */}
                                  <div className="flex items-center gap-3 text-[10px] text-white/60 font-medium">
                                    <div className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      <span>{server.max_players}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <HardDrive className="w-3 h-3" />
                                      <span>{server.ram_mb}MB</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Server className="w-3 h-3" />
                                      <span>{server.port}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Hover Overlay */}
                              <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20" />
                            </div>
                          </motion.div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full server management panel
  return (
    <div className="h-full flex flex-col bg-black overflow-hidden relative">
      {/* Background Container */}
      <div 
        className="absolute inset-0 z-0 opacity-5"
        style={{
          backgroundImage: 'url("/servers.svg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
      {/* Top Bar */}
      <div className="px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log("[ServerHosting] Back button clicked, clearing selection");
                setUserClickedBack(true);
                setSelectedServer(null);
              }}
              className="text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Servers
            </Button>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold text-white">{selectedServer.name}</h2>
                <p className="text-xs text-zinc-400">
                  {selectedServer.loader} {selectedServer.version}
                </p>
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            {isStarting === selectedServer.id || isStartingRef.current === selectedServer.id ? (
              <button 
                disabled
                className="cursor-not-allowed text-nowrap inline-flex py-1 px-2.5 justify-center items-center gap-[3px] rounded-[1000px] bg-zinc-600 relative h-8 min-w-[100px]"
              >
                <Loader2 className="w-4 h-4 text-white animate-spin absolute left-2.5" />
                <p className="text-white text-[15px] leading-5 absolute left-[27px] tracking-[-0.0153em]">
                  Starting...
                </p>
              </button>
            ) : selectedServer.is_online ? (
              <button 
                onClick={() => stopServer(selectedServer.id)}
                className="cursor-pointer text-nowrap inline-flex py-1 px-2.5 justify-center items-center gap-[3px] rounded-[1000px] bg-red-500 hover:bg-red-600 transition-colors relative h-8 min-w-[100px]"
              >
                <Square className="w-4 h-4 text-white absolute left-2.5 fill-current" />
                <p className="text-white text-[15px] leading-5 absolute left-[44px] tracking-[-0.0153em]">
                  Stop
                </p>
              </button>
            ) : (
              <button 
                onClick={() => startServer(selectedServer.id)}
                className="cursor-pointer text-nowrap inline-flex py-1 px-2.5 justify-center items-center gap-[3px] rounded-[1000px] bg-[#08F] hover:bg-[#07D] transition-colors relative h-8 min-w-[100px]"
              >
                <Play className="w-4 h-4 text-white absolute left-2.5 fill-current" />
                <p className="text-white text-[15px] leading-5 absolute left-[44px] tracking-[-0.0153em]">
                  Play
                </p>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedServer.is_online && !selectedServer.is_public && (
              <ParticleButton
                variant="default"
                size="sm"
                onClick={() => startTunnel(selectedServer.id)}
                disabled={isStartingTunnel}
                successDuration={1500}
              >
                {isStartingTunnel ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting Up...
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4 mr-2" />
                    Make Public
                  </>
                )}
              </ParticleButton>
            )}
            {selectedServer.is_online && selectedServer.is_public && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => stopTunnel(selectedServer.id)}
              >
                <Lock className="w-4 h-4 mr-2" />
                Make Private
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Console Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-6 flex-shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2 h-12">
                <TabButton
                  icon={<Terminal className="w-4 h-4" />}
                  label="Console"
                  isActive={activeTab === "console"}
                  onClick={() => setActiveTab("console")}
                />
                <TabButton
                  icon={<FolderOpen className="w-4 h-4" />}
                  label="Files"
                  isActive={activeTab === "files"}
                  onClick={() => setActiveTab("files")}
                />
                <TabButton
                  icon={<Users className="w-4 h-4" />}
                  label="Players"
                  isActive={activeTab === "players"}
                  onClick={() => setActiveTab("players")}
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={refreshLogs}
                disabled={isRefreshingLogs}
                className="text-zinc-400 hover:text-white"
              >
                {isRefreshingLogs ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
              </Button>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeTab === "console" && (
                <div className="flex-1 flex flex-col min-h-0 p-6 space-y-4 overflow-hidden">
                  <div className="flex-1 bg-black overflow-hidden flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="font-mono text-sm space-y-0.5">
                      {consoleLogs.length === 0 ? (
                        <div className="space-y-1">
                          <p className="text-zinc-600">[Dragon Panel]: Server console</p>
                          <p className="text-zinc-600">[Dragon Panel]: Start the server to see output</p>
                          <p className="text-zinc-600">[Dragon Panel]: Type commands below to execute</p>
                        </div>
                      ) : (
                        <>
                          {consoleLogs.map((log, i) => (
                            <div
                              key={`${i}-${lastLogUpdate}`}
                              className={`leading-relaxed ${
                                log.includes("═══════") ? "font-bold" :
                                log.includes("[Dragon Panel]: ✓") ? "font-bold" :
                                log.includes("[Dragon Panel]: ✗") ? "font-bold" :
                                log.includes("[Dragon Panel]") ? "" :
                                log.includes("[INFO]") || log.includes("INFO") ? "" :
                                log.includes("[WARN]") || log.includes("WARN") ? "" :
                                log.includes("[ERROR]") || log.includes("ERROR") ? "" :
                                log.includes("Done") || log.includes("online") || log.includes("successfully") ? "" :
                                log.startsWith(">") ? "" :
                                ""
                              }`}
                              style={{
                                color: 
                                  log.includes("═══════") ? "#385944" :
                                  log.includes("[Dragon Panel]: ✓") ? "#385944" :
                                  log.includes("[Dragon Panel]: ✗") ? "#961B2B" :
                                  log.includes("[Dragon Panel]") ? "#F2F2F2" :
                                  log.includes("[INFO]") || log.includes("INFO") ? "#F2F2F2" :
                                  log.includes("[WARN]") || log.includes("WARN") ? "#F2F2F2" :
                                  log.includes("[ERROR]") || log.includes("ERROR") ? "#961B2B" :
                                  log.includes("Done") || log.includes("online") || log.includes("successfully") ? "#385944" :
                                  log.startsWith(">") ? "#F2F2F2" :
                                  "#F2F2F2"
                              }}
                            >
                              {log}
                            </div>
                          ))}
                          <div ref={consoleEndRef} />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full">
                  <AIInput
                    placeholder={selectedServer.is_online ? "Type a command..." : "Server is offline"}
                    disabled={!selectedServer.is_online}
                    onSubmit={(value) => {
                      if (value.trim() && selectedServer.is_online) {
                        setConsoleLogs((prev) => [...prev, `> ${value}`]);
                        // TODO: Send command to server
                      }
                    }}
                    className="py-2 bg-black border-zinc-800"
                    minHeight={44}
                  />
                </div>
              </div>
            )}

            {activeTab === "files" && (
              <div className="flex-1 m-0 p-6 overflow-hidden">
                <div className="h-full flex flex-col space-y-4">
                {openFile ? (
                  // File Viewer
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setOpenFile(null);
                            setIsEditingFile(false);
                          }}
                          className="text-zinc-400 hover:text-white"
                        >
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Back to Files
                        </Button>
                        <div className="h-6 w-px bg-zinc-800" />
                        <h3 className="text-lg font-semibold text-white">{openFile.name}</h3>
                        {isEditingFile && (
                          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                            Editing
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditingFile ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setIsEditingFile(false);
                                setEditedContent(openFile.content);
                              }}
                            >
                              <X className="w-4 h-4 mr-2" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={saveServerFile}
                              disabled={isSavingFile}
                            >
                              {isSavingFile ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4 mr-2" />
                                  Save
                                </>
                              )}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(openFile.content);
                                toast({
                                  title: "Copied!",
                                  description: "File content copied to clipboard",
                                });
                              }}
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setIsEditingFile(true)}
                            >
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 bg-black overflow-hidden">
                      {isEditingFile ? (
                        <textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className="w-full h-full p-4 bg-transparent text-sm text-zinc-300 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                          spellCheck={false}
                        />
                      ) : (
                        <div className="p-4 overflow-y-auto h-full">
                          <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap break-words">
                            {openFile.content}
                          </pre>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  // File List
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Server Files</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openServerFolder(selectedServer)}
                      >
                        <FolderOpen className="w-4 h-4 mr-2" />
                        Open in Finder
                      </Button>
                    </div>

                    <div className="flex-1 bg-black p-4 overflow-y-auto">
                      <div className="space-y-2 font-mono text-sm">
                        <div className="text-zinc-400 mb-4 pb-4 border-b border-zinc-800">
                          <p className="text-xs font-semibold">Server Directory:</p>
                          <p className="text-xs text-zinc-500 mt-1 break-all">{selectedServer.server_dir}</p>
                        </div>

                        {isLoadingFile ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          </div>
                        ) : serverFiles.length === 0 ? (
                          <div className="text-center py-8 text-zinc-500">
                            <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>No files yet. Start the server to generate files.</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {serverFiles.map((file, index) => (
                              <div
                                key={index}
                                onClick={() => {
                                  if (file.is_directory) {
                                    openServerFolder(selectedServer);
                                  } else {
                                    openServerFile(file.name);
                                  }
                                }}
                                className="flex items-center justify-between p-2 hover:bg-zinc-800 rounded transition-colors cursor-pointer group"
                              >
                                <div className="flex items-center gap-2">
                                  {file.is_directory ? (
                                    <FolderOpen className="w-4 h-4 text-pink-400" />
                                  ) : (
                                    <Terminal className="w-4 h-4 text-zinc-400" />
                                  )}
                                  <span className="text-zinc-300 group-hover:text-white transition-colors">
                                    {file.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!file.is_directory && file.size > 0 && (
                                    <span className="text-xs text-zinc-500">
                                      {file.size < 1024
                                        ? `${file.size} B`
                                        : file.size < 1024 * 1024
                                          ? `${(file.size / 1024).toFixed(1)} KB`
                                          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                                    </span>
                                  )}
                                  {!file.is_directory && (
                                    <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-6 p-4 bg-pink-500/10 border border-pink-500/20 rounded">
                          <p className="text-pink-400 text-sm">
                            Click on any file to view it inside the app
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
              </div>
            )}

            {activeTab === "players" && (
              <div className="flex-1 m-0 p-6">
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <Users className="w-12 h-12 mx-auto text-zinc-600" />
                    <p className="text-zinc-400">Player management coming soon...</p>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Server Info */}
        {showSidebar && (
          <div className="w-80 bg-black p-6 space-y-4 overflow-y-auto flex-shrink-0">
            {/* Server Address */}
            <div className="relative bg-transparent border border-border border-dashed shadow-sm p-4 rounded-none overflow-visible">
              {/* Corner Plus Icons */}
              <div className="absolute -top-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -top-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              
              {/* Grid Background */}
              <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0" style={{
                  backgroundImage: `linear-gradient(to right, hsl(var(--muted)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--muted)) 1px, transparent 1px)`,
                  backgroundSize: "32px 32px",
                  WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                  maskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                }} />
              </div>
              
              <div className="relative z-10">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Server Address</h3>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Globe className="w-4 h-4 text-pink-400 flex-shrink-0" />
                    <code className="text-sm text-white truncate">
                      {selectedServer.ngrok_url || (publicIP && selectedServer.is_public ? `${publicIP}:${selectedServer.port}` : `localhost:${selectedServer.port}`)}
                    </code>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copyServerAddress(selectedServer)} className="flex-shrink-0">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* CPU */}
            <div className="relative bg-transparent border border-border border-dashed shadow-sm p-4 rounded-none overflow-visible">
              <div className="absolute -top-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -top-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0" style={{
                  backgroundImage: `linear-gradient(to right, hsl(var(--muted)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--muted)) 1px, transparent 1px)`,
                  backgroundSize: "32px 32px",
                  WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                  maskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                }} />
              </div>
              <div className="relative z-10">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">CPU</h3>
                <div className="flex items-center justify-between">
                  <Activity className="w-5 h-5 text-pink-400" />
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      {selectedServer.is_online && serverStats ? `${serverStats.cpu.toFixed(1)}%` : '--'}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {selectedServer.is_online ? 'Real-time monitoring' : 'Server offline'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Memory */}
            <div className="relative bg-transparent border border-border border-dashed shadow-sm p-4 rounded-none overflow-visible">
              <div className="absolute -top-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -top-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0" style={{
                  backgroundImage: `linear-gradient(to right, hsl(var(--muted)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--muted)) 1px, transparent 1px)`,
                  backgroundSize: "32px 32px",
                  WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                  maskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                }} />
              </div>
              <div className="relative z-10 space-y-2">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Memory</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Allocated</span>
                  <span className="text-white font-medium">{selectedServer.ram_mb} MB</span>
                </div>
                {selectedServer.is_online && serverStats && serverStats.memory > 0 ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Used</span>
                      <span className="text-white font-medium">{serverStats.memory} MB</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-pink-500 transition-all" 
                        style={{ width: `${Math.min((serverStats.memory / selectedServer.ram_mb) * 100, 100)}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-pink-500 w-0 transition-all" />
                  </div>
                )}
              </div>
            </div>

            {/* Storage */}
            <div className="relative bg-transparent border border-border border-dashed shadow-sm p-4 rounded-none overflow-visible">
              <div className="absolute -top-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -top-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0" style={{
                  backgroundImage: `linear-gradient(to right, hsl(var(--muted)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--muted)) 1px, transparent 1px)`,
                  backgroundSize: "32px 32px",
                  WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                  maskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                }} />
              </div>
              <div className="relative z-10">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Storage</h3>
                <div className="flex items-center justify-between">
                  <HardDrive className="w-5 h-5 text-purple-400" />
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      {serverStats ? `${serverStats.disk} MB` : '--'}
                    </div>
                    <div className="text-xs text-zinc-500">Disk usage</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Max Players */}
            <div className="relative bg-transparent border border-border border-dashed shadow-sm p-4 rounded-none overflow-visible">
              <div className="absolute -top-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -top-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0" style={{
                  backgroundImage: `linear-gradient(to right, hsl(var(--muted)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--muted)) 1px, transparent 1px)`,
                  backgroundSize: "32px 32px",
                  WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                  maskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                }} />
              </div>
              <div className="relative z-10">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Max Players</h3>
                <div className="flex items-center justify-between">
                  <Users className="w-5 h-5 text-zinc-400" />
                  <div className="text-2xl font-bold text-white">{selectedServer.max_players}</div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="relative bg-transparent border border-border border-dashed shadow-sm p-4 rounded-none overflow-visible">
              <div className="absolute -top-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -top-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute -bottom-2 -right-2 w-4 h-4 z-20 pointer-events-none">
                <svg className="w-full h-full text-zinc-400 opacity-80" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd"><g fill="currentColor"><path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/></g></g>
                </svg>
              </div>
              <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0" style={{
                  backgroundImage: `linear-gradient(to right, hsl(var(--muted)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--muted)) 1px, transparent 1px)`,
                  backgroundSize: "32px 32px",
                  WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                  maskImage: "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                }} />
              </div>
              <div className="relative z-10 space-y-2">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Quick Actions</h3>
                <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => copyServerAddress(selectedServer)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Address
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => openServerFolder(selectedServer)}>
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Open Folder
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => {
                    setActiveTab("files");
                    openServerFile("server.properties");
                  }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Server Settings
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* EULA Dialog */}
      <EulaDialog
        isOpen={showEulaDialog}
        onClose={() => {
          setShowEulaDialog(false);
          setEulaServerId(null);
          setEulaServerName("");
        }}
        onAccept={acceptEula}
        serverName={eulaServerName}
      />

      {/* Server Notification */}
      <ServerNotification
        show={showNotification}
        title={notificationData.title}
        message={notificationData.message}
        type={notificationData.type}
        onClose={() => setShowNotification(false)}
      />
    </div>
  );
}
