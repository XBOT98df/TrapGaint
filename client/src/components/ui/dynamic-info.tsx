"use client";

/**
 * DynamicInfo (TrapGaint)
 * ----------------------
 * A capsule-shaped personal-info chip that sits flush against the top
 * of the header navigation panel.
 *
 * The "border + dynamic connection" silhouette is taken from the Framer
 * module at:
 *   https://framer.com/m/Dynamic-Info-JmvR.js@WKgPoJPIgbHfueQ8bTZQ
 *
 * How the connection works (matching the Framer source):
 *   - The body is a capsule with square top corners and 20px rounded
 *     bottom corners.
 *   - Two 24px stubs sit at the top of the body, one on each side.
 *     Each stub is white-filled, with a 12px rounded top corner and
 *     square bottom corners. The square bottom sits flush against
 *     the body's top edge, creating a seamless "connected" shape.
 *   - On expand, the stubs grow to 48px and their top-corner radius
 *     grows to 32px (matching the Framer's rivrDZ8U8 variant).
 *   - Together, the body and stubs form one continuous white shape
 *     that reads as a single border + dynamic element.
 */

import * as React from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";

// ---------------------------------------------------------------------------
// Live clock.
// ---------------------------------------------------------------------------
function useClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTime(date: Date) {
  let hours = date.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes} ${ampm}`;
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDateLine(date: Date) {
  return `${WEEKDAYS_SHORT[date.getDay()]} ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

// ---------------------------------------------------------------------------
// Status dot.
// ---------------------------------------------------------------------------
export type InfoStatus = "online" | "away" | "busy" | "offline";

const STATUS_STYLES: Record<
  InfoStatus,
  { dot: string; label: string }
> = {
  online: {
    dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]",
    label: "Online",
  },
  away: {
    dot: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]",
    label: "Away",
  },
  busy: {
    dot: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]",
    label: "Busy",
  },
  offline: {
    dot: "bg-zinc-400",
    label: "Offline",
  },
};

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = trimmed[0] ?? "";
  const second = trimmed.includes(" ")
    ? trimmed.split(" ")[1]?.[0] ?? ""
    : "";
  return (first + second).toUpperCase();
}

// ---------------------------------------------------------------------------
// Minecraft head URL builder.
// mc-heads.net renders a real-time 3D head of any player by username or
// UUID. The head is recomputed every time the prop changes so the avatar
// stays in sync with the active account (including skin swaps).
// ---------------------------------------------------------------------------
function mcHeadUrl(name: string, size = 64): string {
  return `https://mc-heads.net/head/${encodeURIComponent(name)}/${size}`;
}

// ---------------------------------------------------------------------------
// Spring matching the Framer original (bounce 0.4, duration 0.8).
// ---------------------------------------------------------------------------
const spring: Transition = {
  type: "spring",
  bounce: 0.4,
  duration: 0.8,
};

const STUB_CLOSED = 24;
const STUB_OPEN = 48;

// ---------------------------------------------------------------------------
// Public DynamicInfo component.
// ---------------------------------------------------------------------------
export interface DynamicInfoProps {
  /** Avatar image URL. */
  image?: string;
  /** Person's username. */
  name: string;
  /** Secondary label — role / tier / status text. */
  info?: string;
  /** Status indicator colour. */
  status?: InfoStatus;
  /** Optional click handler; toggles the menu unless it returns false. */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => boolean | void;
  /** Extra className for the outer wrapper. */
  className?: string;
}

