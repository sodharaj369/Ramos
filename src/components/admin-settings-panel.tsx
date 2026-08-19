import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Shield, Save, CheckCircle, AlertCircle, RefreshCw, History, Sliders, Server, Mail, Layers, ToggleLeft } from "lucide-react";
import {
  getAdminSettingsData,
  updateAdminSetting,
  getAdminSettingsHistoryData,
  checkIsAdmin,
  type AdminSettingsSection,
  type AdminSettingItem,
} from "@/lib/admin.functions";

export function AdminSettingsPanel() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<AdminSettingsSection[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("discovery");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [settingValues, setSettingValues] = useState<Record<string, any>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      const { isAdmin } = await checkIsAdmin();
      setIsAdmin(isAdmin);
      if (!isAdmin) {
        setLoading(false);
        return;
      }
      const data = await getAdminSettingsData();
      setSections(data.sections);

      const initialValues: Record<string, any> = {};
      for (const section of data.sections) {
        for (const item of section.items) {
          if (!item.isSecret) {
            initialValues[item.key] = item.value;
          }
        }
      }
      setSettingValues(initialValues);

      const hist = await getAdminSettingsHistoryData();
      setHistory(hist.history);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load admin settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading administration controls...</span>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-amber-600 dark:text-amber-400 flex items-start gap-4">
        <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-lg">Admin Privileges Required</h3>
          <p className="text-sm mt-1">
            Access to centralized system configuration is restricted to users with the <code className="bg-amber-500/20 px-1.5 py-0.5 rounded font-mono text-xs">admin</code> role.
          </p>
        </div>
      </div>
    );
  }

  const handleValueChange = (key: string, val: any) => {
    setSettingValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async (item: AdminSettingItem) => {
    try {
      setSavingKey(item.key);
      const val = settingValues[item.key];
      await updateAdminSetting({ data: { key: item.key, value: val } });
      toast.success(`Updated ${item.name} successfully.`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update setting.");
    } finally {
      setSavingKey(null);
    }
  };

  const currentSection = sections.find((s) => s.category === activeTab);

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "discovery":
        return <Sliders className="w-4 h-4" />;
      case "import":
        return <Layers className="w-4 h-4" />;
      case "verification":
        return <Mail className="w-4 h-4" />;
      case "providers":
        return <Server className="w-4 h-4" />;
      case "feature_flags":
        return <ToggleLeft className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Administration & Centralized Runtime Configuration</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage system-wide limits, provider toggles, and runtime defaults. All changes are validated server-side and recorded in the audit trail.
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {sections.map((sec) => (
          <button
            key={sec.category}
            onClick={() => setActiveTab(sec.category)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
              activeTab === sec.category
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {getCategoryIcon(sec.category)}
            {sec.title}
          </button>
        ))}
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
            activeTab === "audit"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <History className="w-4 h-4" />
          Audit Log ({history.length})
        </button>
      </div>

      {/* Audit Log Tab */}
      {activeTab === "audit" ? (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-500" />
              Configuration Audit Trail
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Immutable record of administrative configuration changes. Secret values are automatically masked.
            </p>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-medium">
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Setting Key</th>
                  <th className="p-3">Old Value</th>
                  <th className="p-3">New Value</th>
                  <th className="p-3">Changed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      No configuration history recorded yet.
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-slate-500">{new Date(h.createdAt).toLocaleString()}</td>
                      <td className="p-3 font-mono font-medium text-slate-900 dark:text-slate-200">{h.settingKey}</td>
                      <td className="p-3 font-mono text-slate-500">{JSON.stringify(h.oldValue)}</td>
                      <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{JSON.stringify(h.newValue)}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{h.changedByName || h.changedBy || "System"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Settings Category Panel */
        currentSection && (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                {getCategoryIcon(currentSection.category)}
                {currentSection.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{currentSection.description}</p>
            </div>

            <div className="grid gap-4">
              {currentSection.items.map((item) => (
                <div
                  key={item.key}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">{item.name}</span>
                      <code className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono">
                        {item.key}
                      </code>
                      {!item.isSecret && (
                        <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                          ENFORCED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>

                    {item.updatedAt && (
                      <p className="text-[10px] text-slate-400">
                        Updated {new Date(item.updatedAt).toLocaleString()} by {item.updatedByName || "Admin"}
                      </p>
                    )}
                  </div>

                  {/* Input / Controls */}
                  <div className="flex items-center gap-3">
                    {item.isSecret ? (
                      <div className="flex items-center gap-2">
                        {item.configured ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5" /> Configured ✓
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <AlertCircle className="w-3.5 h-3.5" /> Not configured
                          </span>
                        )}
                      </div>
                    ) : item.valueType === "boolean" ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(settingValues[item.key])}
                          onChange={(e) => handleValueChange(item.key, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-indigo-600"></div>
                      </label>
                    ) : item.valueType === "number" ? (
                      <input
                        type="number"
                        value={settingValues[item.key] ?? ""}
                        onChange={(e) => handleValueChange(item.key, Number(e.target.value))}
                        className="w-28 px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <input
                        type="text"
                        value={settingValues[item.key] ?? ""}
                        onChange={(e) => handleValueChange(item.key, e.target.value)}
                        className="w-48 px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    )}

                    {!item.isSecret && (
                      <button
                        onClick={() => handleSave(item)}
                        disabled={savingKey === item.key}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition shadow-sm"
                      >
                        {savingKey === item.key ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Save
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
