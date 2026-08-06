"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Trash2,
  Star,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  type FantasyApp,
  type FantasyAccount,
  MAX_ACCOUNTS_PER_APP,
  listAccountsForApp,
  addFantasyAccount,
  removeFantasyAccount,
  setDefaultAccount,
  countAccountsForApp,
  canAddMoreAccounts,
} from "@/lib/multi-accounts";
import { invalidateAccountCache } from "@/lib/account-session";
import { canMultiAccountDream11, canMultiAccountMy11Circle } from "@/lib/subscription";

interface MultiAccountManagerProps {
  open: boolean;
  onClose: () => void;
  app: FantasyApp;
  /** License tier for gating — only Pro/Elite/Lifetime can add multiple accounts */
  licenseTier?: string | null;
  onAccountAdded?: (account: FantasyAccount) => void;
  onAccountRemoved?: (id: string) => void;
}

const APP_INFO: Record<FantasyApp, { name: string; color: string; bgColor: string }> = {
  dream11: { name: "Dream11", color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-950/30" },
  my11circle: { name: "My11Circle", color: "text-sky-600", bgColor: "bg-sky-50 dark:bg-sky-950/30" },
  jumbo: { name: "Jumbo", color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950/30" },
  myteam11: { name: "MyTeam11", color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950/30" },
  vision11: { name: "Vision11", color: "text-emerald-600", bgColor: "bg-emerald-50 dark:bg-emerald-950/30" },
};

export function MultiAccountManager({
  open,
  onClose,
  app,
  licenseTier,
  onAccountAdded,
  onAccountRemoved,
}: MultiAccountManagerProps) {
  const [accounts, setAccounts] = useState<FantasyAccount[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (open) {
      setAccounts(listAccountsForApp(app));
    }
  }, [open, app, refreshKey]);

  const info = APP_INFO[app];
  const count = accounts.length;
  const canAddMore = count < MAX_ACCOUNTS_PER_APP;

  // Tier gating: only Pro (monthly), Elite, Lifetime can add multiple accounts
  const canMultiAccount = app === "dream11"
    ? canMultiAccountDream11(licenseTier)
    : app === "my11circle"
    ? canMultiAccountMy11Circle(licenseTier)
    : false;

  // If user can't multi-account, they can only have 1 account
  // (the first account is always allowed — it's the "single account" mode)
  const canAddAnother = canAddMore && (canMultiAccount || count === 0);

  function handleRemove(id: string) {
    if (!confirm("Remove this account? Teams saved with this account will remain.")) return;
    removeFantasyAccount(id);
    // Invalidate any cached data for this account so we don't serve stale
    // data belonging to a now-removed account.
    invalidateAccountCache(id);
    onAccountRemoved?.(id);
    setRefreshKey(k => k + 1);
    toast.success("Account removed");
  }

  function handleSetDefault(id: string) {
    setDefaultAccount(id);
    setRefreshKey(k => k + 1);
    toast.success("Default account updated");
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-amber-900 via-yellow-800 to-amber-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black">{info.name} Accounts</h2>
                  <p className="text-[10px] text-white/80">
                    {count}/{MAX_ACCOUNTS_PER_APP} accounts linked
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Info banner */}
              <div className={`rounded-xl p-3 ${info.bgColor} border border-amber-200 dark:border-amber-800`}>
                <p className="text-[11px] font-bold text-foreground">
                  Multi-Account Support
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Link up to {MAX_ACCOUNTS_PER_APP} {info.name} accounts. Transfer teams to any or all accounts simultaneously.
                  Default account is used for single transfers.
                </p>
              </div>

              {/* Accounts list */}
              {accounts.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-bold text-muted-foreground">No accounts linked</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Click "Add Account" to link your first {info.name} account
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((account, idx) => (
                    <div
                      key={account.id}
                      className={`rounded-xl p-3 border-2 ${
                        account.isDefault
                          ? "border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${info.color} ${info.bgColor}`}>
                            #{idx + 1}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">{account.label}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {account.mobile ? `📱 ${account.mobile}` : "No mobile"}
                              {account.subscriptionTier && ` · ${account.subscriptionTier}`}
                            </p>
                          </div>
                        </div>
                        {account.isDefault && (
                          <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-current" /> DEFAULT
                          </span>
                        )}
                      </div>

                      {/* Token status */}
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
                        {account.token ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>Token active</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span>No token — re-link required</span>
                          </>
                        )}
                        <span className="ml-auto">
                          Linked: {new Date(account.linkedAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1">
                        {!account.isDefault && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] flex-1"
                            onClick={() => handleSetDefault(account.id)}
                          >
                            <Star className="w-3 h-3 mr-1" />
                            Set Default
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleRemove(account.id)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add account button */}
              <Button
                className="w-full h-11 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-bold"
                disabled={!canAddAnother}
                onClick={() => {
                  if (!canMultiAccount && count >= 1) {
                    toast.error(`Multi-account requires Pro (₹299), Elite (₹999), or Lifetime subscription.`);
                    return;
                  }
                  onClose();
                  // Trigger the OTP login flow via callback
                  onAccountAdded?.({
                    id: "_new_",
                    app,
                    label: `New ${info.name} Account`,
                    token: "",
                    linkedAt: Date.now(),
                    lastRefreshed: Date.now(),
                    isDefault: false,
                  });
                }}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                {!canMultiAccount && count >= 1
                  ? `🔒 Multi-Account needs Pro/Elite/Lifetime`
                  : canAddAnother
                  ? `Add ${info.name} Account (${count}/${MAX_ACCOUNTS_PER_APP})`
                  : `Max ${MAX_ACCOUNTS_PER_APP} accounts reached`}
              </Button>

              {/* Tier info */}
              {!canMultiAccount && (
                <p className="text-[9px] text-center text-amber-600 dark:text-amber-400">
                  🔒 Your tier ({licenseTier || "trial"}) allows 1 account per platform.
                  Upgrade to <strong>Pro (₹299)</strong>, <strong>Elite (₹999)</strong>, or
                  <strong> Lifetime</strong> to add up to 5 accounts.
                </p>
              )}

              <p className="text-[9px] text-center text-muted-foreground">
                💡 Each account can hold up to 20 teams per match. With {MAX_ACCOUNTS_PER_APP} accounts,
                you can field up to {MAX_ACCOUNTS_PER_APP * 20} teams total.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
