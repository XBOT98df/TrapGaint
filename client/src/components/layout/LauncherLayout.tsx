import { ReactNode, useState } from "react";
import { Play, Gamepad2, BarChart3, User, Settings, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Logo } from "@/components/ui/logo";
import { useOnlineCount } from "@/hooks/useOnlineCount";

interface LauncherLayoutProps {
  children: ReactNode;
  activeTab: "home" | "versions" | "stats" | "profile";
  onTabChange: (tab: "home" | "versions" | "stats" | "profile") => void;
}

export function LauncherLayout({ children, activeTab, onTabChange }: LauncherLayoutProps) {
  const { onlineCount, loading } = useOnlineCount();
  
  const tabs = [
    { id: "home" as const, icon: Play, label: "Play" },
    { id: "versions" as const, icon: Gamepad2, label: "Versions" },
    { id: "stats" as const, icon: BarChart3, label: "Stats" },
    { id: "profile" as const, icon: User, label: "Profile" },
  ];

  return (
    <div className="flex h-screen bg-zinc-950">
      {/* Sidebar */}
      <div className="w-20 bg-zinc-900/50 border-r border-zinc-800 flex flex-col items-center py-6">
        {/* Logo */}
        <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center mb-4 border border-zinc-700/50">
          <Logo size="sm" showText={false} />
        </div>

        {/* Online Counter */}
        <div className="flex flex-col items-center mb-6 px-2">
          <div className="flex items-center gap-1.5 bg-zinc-800/80 rounded-lg px-2.5 py-1.5 border border-zinc-700/50">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-zinc-300">
              {loading ? "..." : onlineCount.toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 mt-1">online</span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col items-center gap-2 flex-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                activeTab === tab.id
                  ? "bg-pink-500 text-white shadow-lg shadow-pink-500/30"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <tab.icon className="w-6 h-6" />
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-pink-500 rounded-2xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </nav>

        {/* Settings */}
        <button className="w-14 h-14 rounded-2xl flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all">
          <Settings className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
