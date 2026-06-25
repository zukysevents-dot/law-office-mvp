// ISDS feature flag (mirrors ARES_LOOKUP_ENABLED / SharePoint config). While
// false (the default), the data-box module runs on the stub client — no network,
// manual message entry only. Flip to true once a real ISDS provider is wired.
export function isIsdsEnabled(): boolean {
  return process.env.ISDS_ENABLED?.trim() === "true";
}
