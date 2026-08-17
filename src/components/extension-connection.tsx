import { useState } from "react";
import { ChevronDown, ChevronUp, Download, Info, Puzzle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DEFAULT_EXTENSION_ID, useExtensionBridge } from "@/hooks/use-extension-bridge";
import { APP_VERSION, EXTENSION_VERSION } from "@/lib/version";

/** Downloads the packaged extension through fetch so preview auth applies. */
function downloadExtension() {
  const versionedName = `sales-intel-maps-connector-v${EXTENSION_VERSION}.zip`;
  fetch(`/${versionedName}`)
    .then((res) => {
      if (!res.ok) return fetch("/sales-intel-maps-connector.zip");
      return res;
    })
    .then((res) => {
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = versionedName;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch((err: Error) => toast.error(err.message));
}

export function ExtensionConnection({ compact = false }: { compact?: boolean }) {
  const bridge = useExtensionBridge();
  const [showDebug, setShowDebug] = useState(false);

  const connected = bridge.status === "connected";
  const installedNotConnected = bridge.status === "installed-not-connected";
  const notInstalled = bridge.status === "not-installed";
  const isError = bridge.status === "error";

  let statusBadgeText = "Checking…";
  let statusBadgeClass = "bg-muted text-muted-foreground";

  if (connected) {
    statusBadgeText = "● Connected";
    statusBadgeClass = "bg-success/12 text-success font-medium";
  } else if (installedNotConnected) {
    statusBadgeText = "● Installed — Not connected";
    statusBadgeClass = "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium";
  } else if (notInstalled) {
    statusBadgeText = "○ Not installed";
    statusBadgeClass = "bg-muted text-muted-foreground";
  } else if (isError) {
    statusBadgeText = "⚠ Connection error";
    statusBadgeClass = "bg-destructive/15 text-destructive font-medium";
  }

  const extVersionText = bridge.version
    ? `v${bridge.version}`
    : notInstalled
      ? "Not installed"
      : "v1.0.1 · Disconnected";

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Puzzle className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Sales Intel Maps Connector</h2>
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusBadgeClass}`}>
            {statusBadgeText}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowDebug((prev) => !prev)}
        >
          <Info className="mr-1 size-3.5" />
          {showDebug ? "Hide Diagnostics" : "Diagnostics"}
          {showDebug ? <ChevronUp className="ml-1 size-3" /> : <ChevronDown className="ml-1 size-3" />}
        </Button>
      </div>

      {!compact ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Runs Google Maps discovery locally in your Chrome browser. Your browser performs
          discovery; Sales Intel receives only the business data you choose to import.
        </p>
      ) : null}

      {connected && bridge.email ? (
        <p className="mt-2 text-xs font-medium text-foreground">
          Connected as <span className="text-primary">{bridge.email}</span>
        </p>
      ) : null}

      {installedNotConnected ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          The Chrome extension is available, but no Sales Intel session is connected.
        </p>
      ) : null}

      {bridge.error ? (
        <p className="mt-2 text-xs text-destructive font-medium">{bridge.error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {connected ? (
          <Button
            size="sm"
            variant="outline"
            disabled={bridge.busy}
            onClick={async () => {
              await bridge.disconnect();
              toast.success("Extension disconnected.");
            }}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={bridge.busy || notInstalled}
            onClick={async () => {
              const res = await bridge.connect();
              if (!res.ok) {
                toast.error(res.error || "Connection failed.");
              } else {
                toast.success("Extension connected successfully.");
              }
            }}
          >
            Connect Extension
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={downloadExtension}>
          <Download className="size-4 mr-1.5" />
          Download extension (v{EXTENSION_VERSION})
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={bridge.status === "checking"}
          onClick={async () => {
            await bridge.refresh();
            toast.info("Checked extension status.");
          }}
        >
          <RefreshCw className={`size-4 mr-1.5 ${bridge.status === "checking" ? "animate-spin" : ""}`} />
          Recheck
        </Button>
      </div>

      {showDebug ? (
        <div className="mt-4 rounded-md border border-border/60 bg-muted/40 p-3 text-xs space-y-1 text-muted-foreground font-mono">
          <div className="font-semibold text-foreground font-sans text-xs mb-1.5">
            Sales Intel Connection Diagnostics
          </div>
          <div>Web App: <span className="text-foreground font-medium">v{APP_VERSION}</span></div>
          <div>Extension: <span className="text-foreground font-medium">{extVersionText}</span></div>
          <div>Environment: <span className="text-foreground font-medium">{bridge.environment || "LOCAL"}</span></div>
          <div>Connection: <span className="text-foreground font-medium">{connected ? "Connected" : "Disconnected"}</span></div>
          <div>Extension ID: <span className="text-foreground font-medium">{DEFAULT_EXTENSION_ID}</span></div>
          <div>Last Checked: <span className="text-foreground font-medium">{bridge.lastChecked ? bridge.lastChecked.toLocaleTimeString() : "Never"}</span></div>
        </div>
      ) : null}

      {notInstalled ? (
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Download and unzip the extension.</li>
          <li>
            Open <span className="text-foreground">chrome://extensions</span> and enable Developer
            mode.
          </li>
          <li>Click “Load unpacked” and select the unzipped folder.</li>
          <li>Click <span className="text-foreground">Recheck</span> above, then click <span className="text-foreground">Connect Extension</span>.</li>
        </ol>
      ) : null}
    </div>
  );
}
