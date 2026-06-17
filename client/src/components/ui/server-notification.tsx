import { motion, AnimatePresence } from "framer-motion";
import { Server, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface ServerNotificationProps {
  show: boolean;
  title: string;
  message: string;
  type?: "info" | "success" | "error" | "loading";
  icon?: string;
  onClose?: () => void;
}

export function ServerNotification({ 
  show, 
  title, 
  message, 
  type = "info",
  icon,
  onClose 
}: ServerNotificationProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed top-4 right-4 z-50"
        >
          <div className="flex py-3 px-4 items-start gap-3 relative w-[360px] min-h-[70px]">
            {/* Background layers */}
            <div className="absolute w-full h-full">
              {/* Shadow layer */}
              <div className="absolute left-0 top-1 w-full h-full">
                <div className="rounded-[14px] bg-[rgba(0,0,0,0.12)] w-full h-full blur-[6px]" />
              </div>
              
              {/* Main background - frosted glass effect */}
              <div className="rounded-[14px] backdrop-blur-[40px] bg-[rgba(245,245,245,0.78)] w-full h-full absolute left-0 top-0 shadow-lg" />
            </div>

            {/* Content - shifted right and down */}
            <div className="relative z-10 flex flex-col w-full py-0.5 pl-3 pt-3">
              {/* Top row: Title and timestamp */}
              <div className="flex items-start justify-between w-full mb-1">
                <p className="font-bold text-[13px] leading-[18px] tracking-[-0.08px] text-[rgba(0,0,0,0.85)] flex-1 pr-2" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif" }}>
                  {title}
                </p>
                <p className="text-[#8E8E93] text-[11px] leading-[18px] shrink-0 pr-2" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif" }}>
                  now
                </p>
              </div>
              
              {/* Message */}
              <p className="text-[13px] leading-[18px] tracking-[-0.08px] text-[rgba(0,0,0,0.85)]" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif" }}>
                {message}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ServerNotification;
