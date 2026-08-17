# Local Development Guide

This guide explains how to start, stop, restart, and troubleshoot the Sales Intel local development environment.

---

## 1. Quick Start (One-Click Startup)

Double-click `start-local.bat` in the project root directory, or run it from CMD/PowerShell:

```cmd
start-local.bat
```

### What `start-local.bat` does:
1. **Verifies Prerequisites**: Checks that Docker CLI (`docker.exe`) and Docker Desktop daemon are up and running.
2. **Checks Port Availability**: Inspects ports `8080`, `8081`, and `8082` to ensure no conflicting processes are running.
3. **Builds & Starts Docker Containers**:
   - **Email Verifier (`sales-intel-email-verifier`)**: Builds the Docker image `email-verifier-service` if needed, then starts the container on port `8081:8080`.
   - **Google Maps Scraper (`sales-intel-gmaps`)**: Starts the `gosom/google-maps-scraper` container in `-web` mode on port `8082:8080`.
4. **Starts Web Server**: Launches `npm run dev -- --port 8080` in a dedicated terminal window if not already active.
5. **Opens Dedicated Log Windows**: Streams log views for both Docker containers.
6. **Performs Health Checks**: Continuously polls all three local endpoints until healthy.
7. **Displays Service Status Table**: Displays the service health summary.
8. **Auto-Opens Browser**: Opens [http://localhost:8080](http://localhost:8080) automatically once the web app is ready.

---

## 2. One-Click Shutdown & Restart

- **Shutdown**: Double-click `stop-local.bat`. Terminates the dev server process on port `8080` and stops/removes `sales-intel-email-verifier` and `sales-intel-gmaps` containers. Does not affect unrelated containers or files.
- **Restart**: Double-click `restart-local.bat`. Executes `stop-local.bat`, waits 2 seconds, and executes `start-local.bat`.

---

## 3. Service Architecture & Port Overview

| Service | Local Port | Health Check Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Sales Intel Web App** | `http://localhost:8080` | `http://localhost:8080` | Main web application (React / TanStack / Vite). |
| **Email Verifier** | `http://localhost:8081` | `http://localhost:8081/health` | Standalone Go microservice checking email syntax, MX records, and SMTP deliverability. |
| **Google Maps Scraper** | `http://localhost:8082` | `http://localhost:8082` | Playwright-based Go web scraper (`gosom/google-maps-scraper`) for lead discovery. |

---

## 4. Chrome Extension Connection & Setup

The extension connects directly to the web application using Chrome's `externally_connectable` webpage-to-extension messaging mechanism (`chrome.runtime.sendMessage`).

### Extension Installation:
1. Open `chrome://extensions` in Chrome and enable **Developer mode** (top right toggle).
2. Click **Load unpacked** and select the `D:\Sales-Intel\extension` directory.
3. Open [http://localhost:8080/settings](http://localhost:8080/settings) in your browser.
4. Verify status badge displays **● Installed — Not connected**.
5. Click **Connect Extension**. Status changes immediately to **● Connected**.

### Extension Reload Workflow:
If you modify extension files in `D:\Sales-Intel\extension`:
1. Go to `chrome://extensions` and click the refresh icon on **Sales Intel Maps Connector**.
2. Refresh the web app tab at `http://localhost:8080/settings`.
3. The page will maintain or re-verify connection status cleanly without throwing context invalidation errors.

---

## 5. Rebuilding the Email Verifier Service

If you modify Go source code in `email-verifier-service/main.go` or edit `email-verifier-service/Dockerfile`:

Run `start-local.bat` with the `rebuild` parameter:

```cmd
start-local.bat rebuild
```

This automatically stops the active container, rebuilds `email-verifier-service`, and launches `sales-intel-email-verifier` using the updated image.

Alternatively, build manually using Docker:
```cmd
docker build -t email-verifier-service ./email-verifier-service
start-local.bat
```

---

## 6. Troubleshooting

### Docker Desktop is Not Running
**Symptom**: `[ERROR] Docker Desktop is not running.`
**Solution**:
1. Launch **Docker Desktop** from your Windows Start menu.
2. Wait until the Docker Desktop icon in the system tray shows "Engine running".
3. Re-run `start-local.bat`.

### Occupied Ports
**Symptom**: `[FAIL] Port 808X is occupied by an external process: <ProcessName> (PID <PID>)`
**Solution**:
- If port `8080`, `8081`, or `8082` is being used by an external application, inspect and terminate it if safe:
  ```cmd
  netstat -ano | findstr :8081
  taskkill /F /PID <PID>
  ```
- Re-run `start-local.bat`.
