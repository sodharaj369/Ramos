import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Shield,
  Save,
  CheckCircle,
  RefreshCw,
  History,
  Sliders,
  Server,
  Mail,
  Layers,
  ToggleLeft,
  Lock,
  RotateCcw,
  Info,
} from "lucide-react";
import {
  getAdminSettingsData,
  updateAdminSetting,
  getAdminSettingsHistoryData,
  checkIsAdmin,
  type AdminSettingsSection,
  type AdminSettingItem,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SemanticStatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const CATEGORY_TABS = [
  { id: "discovery", label: "Discovery", icon: Sliders },
  { id: "verification", label: "Verification", icon: Mail },
  { id: "providers", label: "Providers", icon: Server },
  { id: "jobs", label: "Jobs", icon: Layers },
  { id: "feature_flags", label: "Feature Flags", icon: ToggleLeft },
  { id: "secrets", label: "Secrets / Credentials", icon: Lock },
  { id: "audit", label: "Audit History", icon: History },
];

export function AdminSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<AdminSettingsSection[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("discovery");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [settingValues, setSettingValues] = useState<Record<string, any>>({});
  const [initialValues, setInitialValues] = useState<Record<string, any>>({});
  const [pendingHighImpactItem, setPendingHighImpactItem] = useState<AdminSettingItem | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const { isAdmin } = await checkIsAdmin();
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      const data = await getAdminSettingsData();
      setSections(data.sections);

      const inits: Record<string, any> = {};
      for (const section of data.sections) {
        for (const item of section.items) {
          if (!item.isSecret) {
            inits[item.key] = item.value;
          }
        }
      }
      setInitialValues(inits);
      setSettingValues(inits);

      const hist = await getAdminSettingsHistoryData();
      setHistory(hist.history ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load system configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
      </div>
    );
  }

  const handleValueChange = (key: string, val: any) => {
    setSettingValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleCancelEdit = (key: string) => {
    setSettingValues((prev) => ({ ...prev, [key]: initialValues[key] }));
  };

  const executeSave = async (item: AdminSettingItem) => {
    try {
      setSavingKey(item.key);
      const val = settingValues[item.key];
      await updateAdminSetting({ data: { key: item.key, value: val } });
      toast.success(`Updated ${item.name} successfully.`);
      setInitialValues((prev) => ({ ...prev, [item.key]: val }));
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save setting. Please try again.");
    } finally {
      setSavingKey(null);
      setPendingHighImpactItem(null);
    }
  };

  const handleSaveRequest = (item: AdminSettingItem) => {
    const val = settingValues[item.key];
    // Check if high impact boolean toggle being turned OFF
    if (
      typeof val === "boolean" &&
      val === false &&
      (item.key.startsWith("feature_flags.") || item.key === "verification.enabled")
    ) {
      setPendingHighImpactItem(item);
      return;
    }
    void executeSave(item);
  };

  const getItemsForTab = (tabId: string): { items: AdminSettingItem[]; title: string; description: string } => {
    const allItems = sections.flatMap((sec) => sec.items);

    switch (tabId) {
      case "discovery": {
        const keys = [
          "discovery.chrome_extension_enabled",
          "discovery.default_limit",
          "discovery.max_limit",
          "discovery.default_provider",
        ];
        return {
          items: allItems.filter((i) => !i.isSecret && keys.includes(i.key)),
          title: "Discovery Settings",
          description: "Google Maps lead extraction limits, provider defaults, and extension toggles.",
        };
      }
      case "verification": {
        const keys = [
          "verification.enabled",
          "verification.default_verifier",
          "verification.concurrency",
          "verification.timeout_ms",
        ];
        return {
          items: allItems.filter((i) => !i.isSecret && keys.includes(i.key)),
          title: "Email Verification Subsystem",
          description: "Master verifier toggle, default verifier selection, concurrency, and socket timeouts.",
        };
      }
      case "providers": {
        const keys = [
          "providers.self_hosted_gmaps_enabled",
          "providers.aftership_smtp_enabled",
          "providers.builtin_dns_enabled",
        ];
        return {
          items: allItems.filter((i) => !i.isSecret && keys.includes(i.key)),
          title: "Provider Integrations",
          description: "Enable or disable individual lead sources and verification service providers.",
        };
      }
      case "jobs": {
        const keys = [
          "discovery.job_timeout_ms",
          "discovery.retry_count",
          "import.batch_size",
        ];
        return {
          items: allItems.filter((i) => !i.isSecret && keys.includes(i.key)),
          title: "Jobs & Ingestion Controls",
          description: "Execution timeouts, max retries, and batch sizing controls for background jobs.",
        };
      }
      case "feature_flags": {
        const keys = [
          "feature_flags.csv_export_enabled",
          "feature_flags.bulk_verification_enabled",
        ];
        return {
          items: allItems.filter((i) => !i.isSecret && keys.includes(i.key)),
          title: "System Feature Flags",
          description: "Control global application capabilities and feature availability.",
        };
      }
      case "secrets": {
        return {
          items: allItems.filter((i) => i.isSecret),
          title: "Secrets & Credentials",
          description: "Server-side integration credentials and secret key status indicators. Credentials are stored securely on the server and cannot be viewed here.",
        };
      }
      default:
        return { items: [], title: "Configuration", description: "" };
    }
  };

  const currentTabContent = getItemsForTab(activeTab);

  const formatAuditValue = (val: any) => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "boolean") return val ? "ON" : "OFF";
    if (typeof val === "object") return JSON.stringify(val);
    if (val === "[MASKED]") return "Configured";
    return String(val);
  };

  return (
    <div className="space-y-6">
      {/* Admin Access Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <Shield className="size-5 text-primary shrink-0" />
          <div>
            <h2 className="font-display font-bold text-sm text-foreground">
              Administrator Access
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              You can modify runtime configuration. System limits, provider toggles, and runtime defaults. All changes are validated server-side and recorded in the audit trail.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={cn("size-3.5 mr-1.5", loading ? "animate-spin text-primary" : "")} /> Refresh
        </Button>
      </div>

      {/* Category Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {CATEGORY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const count = tab.id === "audit" ? history.length : getItemsForTab(tab.id).items.length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
              <span className={cn("rounded-full px-1.5 py-0.2 text-[10px] font-mono", isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* View 1: Audit Log Tab */}
      {activeTab === "audit" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
              <History className="size-4 text-primary" /> Configuration Audit Trail
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Immutable record of administrative configuration changes. Secret credentials are automatically masked.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/60 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-3.5 py-3">Timestamp</th>
                  <th className="px-3.5 py-3">Setting Key</th>
                  <th className="px-3.5 py-3">Old Value</th>
                  <th className="px-3.5 py-3">New Value</th>
                  <th className="px-3.5 py-3">Changed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No configuration history recorded yet.
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className="hover:bg-secondary/40 transition-colors">
                      <td className="px-3.5 py-2.5 font-mono text-muted-foreground text-[11px] whitespace-nowrap">
                        {new Date(h.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono font-medium text-foreground text-[11px]">
                        {h.settingKey}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-muted-foreground text-[11px]">
                        {formatAuditValue(h.oldValue)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-primary font-medium text-[11px]">
                        {formatAuditValue(h.newValue)}
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground font-medium whitespace-nowrap">
                        {h.changedByName || h.changedBy || "System"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "secrets" ? (
        /* View 2: Secrets & Credentials Tab */
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
              <Lock className="size-4 text-primary" /> {currentTabContent.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{currentTabContent.description}</p>
          </div>

          <div className="grid gap-4">
            {currentTabContent.items.map((item) => (
              <div
                key={item.key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-xs transition-colors hover:border-border/80"
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold text-sm text-foreground">{item.name}</span>
                    <code className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                      {item.key}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs font-medium text-muted-foreground">Credential:</span>
                    <code className="text-xs font-mono text-muted-foreground tracking-widest bg-secondary/70 px-2 py-0.5 rounded">
                      ••••••••••••••••
                    </code>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 italic flex items-center gap-1">
                    <Info className="size-3 shrink-0" /> Credential is securely configured as a server-side secret and cannot be viewed here.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.configured ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-success/12 text-success border border-success/30">
                      <CheckCircle className="size-3.5" /> Configured ✓
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-warning/15 text-warning-foreground border border-warning/30">
                      <Lock className="size-3.5" /> Not configured
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* View 3: Standard Setting Items Category View */
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
              {currentTabContent.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{currentTabContent.description}</p>
          </div>

          <div className="grid gap-4">
            {currentTabContent.items.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-xs text-muted-foreground shadow-xs">
                No settings configured in this category.
              </div>
            ) : (
              currentTabContent.items.map((item) => {
                const isSaving = savingKey === item.key;
                const isDirty = settingValues[item.key] !== initialValues[item.key];
                const currentValue = settingValues[item.key] ?? item.value;

                return (
                  <div
                    key={item.key}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-lg border border-border bg-card p-4.5 shadow-xs transition-colors hover:border-border/80"
                  >
                    <div className="space-y-1.5 max-w-xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-semibold text-sm text-foreground">{item.name}</span>
                        <code className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                          {item.key}
                        </code>
                        {isSaving ? (
                          <SemanticStatusBadge status="blue" label="SAVING..." className="text-[10px] py-0 px-2" />
                        ) : isDirty ? (
                          <SemanticStatusBadge status="amber" label="MODIFIED" className="text-[10px] py-0 px-2" />
                        ) : (
                          <SemanticStatusBadge status="green" label="ENFORCED" className="text-[10px] py-0 px-2" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>

                      {item.updatedAt ? (
                        <p className="text-[10px] text-muted-foreground/70">
                          Last updated {new Date(item.updatedAt).toLocaleString()} by {item.updatedByName || "Admin"}
                        </p>
                      ) : null}
                    </div>

                    {/* Inputs & Action Controls */}
                    <div className="flex items-center gap-3 shrink-0">
                      {item.valueType === "boolean" ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`switch-${item.key}`}
                            checked={Boolean(currentValue)}
                            onCheckedChange={(checked) => handleValueChange(item.key, checked)}
                            disabled={isSaving}
                            aria-label={`Toggle ${item.name}`}
                          />
                          <label htmlFor={`switch-${item.key}`} className="text-xs font-mono text-muted-foreground">
                            {Boolean(currentValue) ? "ON" : "OFF"}
                          </label>
                        </div>
                      ) : item.valueType === "number" ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            id={`input-${item.key}`}
                            type="number"
                            value={currentValue ?? ""}
                            onChange={(e) => handleValueChange(item.key, Number(e.target.value))}
                            disabled={isSaving}
                            className="w-28 font-mono text-xs"
                            aria-label={`Set numeric value for ${item.name}`}
                          />
                        </div>
                      ) : (
                        <Input
                          id={`input-${item.key}`}
                          type="text"
                          value={currentValue ?? ""}
                          onChange={(e) => handleValueChange(item.key, e.target.value)}
                          disabled={isSaving}
                          className="w-48 font-mono text-xs"
                          aria-label={`Set text value for ${item.name}`}
                        />
                      )}

                      {/* Admin Edit Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        {isDirty ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancelEdit(item.key)}
                              disabled={isSaving}
                              className="h-8 text-xs shrink-0"
                              title="Revert changes"
                            >
                              <RotateCcw className="size-3.5 mr-1" /> Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveRequest(item)}
                              disabled={isSaving}
                              className="h-8 text-xs shrink-0"
                            >
                              {isSaving ? (
                                <>
                                  <RefreshCw className="size-3.5 mr-1 animate-spin" /> Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="size-3.5 mr-1" /> Save
                                </>
                              )}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveRequest(item)}
                            disabled={true}
                            className="h-8 text-xs shrink-0 opacity-60"
                          >
                            <Save className="size-3.5 mr-1" /> Saved
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* AlertDialog for High-Impact Setting Changes */}
      <AlertDialog
        open={Boolean(pendingHighImpactItem)}
        onOpenChange={(open) => !open && setPendingHighImpactItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-base font-bold">
              Disable capability &quot;{pendingHighImpactItem?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Disabling this feature flag will immediately prevent team members from invoking this capability system-wide.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep enabled</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingHighImpactItem) {
                  void executeSave(pendingHighImpactItem);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable capability
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
