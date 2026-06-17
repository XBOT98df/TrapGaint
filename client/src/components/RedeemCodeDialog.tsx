import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Gift, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { redeemCode, getTierByName, applyTierTheme, saveTierToStorage, type TierName } from "@/lib/membership";
import { motion, AnimatePresence } from "framer-motion";

interface RedeemCodeDialogProps {
  oderId: string;
  onTierUpdated?: (tier: TierName) => void;
}

export function RedeemCodeDialog({ oderId, onTierUpdated }: RedeemCodeDialogProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; tier?: TierName } | null>(null);

  const handleRedeem = async () => {
    if (!code.trim()) {
      setResult({ success: false, message: "Please enter a code" });
      return;
    }

    setIsRedeeming(true);
    setResult(null);

    const response = await redeemCode(code.trim().toUpperCase(), oderId);

    if (response.success && response.tier) {
      const tier = getTierByName(response.tier);
      
      // Build success message
      let message = `Successfully redeemed ${tier.displayName}!`;
      if (response.isTrial && response.expiresAt) {
        const hoursLeft = Math.ceil((response.expiresAt - Date.now()) / (1000 * 60 * 60));
        message = `${tier.displayName} activated! (${hoursLeft}h trial)`;
      }
      
      setResult({
        success: true,
        message,
        tier: response.tier
      });

      // Apply theme and save tier with trial info
      applyTierTheme(tier);
      saveTierToStorage(response.tier, oderId, response.isTrial || false, response.expiresAt);

      // Notify parent
      if (onTierUpdated) {
        onTierUpdated(response.tier);
      }

      // Close dialog after 2 seconds
      setTimeout(() => {
        setOpen(false);
        setCode("");
        setResult(null);
      }, 2000);
    } else {
      setResult({
        success: false,
        message: response.error || "Failed to redeem code"
      });
    }

    setIsRedeeming(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          <Gift className="w-4 h-4" />
          Redeem Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-black border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Redeem Rank Code
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm text-zinc-400" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Enter your code
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              className="bg-zinc-800 border-zinc-700 text-white uppercase tracking-wider font-mono"
              disabled={isRedeeming}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isRedeeming) {
                  handleRedeem();
                }
              }}
            />
          </div>

          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex items-center gap-2 p-3 rounded-lg ${
                  result.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-red-500/10 border border-red-500/20'
                }`}
              >
                {result.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                )}
                <p
                  className={`text-sm ${result.success ? 'text-emerald-400' : 'text-red-400'}`}
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  {result.message}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            onClick={handleRedeem}
            disabled={isRedeeming || !code.trim()}
            className="w-full"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            {isRedeeming ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redeeming...
              </>
            ) : (
              <>
                <Gift className="w-4 h-4 mr-2" />
                Redeem Code
              </>
            )}
          </Button>

          <div className="pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Codes are one-time use only. Enter your unique rank code to unlock premium tiers.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
