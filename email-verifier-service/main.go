// Standalone email verification service built on the MIT-licensed
// AfterShip/email-verifier library. It performs syntax, DNS/MX, disposable,
// role-account and SMTP-reachability checks in a strict DNS-First, SMTP-Second pipeline.
package main

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	emailverifier "github.com/AfterShip/email-verifier"
)

type verifyRequest struct {
	Email string `json:"email"`
}

type verifyResponse struct {
	Email        string `json:"email"`
	Status       string `json:"status"`
	Reachable    string `json:"reachable"`
	SyntaxValid  *bool  `json:"syntax_valid,omitempty"`
	DomainValid  *bool  `json:"domain_valid,omitempty"`
	MXValid      *bool  `json:"mx_valid,omitempty"`
	HasMXRecords *bool  `json:"has_mx_records,omitempty"`
	SMTPChecked  *bool  `json:"smtp_checked,omitempty"`
	SMTPResult   string `json:"smtp_result,omitempty"`
	CatchAll     *bool  `json:"catch_all,omitempty"`
	Disposable   *bool  `json:"disposable,omitempty"`
	RoleAccount  *bool  `json:"role_account,omitempty"`
	Confidence   *int   `json:"confidence,omitempty"`
	Reason       string `json:"reason,omitempty"`
	Error        string `json:"error,omitempty"`
}

func boolPtr(b bool) *bool {
	return &b
}

var verifier *emailverifier.Verifier
var serviceAPIKey string

func authorized(r *http.Request) bool {
	if serviceAPIKey == "" {
		return true
	}
	provided := r.Header.Get("X-API-Key")
	if provided == "" {
		provided = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(serviceAPIKey)) == 1
}

func envDuration(name string, fallback time.Duration) time.Duration {
	if raw := os.Getenv(name); raw != "" {
		if secs, err := strconv.Atoi(raw); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return fallback
}

func isDNSErrNotFound(err error) bool {
	if err == nil {
		return false
	}
	if dnsErr, ok := err.(*net.DNSError); ok {
		return dnsErr.IsNotFound || (!dnsErr.IsTimeout && strings.Contains(strings.ToLower(dnsErr.Err), "no such host"))
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "no such host") || strings.Contains(errStr, "nxdomain")
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"smtp_enabled": true,
		"time":         time.Now().UTC().Format(time.RFC3339),
	})
}

func verifyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	if !authorized(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	defer r.Body.Close()

	var req verifyRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusOK, verifyResponse{Status: "invalid", SyntaxValid: boolPtr(false), Reason: "invalid JSON body"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		writeJSON(w, http.StatusOK, verifyResponse{Status: "invalid", SyntaxValid: boolPtr(false), Reason: "email is required"})
		return
	}

	// STEP 1 — Syntax
	syntaxResult := verifier.ParseAddress(email)
	if !syntaxResult.Valid {
		writeJSON(w, http.StatusOK, verifyResponse{
			Email:       email,
			Status:      "invalid",
			Reachable:   "no",
			SyntaxValid: boolPtr(false),
			Reason:      "Email address has invalid syntax.",
		})
		return
	}

	parts := strings.Split(email, "@")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		writeJSON(w, http.StatusOK, verifyResponse{
			Email:       email,
			Status:      "invalid",
			Reachable:   "no",
			SyntaxValid: boolPtr(false),
			Reason:      "Email address has invalid syntax.",
		})
		return
	}
	domain := parts[1]

	// STEP 2 — Domain resolution (independent of SMTP)
	ips, hostErr := net.LookupHost(domain)
	domainResolves := (hostErr == nil && len(ips) > 0)
	isNxDomain := isDNSErrNotFound(hostErr)

	// STEP 3 — MX Lookup (independent of SMTP)
	mxs, mxErr := net.LookupMX(domain)
	hasMX := (mxErr == nil && len(mxs) > 0)
	isMxNotFound := isDNSErrNotFound(mxErr)

	if hostErr != nil && !isNxDomain && mxErr != nil && !isMxNotFound {
		// Temporary DNS lookup failure
		writeJSON(w, http.StatusOK, verifyResponse{
			Email:       email,
			Status:      "unknown",
			Reachable:   "unknown",
			SyntaxValid: boolPtr(true),
			Reason:      "DNS resolution timed out or failed. Deliverability cannot be determined.",
		})
		return
	}

	if isNxDomain {
		// Positively determined nonexistent domain
		writeJSON(w, http.StatusOK, verifyResponse{
			Email:       email,
			Status:      "invalid",
			Reachable:   "no",
			SyntaxValid: boolPtr(true),
			DomainValid: boolPtr(false),
			Reason:      "The domain does not resolve (NXDOMAIN), so it cannot receive email.",
		})
		return
	}

	var domainValidPtr *bool
	var mxValidPtr *bool
	var hasMXRecordsPtr *bool

	if hasMX {
		domainValidPtr = boolPtr(true)
		mxValidPtr = boolPtr(true)
		hasMXRecordsPtr = boolPtr(true)
	} else if mxErr != nil && !isMxNotFound {
		// MX query temporarily failed (DNS timeout)
		writeJSON(w, http.StatusOK, verifyResponse{
			Email:       email,
			Status:      "unknown",
			Reachable:   "unknown",
			SyntaxValid: boolPtr(true),
			DomainValid: boolPtr(domainResolves),
			Reason:      "MX record lookup timed out. Deliverability cannot be determined.",
		})
		return
	} else {
		// No MX records found
		hasMXRecordsPtr = boolPtr(false)
		if domainResolves {
			// RFC 5321 Fallback: domain has A/AAAA record to receive mail
			domainValidPtr = boolPtr(true)
			mxValidPtr = boolPtr(true)
		} else {
			// No MX records AND domain does not resolve -> Positively INVALID!
			writeJSON(w, http.StatusOK, verifyResponse{
				Email:        email,
				Status:       "invalid",
				Reachable:    "no",
				SyntaxValid:  boolPtr(true),
				DomainValid:  boolPtr(false),
				MXValid:      boolPtr(false),
				HasMXRecords: boolPtr(false),
				Reason:       "Domain does not publish MX records and has no resolving A/AAAA address.",
			})
			return
		}
	}

	// STEP 4 — Disposable & Role checks
	isDisposable := verifier.IsDisposable(domain)
	isRole := verifier.IsRoleAccount(email)

	// STEP 5 — SMTP Probe
	res, err := verifier.Verify(email)

	if err != nil || res == nil {
		// SMTP Probe timed out or failed to connect (e.g. outbound port 25 block).
		// DO NOT mark invalid! Return UNKNOWN preserving independent DNS/MX evidence.
		var dispPtr *bool
		if isDisposable {
			dispPtr = boolPtr(true)
		}
		var rolePtr *bool
		if isRole {
			rolePtr = boolPtr(true)
		}

		errStr := ""
		if err != nil {
			errStr = err.Error()
		}

		writeJSON(w, http.StatusOK, verifyResponse{
			Email:        email,
			Status:       "unknown",
			Reachable:    "unknown",
			SyntaxValid:  boolPtr(true),
			DomainValid:  domainValidPtr,
			MXValid:      mxValidPtr,
			HasMXRecords: hasMXRecordsPtr,
			SMTPChecked:  boolPtr(true),
			SMTPResult:   "host_unreachable",
			Disposable:   dispPtr,
			RoleAccount:  rolePtr,
			Reason:       "DNS and MX checks passed, but SMTP verification timed out. This does not mean the email address is invalid.",
			Error:        errStr,
		})
		return
	}

	resp := verifyResponse{
		Email:        email,
		SyntaxValid:  boolPtr(true),
		DomainValid:  domainValidPtr,
		MXValid:      mxValidPtr,
		HasMXRecords: hasMXRecordsPtr,
		SMTPChecked:  boolPtr(true),
	}

	if isDisposable || res.Disposable {
		resp.Disposable = boolPtr(true)
	}
	if isRole || res.RoleAccount {
		resp.RoleAccount = boolPtr(true)
	}

	if res.SMTP != nil && res.SMTP.CatchAll {
		resp.CatchAll = boolPtr(true)
	}

	switch {
	case isDisposable || res.Disposable:
		resp.Status = "disposable"
		resp.Reachable = "unknown"
		resp.Reason = "The domain is a known disposable/temporary email provider."
	case isRole || res.RoleAccount:
		resp.Status = "role"
		resp.Reachable = "unknown"
		resp.Reason = "This is a shared role account, not a personal mailbox."
	case res.SMTP != nil && res.SMTP.CatchAll:
		resp.Status = "catch_all"
		resp.Reachable = "unknown"
		resp.SMTPResult = "catch_all"
		resp.Reason = "The domain accepts mail for any recipient (catch-all), so this specific mailbox cannot be confirmed."
	case res.Reachable == "yes" || (res.SMTP != nil && res.SMTP.Deliverable):
		resp.Status = "valid"
		resp.Reachable = "yes"
		resp.SMTPResult = "accepted"
		resp.Reason = "The recipient mail server accepted this mailbox during an SMTP check."
	case res.Reachable == "no" || (res.SMTP != nil && !res.SMTP.Deliverable && res.SMTP.HostExists):
		resp.Status = "invalid"
		resp.Reachable = "no"
		resp.SMTPResult = "rejected"
		resp.Reason = "The recipient mail server explicitly rejected this mailbox during an SMTP check."
	default:
		resp.Status = "unknown"
		resp.Reachable = "unknown"
		resp.SMTPResult = "host_unreachable"
		resp.Reason = "DNS and MX checks passed, but SMTP verification timed out. This does not mean the email address is invalid."
	}

	writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func main() {
	smtpTimeout := envDuration("SMTP_TIMEOUT_SECONDS", 8*time.Second)
	helloName := os.Getenv("SMTP_HELO_NAME")
	if helloName == "" {
		helloName = "localhost"
	}
	fromEmail := os.Getenv("SMTP_FROM_EMAIL")
	if fromEmail == "" {
		fromEmail = "verify@localhost"
	}

	verifier = emailverifier.NewVerifier().
		EnableSMTPCheck().
		EnableDomainSuggest().
		EnableAutoUpdateDisposable().
		HelloName(helloName).
		FromEmail(fromEmail).
		ConnectTimeout(smtpTimeout).
		OperationTimeout(smtpTimeout)

	serviceAPIKey = os.Getenv("SERVICE_API_KEY")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/verify", verifyHandler)

	requestBudget := smtpTimeout*3 + 10*time.Second
	server := &http.Server{
		Addr:              "127.0.0.1:" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      requestBudget,
		IdleTimeout:       30 * time.Second,
	}
	if os.Getenv("BIND_ALL") == "true" {
		server.Addr = ":" + port
	}

	log.Printf("email-verifier-service listening on %s (smtp timeout %s)", server.Addr, smtpTimeout)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
