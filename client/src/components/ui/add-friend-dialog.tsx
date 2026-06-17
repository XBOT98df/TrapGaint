"use client";

import React, { useState } from "react";
import { Send, PlusIcon, UserPlus, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sendFriendRequest } from "@/lib/friendsService";

export function CreateCorners({ children }: { children: React.ReactNode }) {
  const positions = [
    "top-0 -left-3",
    "top-0 -right-3",
    "bottom-0 -left-3",
    "bottom-0 -right-3",
  ];

  return (
    <div className="absolute z-10 inset-0 pointer-events-none">
      {positions.map((pos, index) => (
        <section key={index} className={`absolute ${pos}`}>
          {children}
        </section>
      ))}
    </div>
  );
}

interface AddFriendDialogProps {
  trigger?: React.ReactNode;
  onAddFriend?: (username: string) => void;
  triggerSize?: "default" | "sm";
}

export const AddFriendDialog = ({ trigger, onAddFriend, triggerSize = "default" }: AddFriendDialogProps) => {
  const [pending, setPending] = useState(false);
  const [username, setUsername] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'not_found'>('idle');
  const [statusMessage, setStatusMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username.trim() || pending) return;

    setPending(true);
    setStatus('idle');
    setStatusMessage("");

    try {
      const currentOderId = localStorage.getItem('lapetus_oder_id');
      const currentUsername = localStorage.getItem('lapetus_username');
      
      console.log('[Add Friend] Current user:', currentUsername, '(', currentOderId, ')');
      console.log('[Add Friend] Sending request to:', username.trim());
      
      if (!currentOderId || !currentUsername) {
        setStatus('error');
        setStatusMessage("You must be logged in to send friend requests");
        setPending(false);
        return;
      }

      // Send friend request using Supabase (supports username or oder_id)
      await sendFriendRequest(currentOderId, username.trim());
      console.log('[Add Friend] Request sent successfully');
      setStatus('success');
      setStatusMessage(`Friend request sent to ${username}!`);
      onAddFriend?.(username);
    
      // Close dialog after success
      setTimeout(() => {
        setUsername("");
        setStatus('idle');
        setOpen(false);
      }, 1500);
    } catch (error: any) {
      console.error('[Add Friend] Error sending friend request:', error);
      setStatus('error');
      setStatusMessage(error.message || "Failed to send friend request");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          triggerSize === "sm" ? (
            <Button 
              size="sm"
              className="bg-pink-500 hover:bg-pink-600 text-white rounded-lg h-8 px-3 text-xs"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Add Friend
            </Button>
          ) : (
            <Button className="bg-pink-500 hover:bg-pink-600 text-white rounded-xl h-11 px-5">
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Friend
            </Button>
          )
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl bg-black border-zinc-800 p-0 overflow-hidden">
        <div className="relative w-full bg-transparent border border-zinc-800 border-dashed shadow-sm p-6 sm:p-10 transition-all rounded-none">
          <CreateCorners>
            <PlusIcon className="font-[200] text-pink-400" />
          </CreateCorners>

          {/* Diagonal Fade Grid Background */}
          <div className="min-h-full z-0 w-full bg-transparent absolute top-0 left-0 pointer-events-none">
            <div
              className="absolute inset-0 z-0"
              style={{
                backgroundImage: `linear-gradient(to right, rgba(39, 39, 42, 0.5) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(39, 39, 42, 0.5) 1px, transparent 1px)`,
                backgroundSize: "32px 32px",
                WebkitMaskImage:
                  "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
                maskImage:
                  "radial-gradient(ellipse 80% 80% at 0% 0%, #000 50%, transparent 90%)",
              }}
            />
          </div>

          <div className="backdrop-blur-xs p-2 rounded-xs relative z-10">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-primary mb-1 flex border-b border-b-pink-400 pb-2 items-center gap-2">
                <div className="size-1.5 bg-pink-400 rounded-full animate-pulse" />
                <span className="text-pink-400">Friends</span>
              </h2>
              <h1 className="text-xl font-semibold text-white tracking-tight" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                <span className="text-pink-400">Add </span>New Friend
              </h1>
              <p className="text-zinc-500 text-xs mt-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Enter their Minecraft username to send a friend request
              </p>
            </div>

            {/* Input & Button */}
            <form onSubmit={handleSubmit} className="flex sm:flex-row items-stretch gap-2">
              <div className="relative flex-1 group">
                {/* Corner styling on focus */}
                <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t-2 border-l-2 border-pink-500 opacity-0 group-focus-within:opacity-100 transition-all z-10" />
                <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b-2 border-r-2 border-pink-500 opacity-0 group-focus-within:opacity-100 transition-all z-10" />

                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-pink-400 transition-colors z-10">
                  <UserPlus size={14} />
                </div>

                <input
                  type="text"
                  autoComplete="off"
                  placeholder="ENTER USERNAME >>"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={pending}
                  className={cn(
                    "w-full bg-zinc-900/50 border border-zinc-700 rounded-none h-10",
                    "font-mono text-[0.75rem] p-3 pl-10 outline-none transition-all",
                    "placeholder:text-zinc-600 text-white",
                    "focus:bg-pink-500/5 focus:ring-1 focus:ring-pink-500/20 focus:border-pink-500 border-dashed",
                    pending && "opacity-50 cursor-not-allowed"
                  )}
                />
              </div>

              <button
                type="submit"
                disabled={pending || !username.trim()}
                className={cn(
                  "px-8 h-full border bg-zinc-900/50 font-bold uppercase text-[0.6rem] tracking-[0.2em] min-h-10 border-dashed border-zinc-700 transition-all flex items-center justify-center gap-2 rounded-none text-zinc-400",
                  !pending && username.trim() && "hover:border-pink-500 hover:text-pink-400 hover:bg-pink-500/5 active:scale-95",
                  (pending || !username.trim()) && "opacity-40 cursor-not-allowed"
                )}
              >
                <Send size={12} className={cn(pending && "animate-bounce")} />
                <span>{pending ? "SENDING..." : "SEND"}</span>
              </button>
            </form>

            {/* Status Message */}
            {status !== 'idle' && (
              <div className={cn(
                "mt-4 flex items-center gap-2 text-xs p-2 rounded border border-dashed",
                status === 'success' && "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
                status === 'error' && "text-red-400 bg-red-500/10 border-red-500/30",
                status === 'not_found' && "text-amber-400 bg-amber-500/10 border-amber-500/30"
              )} style={{ fontFamily: "'Outfit', sans-serif" }}>
                {status === 'success' && <CheckCircle className="w-4 h-4" />}
                {(status === 'error' || status === 'not_found') && <AlertCircle className="w-4 h-4" />}
                {statusMessage}
              </div>
            )}
          </div>

          {/* Status Line */}
          <div className="mt-6 flex items-center justify-between relative z-10">
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddFriendDialog;
