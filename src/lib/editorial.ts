/** Friendly text for the Backend's editorial-account errors (undefined for any other code). */
export function editorialMessage(code: string): string | undefined {
  if (code === "editorial_not_configured") return "The editorial account is not configured on the server (EDITORIAL_OWNER_EMAIL is empty).";
  if (code === "editorial_account_missing") return "The editorial account does not exist, is not an administrator, or is banned. Create it and make it an admin, then try again.";
  return undefined;
}
