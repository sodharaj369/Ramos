import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Mail, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeAuthError, evaluatePassword } from "@/lib/password-policy";

export const Route = createFileRoute("/auth")({
  // Auth UI depends on the browser-only Supabase session; rendering it on the
  // server produced a hydration mismatch.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Sales Intelligence" },
      {
        name: "description",
        content:
          "Sign in to the internal Sales Intelligence platform for lead discovery and email verification.",
      },
      { property: "og:title", content: "Sign in — Sales Intelligence" },
      {
        property: "og:description",
        content: "Internal lead discovery and email verification platform.",
      },
    ],
  }),
  component: AuthPage,
});

const RESEND_COOLDOWN_SECONDS = 60;

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("signin");
  const [formError, setFormError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  // Verification screen state
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "not_verified" | "verified">(
    "pending",
  );
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/dashboard" });
    });
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  const policy = evaluatePassword(password);
  const emailRedirectTo =
    typeof window === "undefined" ? "" : `${window.location.origin}/dashboard`;

  const signIn = async () => {
    setFormError(null);
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setPendingEmail(email);
        setVerifyStatus("not_verified");
        setVerifyNote(null);
        setVerifyError(null);
        return;
      }
      setFormError(describeAuthError(error.message));
      return;
    }
    if (data.user && !data.user.email_confirmed_at) {
      setPendingEmail(email);
      setVerifyStatus("not_verified");
      return;
    }
    router.navigate({ to: "/dashboard" });
  };

  const signUp = async () => {
    setFormError(null);
    setShowRules(true);
    if (!email.trim()) {
      setFormError("Enter your work email address.");
      return;
    }
    if (!policy.valid) {
      setFormError(
        `Password doesn't meet the requirements yet: ${policy.unmet
          .map((r) => r.label.toLowerCase())
          .join("; ")}.`,
      );
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo, data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) {
      setFormError(describeAuthError(error.message));
      return;
    }
    if (data.session) {
      router.navigate({ to: "/dashboard" });
      return;
    }
    setPendingEmail(email);
    setVerifyStatus("pending");
    setVerifyNote(
      "Verification request accepted. If the address exists and delivery succeeds, the link will arrive shortly — check spam/junk too.",
    );
    setVerifyError(null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const resend = async () => {
    if (!pendingEmail || cooldown > 0 || resending) return;
    setResending(true);
    setVerifyNote(null);
    setVerifyError(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo },
    });
    setResending(false);
    if (error) {
      setVerifyError(describeAuthError(error.message));
      return;
    }
    setVerifyNote(
      "Verification email request accepted. Please check your inbox and spam/junk folder. Delivery is not guaranteed to be instant.",
    );
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const refreshStatus = async () => {
    if (!pendingEmail) return;
    setChecking(true);
    setVerifyError(null);
    setVerifyNote(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data.user?.email_confirmed_at) {
          setVerifyStatus("verified");
          return;
        }
      }
      if (password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: pendingEmail,
          password,
        });
        if (!error && data.user?.email_confirmed_at) {
          setVerifyStatus("verified");
          return;
        }
        if (error && !error.message.toLowerCase().includes("email not confirmed")) {
          setVerifyError(describeAuthError(error.message));
          setVerifyStatus("not_verified");
          return;
        }
      } else {
        setVerifyError("Enter your password on the sign-in tab to check verification status.");
      }
      setVerifyStatus("not_verified");
      setVerifyNote("Still not verified. Click the link in the email, then check again.");
    } finally {
      setChecking(false);
    }
  };

  const resetPassword = async () => {
    if (!email) {
      setFormError("Enter your email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(describeAuthError(error.message));
      return;
    }
    toast.success("Password reset request accepted. Check your inbox and spam folder.");
  };

  const backToSignIn = () => {
    setPendingEmail(null);
    setVerifyNote(null);
    setVerifyError(null);
    setMode("signin");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold text-sidebar-accent-foreground">
            Sales Intelligence
          </p>
          <p className="mt-1 text-sm text-sidebar-foreground/60">Internal lead platform</p>
        </div>
        <div className="max-w-sm space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-sidebar-accent-foreground">
            Data quality over lead quantity.
          </h2>
          <p className="text-sm text-sidebar-foreground/70">
            Discover publicly available business leads, deduplicate them properly, and verify email
            deliverability signals with honest, evidence-based results.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/45">Authorised team members only.</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {pendingEmail ? (
            <section className="space-y-5">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Mail className="size-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">
                  {verifyStatus === "verified" ? "Email verified" : "Check your email"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {verifyStatus === "verified"
                    ? "Your email address is confirmed. You can continue to the app."
                    : `We've sent a verification link to ${pendingEmail}.`}
                </p>
              </div>

              <div className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                <span className="text-muted-foreground">Status: </span>
                <span
                  className={
                    verifyStatus === "verified"
                      ? "font-medium text-success"
                      : verifyStatus === "pending"
                        ? "font-medium text-warning-foreground"
                        : "font-medium text-destructive"
                  }
                >
                  {verifyStatus === "verified"
                    ? "Verified"
                    : verifyStatus === "pending"
                      ? "Verification pending"
                      : "Not verified"}
                </span>
              </div>

              {verifyNote ? (
                <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                  {verifyNote}
                </p>
              ) : null}
              {verifyError ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {verifyError}
                </p>
              ) : null}

              {verifyStatus === "verified" ? (
                <Button className="w-full" onClick={() => router.navigate({ to: "/dashboard" })}>
                  Continue to dashboard
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={cooldown > 0 || resending}
                    onClick={resend}
                  >
                    {resending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification email"}
                  </Button>
                  <Button className="w-full" disabled={checking} onClick={refreshStatus}>
                    {checking ? <Loader2 className="size-4 animate-spin" /> : null}
                    I've verified my email — refresh status
                  </Button>
                </div>
              )}

              <button
                type="button"
                onClick={backToSignIn}
                className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Return to sign in
              </button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                We can confirm the email was requested and accepted by the auth service — we cannot
                confirm inbox delivery. If nothing arrives, check spam/junk, then contact an admin.
              </p>
            </section>
          ) : (
            <>
              <h1 className="text-xl font-semibold">Team access</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in with your work account to continue.
              </p>

              <Tabs
                value={mode}
                onValueChange={(v) => {
                  setMode(v);
                  setFormError(null);
                }}
                className="mt-6"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      autoComplete="email"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      autoComplete="current-password"
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {formError ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {formError}
                    </p>
                  ) : null}
                  <Button className="w-full" disabled={busy} onClick={signIn}>
                    Sign in
                  </Button>
                  <button
                    type="button"
                    onClick={resetPassword}
                    className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </button>
                </TabsContent>

                <TabsContent value="signup" className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email2">Work email</Label>
                    <Input
                      id="email2"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password2">Password</Label>
                    <Input
                      id="password2"
                      type="password"
                      value={password}
                      autoComplete="new-password"
                      onFocus={() => setShowRules(true)}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  {showRules || password ? (
                    <ul className="space-y-1 rounded-md border border-border bg-card px-3 py-2.5">
                      {policy.results.map((rule) => (
                        <li
                          key={rule.id}
                          className={`flex items-start gap-2 text-xs ${
                            rule.satisfied ? "text-success" : "text-muted-foreground"
                          }`}
                        >
                          {rule.satisfied ? (
                            <Check className="mt-0.5 size-3.5 shrink-0" />
                          ) : (
                            <X className="mt-0.5 size-3.5 shrink-0" />
                          )}
                          <span>{rule.label}</span>
                        </li>
                      ))}
                      <li className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground">
                        <span>
                          Also checked on submit: the password must not appear in known data
                          breaches (leaked-password protection).
                        </span>
                      </li>
                    </ul>
                  ) : null}

                  {formError ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {formError}
                    </p>
                  ) : null}

                  <Button
                    className="w-full"
                    disabled={busy || !policy.valid || !email.trim()}
                    onClick={signUp}
                  >
                    Create account
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Email confirmation is required. After signing up you'll get a verification link
                    before you can access the app.
                  </p>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
