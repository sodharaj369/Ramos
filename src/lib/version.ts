export const APP_VERSION = "1.0.16";
export const EXTENSION_VERSION = "1.0.16";

export interface BuildInfo {
  appVersion: string;
  extensionVersion: string;
  environment: string;
}

export const BUILD_INFO: BuildInfo = {
  appVersion: APP_VERSION,
  extensionVersion: EXTENSION_VERSION,
  environment: typeof process !== "undefined" && process.env.NODE_ENV === "production" ? "PRODUCTION" : "LOCAL",
};