const DynamicInfo = React.forwardRef<HTMLDivElement, DynamicInfoProps>(
  function DynamicInfo(
    { image, name, info, status = "online", onClick, className },
    ref,
  ) {
    const [open, setOpen] = React.useState(false);
    // Bumped whenever the skin changes (via the `accountUpdated` window
    // event) so the <img> re-mounts and the mc-heads.net URL gets a
    // fresh cache-busting query — the head updates in real time when
    // the user picks a new skin on the skin page.
    const [skinRevision, setSkinRevision] = React.useState(0);
    const now = useClock();
    const statusStyle = STATUS_STYLES[status];

    React.useEffect(() => {
      const handleAccountUpdated = () => setSkinRevision((r) => r + 1);
      window.addEventListener("accountUpdated", handleAccountUpdated);
      // Also re-bump on localStorage changes to the active account
      // (older flows that don't dispatch the event).
      const handleStorage = (e: StorageEvent) => {
        if (e.key === "dragon_current_account") {
          setSkinRevision((r) => r + 1);
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => {
        window.removeEventListener("accountUpdated", handleAccountUpdated);
        window.removeEventListener("storage", handleStorage);
      };
    }, []);

    const headUrl = React.useMemo(() => {
      // Prefer the supplied image (e.g. a custom uploaded skin URL).
      // Otherwise build a real-time mc-heads.net URL with a cache-busting
      // revision so a skin swap always shows the new head immediately.
      const base = image || mcHeadUrl(name, 64);
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}v=${skinRevision}`;
    }, [image, name, skinRevision]);

    const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
      if (onClick) {
        const result = onClick(event);
        if (result === false) return;
      }
      setOpen((prev) => !prev);
    };

    const handleMouseLeave = () => {
      if (open) setOpen(false);
    };

    return (
      <motion.div
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
        onMouseLeave={handleMouseLeave}
        initial={false}
        animate={open ? "open" : "closed"}
        variants={{
          closed: { height: 50 },
          open: { height: 92 },
        }}
        transition={spring}
        className={[
          // Capsule body — top corners square, bottom corners rounded.
          // This is the "border" of the connected design.
          "relative inline-flex flex-col items-stretch select-none",
          "rounded-b-[20px] rounded-t-none",
          // White surface with a slow animated hue shift — the "dynamic" part.
          "bg-white text-zinc-900",
          "cursor-pointer outline-none",
          "focus-visible:ring-2 focus-visible:ring-zinc-900/30",
          className ?? "",
        ].join(" ")}
        style={{ minWidth: 234, top: 0 }}
        title={`${name} • ${statusStyle.label}`}
      >
        {/* ── Animated white background ───────────────────────────────
            Sits behind the body content. A slow, infinite hue-shifting
            gradient keeps the surface feeling alive without being noisy. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-b-[20px] rounded-t-none"
          style={{
            background:
              "linear-gradient(110deg, #ffffff 0%, #f4f4f5 25%, #ffffff 50%, #fafafa 75%, #ffffff 100%)",
            backgroundSize: "300% 100%",
            animation: "dynamicInfoShift 18s ease-in-out infinite",
          }}
        />

        {/* ── Left stub ───────────────────────────────────────────────
            24px white square positioned above the body (top: -24px).
            Rounded top-left corner (12px → 32px on expand).
            Square bottom corners so it connects flush to the body's
            top edge — creating the seamless "connected" silhouette. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute z-0"
          style={{
            top: -STUB_CLOSED,
            left: -STUB_CLOSED,
            width: STUB_CLOSED,
            height: STUB_CLOSED,
            background: "#ffffff",
            borderTopLeftRadius: 12,
            borderTopRightRadius: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          }}
          initial={false}
          animate={
            open
              ? {
                  top: -STUB_OPEN,
                  left: -STUB_OPEN,
                  width: STUB_OPEN,
                  height: STUB_OPEN,
                  borderTopLeftRadius: 32,
                }
              : {
                  top: -STUB_CLOSED,
                  left: -STUB_CLOSED,
                  width: STUB_CLOSED,
                  height: STUB_CLOSED,
                  borderTopLeftRadius: 12,
                }
          }
          transition={spring}
        />

        {/* ── Right stub ──────────────────────────────────────────────
            Mirror of the left stub on the right side. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute z-0"
          style={{
            top: -STUB_CLOSED,
            right: -STUB_CLOSED,
            width: STUB_CLOSED,
            height: STUB_CLOSED,
            background: "#ffffff",
            borderTopRightRadius: 12,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          }}
          initial={false}
          animate={
            open
              ? {
                  top: -STUB_OPEN,
                  right: -STUB_OPEN,
                  width: STUB_OPEN,
                  height: STUB_OPEN,
                  borderTopRightRadius: 32,
                }
              : {
                  top: -STUB_CLOSED,
                  right: -STUB_CLOSED,
                  width: STUB_CLOSED,
                  height: STUB_CLOSED,
                  borderTopRightRadius: 12,
                }
          }
          transition={spring}
        />

        {/* ── Top row: Minecraft head + name/role | clock ────────────── */}
        <div
          className="relative z-10 flex items-center justify-between gap-4 px-3 py-2"
          style={{ minHeight: 50 }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative flex-none">
              {/* Real-time Minecraft player head from mc-heads.net.
                  Re-keyed on skinRevision so a skin swap on the skin
                  page re-mounts the image and the cache-busted URL
                  fetches the new head instantly. */}
              <img
                key={`${name}-${skinRevision}`}
                src={headUrl}
                alt={`${name}'s Minecraft head`}
                className="h-[34px] w-[34px] object-contain drop-shadow-sm"
                loading="eager"
                referrerPolicy="no-referrer"
              />
              <span
                className={[
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                  statusStyle.dot,
                ].join(" ")}
                aria-label={statusStyle.label}
              />
            </div>
            <div className="flex min-w-0 flex-col items-start leading-tight">
              <span className="truncate text-[14px] font-medium tracking-[-0.04em] text-zinc-900">
                {name}
              </span>
              {info && (
                <span className="truncate text-[14px] font-medium tracking-[-0.04em] text-zinc-500">
                  {info}
                </span>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-end leading-tight tabular-nums">
            <span className="text-[14px] font-medium tracking-[-0.04em] text-zinc-900">
              {formatTime(now)}
            </span>
            <span className="text-[10px] font-medium tracking-[-0.04em] text-zinc-500">
              {formatDateLine(now)}
            </span>
          </div>
        </div>

        {/* ── Bottom row (expanded only) ────────────────────────────── */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="bottom"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative z-10 flex items-center justify-between gap-3 px-3 pb-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
                    "text-[10px] font-medium uppercase tracking-[0.12em]",
                    status === "online"
                      ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30"
                      : status === "away"
                        ? "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30"
                        : status === "busy"
                          ? "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30"
                          : "bg-zinc-500/15 text-zinc-700 ring-1 ring-zinc-500/30",
                  ].join(" ")}
                >
                  <span
                    className={["h-1.5 w-1.5 rounded-full", statusStyle.dot].join(
                      " ",
                    )}
                  />
                  {statusStyle.label}
                </span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                TrapGaint
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  },
);

export default DynamicInfo;
