// Report descriptions mention amounts ("hodiny a částky"). For a viewer
// without "Vidí sazby a částky" the amount columns are hidden, so the copy
// drops the amounts too.
export function reportCopy(text: string, showAmounts: boolean): string {
  if (showAmounts) {
    return text;
  }
  return text
    .replace(/, částk[ay] a /g, " a ")
    .replace(/ a částky/g, "")
    .replace(/, částk[ay]/g, "");
}
