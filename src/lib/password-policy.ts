/**
 * Client-safe password policy helpers.
 *
 * The locally checkable rules below are enforced in the UI before submission.
 * The leaked-password (HIBP) check is enforced by the auth service at submit
 * time — it cannot be evaluated in the browser, so it is shown as "checked
 * when you submit" rather than as a satisfied/unsatisfied rule.
 */

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  { id: "lower", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "digit", label: "One number", test: (v) => /[0-9]/.test(v) },
  {
    id: "symbol",
    label: "One symbol (e.g. ! ? @ # $)",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
  {
    id: "notcommon",
    label: "Not an obvious pattern (password, 12345678, qwerty…)",
    test: (v) =>
      v.length > 0 &&
      !/^(?:password|passw0rd|12345678|123456789|qwerty|letmein|welcome|admin)/i.test(v),
  },
];

export function evaluatePassword(value: string) {
  const results = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    satisfied: rule.test(value),
  }));
  const unmet = results.filter((r) => !r.satisfied);
  return { results, unmet, valid: unmet.length === 0 };
}

/** Turns terse auth-service errors into something a person can act on. */
export function describeAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("weak") || m.includes("pwned") || m.includes("known to be")) {
    return "This password appears in known data breaches. Pick a different, unique password — the strength rules above are met, but the password itself is compromised.";
  }
  if (m.includes("email not confirmed")) {
    return "Your email address hasn't been confirmed yet. Use the verification screen to resend the link.";
  }
  if (m.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) {
    return "Too many requests. Please wait a minute before trying again.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Sign in instead, or resend the verification email.";
  }
  return message;
}
