/**
 * RAMOS Website Intelligence — Validators
 * Distinguishes syntactic validity from business usefulness.
 * Validates emails, phones, social profiles, URLs, and company identity.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RamosWebsiteValidators = factory();
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FREE_EMAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.uk",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "icloud.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "zoho.com",
    "mail.com",
    "gmx.com",
    "yandex.com",
  ]);

  const PLACEHOLDER_DOMAINS = new Set([
    "example.com",
    "example.org",
    "example.net",
    "domain.com",
    "yourdomain.com",
    "email.com",
    "sitename.com",
    "mysite.com",
    "test.com",
    "sample.com",
    "company.com",
  ]);

  const PLACEHOLDER_USERNAMES = new Set([
    "name",
    "user",
    "username",
    "email",
    "youremail",
    "yourname",
    "test",
    "demo",
    "placeholder",
    "sample",
    "first.last",
    "firstname.lastname",
    "john.doe",
  ]);

  const ASSET_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "ico",
    "css",
    "js",
    "woff",
    "woff2",
    "ttf",
  ]);

  const VENDOR_DOMAINS_BLACKLIST = new Set([
    "sentry.io",
    "wixpress.com",
    "shopify.com",
    "cloudflare.com",
    "gravatar.com",
    "wordpress.org",
    "schema.org",
    "googleapis.com",
  ]);

  /**
   * RFC 5322 compliant regex check for email syntax.
   * @param {string} email
   * @returns {boolean}
   */
  function isValidEmailSyntax(email) {
    if (!email || typeof email !== "string") return false;
    const trimmed = email.trim();
    if (trimmed.length < 5 || trimmed.length > 254) return false;
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(trimmed);
  }

  /**
   * Validates an email and classifies its business usefulness.
   * Does NOT reject valid business role accounts like info@, sales@, support@.
   * Rejects asset false positives, template placeholders, and vendor trackers.
   *
   * @param {string} email
   * @param {string} [websiteDomain] - Domain of the site being extracted (e.g. "acme.com")
   * @returns {{ isValid: boolean, classification: string, reason?: string }}
   */
  function evaluateEmail(email, websiteDomain) {
    if (!isValidEmailSyntax(email)) {
      return { isValid: false, classification: "invalid_syntax", reason: "Invalid email syntax" };
    }

    const parts = email.toLowerCase().split("@");
    if (parts.length !== 2) {
      return { isValid: false, classification: "invalid_format", reason: "Malformed address" };
    }

    const [user, domain] = parts;

    // Check if domain is an image or asset file false positive
    const domainParts = domain.split(".");
    const tld = domainParts[domainParts.length - 1];
    if (ASSET_EXTENSIONS.has(tld) || ASSET_EXTENSIONS.has(domainParts[0])) {
      return { isValid: false, classification: "asset_filename", reason: "Matches image/asset extension" };
    }

    // Check placeholder / dummy domains and usernames
    if (PLACEHOLDER_DOMAINS.has(domain) || PLACEHOLDER_USERNAMES.has(user)) {
      return { isValid: false, classification: "placeholder", reason: "Template dummy placeholder" };
    }

    // Check vendor / bug tracker blacklists
    if (VENDOR_DOMAINS_BLACKLIST.has(domain)) {
      return { isValid: false, classification: "vendor_tracker", reason: "Third-party vendor address" };
    }

    // Classify relationship to website domain
    const cleanWebDomain = websiteDomain
      ? websiteDomain.toLowerCase().replace(/^www\./, "").trim()
      : "";

    const domainMatchesSite = Boolean(
      cleanWebDomain && (domain === cleanWebDomain || domain.endsWith("." + cleanWebDomain))
    );

    function classifyFunctionalRole(u) {
      if (!u) return "direct";
      const un = u.toLowerCase();
      if (/^(sales|inquiries|inquiry|enquiry|enquiries|quotes|quote|deals|newbusiness|orders|order|orderdesk|bizdev)$/i.test(un)) {
        return "sales";
      }
      if (/^(support|help|customercare|care|service|services|billing|techsupport)$/i.test(un)) {
        return "support";
      }
      if (/^(info|contact|hello|office|admin|mail|general|team|feedback|frontdesk|reception)$/i.test(un)) {
        return "general";
      }
      if (/^(marketing|press|media|pr|partnerships)$/i.test(un)) {
        return "marketing";
      }
      if (/^(careers|jobs|recruiting|recruitment|talent|hr|work)$/i.test(un)) {
        return "careers";
      }
      return "direct";
    }

    const emailRole = classifyFunctionalRole(user);

    if (FREE_EMAIL_DOMAINS.has(domain)) {
      return {
        isValid: true,
        classification: "freemail",
        emailRole,
        reason: "Personal / free email provider",
      };
    }

    if (domainMatchesSite) {
      const isRoleAccount = emailRole !== "direct";
      return {
        isValid: true,
        classification: isRoleAccount ? "business_role" : "business_individual",
        emailRole,
        reason: isRoleAccount ? "Official business role address" : "Official individual address",
      };
    }

    return {
      isValid: true,
      classification: "external_business",
      emailRole,
      reason: "Custom domain email address",
    };
  }

  /**
   * Evaluates phone number validity.
   * Requires 7-18 digits, rejects repetitive dummy sequences (e.g. 0000000000, 123456789).
   * @param {string} phone
   * @returns {boolean}
   */
  function isValidPhone(phone) {
    if (!phone || typeof phone !== "string") return false;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 18) return false;

    // Reject all-identical digits e.g. 0000000000, 1111111111
    if (/^(\d)\1+$/.test(digits)) return false;

    // Reject common dummy sequences
    const invalidSequences = ["123456789", "987654321", "012345678", "1234567890"];
    for (const seq of invalidSequences) {
      if (digits.includes(seq)) return false;
    }

    return true;
  }

  /**
   * Validates social media profile URLs, rejecting share/intent/login URLs.
   * @param {string} url
   * @param {"linkedin" | "twitter" | "facebook" | "instagram" | "youtube" | "github"} platform
   * @returns {boolean}
   */
  function isSocialProfileUrl(url, platform) {
    if (!url || typeof url !== "string") return false;
    const lower = url.toLowerCase().trim();

    switch (platform) {
      case "linkedin": {
        if (!lower.includes("linkedin.com/")) return false;
        // Exclude share, login, pulse, directory roots
        if (
          lower.includes("/shareArticle") ||
          lower.includes("/sharing/") ||
          lower.includes("/login") ||
          lower.includes("/signup")
        ) {
          return false;
        }
        return lower.includes("linkedin.com/company/") || lower.includes("linkedin.com/in/");
      }
      case "twitter": {
        if (!lower.includes("twitter.com/") && !lower.includes("x.com/")) return false;
        if (
          lower.includes("/intent/") ||
          lower.includes("/share") ||
          lower.includes("/home") ||
          lower.includes("/login")
        ) {
          return false;
        }
        return true;
      }
      case "facebook": {
        if (!lower.includes("facebook.com/")) return false;
        if (
          lower.includes("/sharer") ||
          lower.includes("/share.php") ||
          lower.includes("/events/") ||
          lower.includes("/login") ||
          lower.includes("/dialog/")
        ) {
          return false;
        }
        return true;
      }
      case "instagram": {
        if (!lower.includes("instagram.com/")) return false;
        if (
          lower.includes("/p/") ||
          lower.includes("/reel/") ||
          lower.includes("/stories/") ||
          lower.includes("/explore/")
        ) {
          return false;
        }
        return true;
      }
      case "youtube": {
        if (!lower.includes("youtube.com/") && !lower.includes("youtu.be/")) return false;
        if (lower.includes("/watch") || lower.includes("/embed/") || lower.includes("/share")) {
          return false;
        }
        return lower.includes("/@") || lower.includes("/channel/") || lower.includes("/c/");
      }
      case "github": {
        if (!lower.includes("github.com/")) return false;
        if (
          lower.includes("/login") ||
          lower.includes("/join") ||
          lower.includes("/pricing") ||
          lower.includes("/features")
        ) {
          return false;
        }
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * Validates company name candidate, filtering out generic web titles.
   * @param {string} name
   * @returns {boolean}
   */
  function isValidCompanyName(name) {
    if (!name || typeof name !== "string") return false;
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 100) return false;

    const lower = clean.toLowerCase();
    const blacklist = new Set([
      "home",
      "homepage",
      "welcome",
      "index",
      "about",
      "about us",
      "contact",
      "contact us",
      "our company",
      "official site",
      "untitled",
      "404 not found",
    ]);

    if (blacklist.has(lower)) return false;
    return true;
  }

  /**
   * Normalizes a social URL by stripping tracking parameters, hash fragments, and trailing slashes.
   * @param {string} url
   * @param {string} [platform]
   * @returns {string}
   */
  function normalizeSocialUrl(url, platform) {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim();
    clean = clean.split("#")[0];
    clean = clean.split("?")[0];
    clean = clean.replace(/\/+$/, "");
    return clean;
  }

  return {
    isValidEmailSyntax,
    evaluateEmail,
    isValidPhone,
    isSocialProfileUrl,
    isValidCompanyName,
    normalizeSocialUrl,
  };
});
