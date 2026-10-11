export function isGoogleAuthoritativeEmail(email: string, hostedDomain?: string | null) {
  const domain = email.toLowerCase().split("@")[1];
  return domain === "gmail.com" || domain === "googlemail.com" || Boolean(hostedDomain && domain === hostedDomain.toLowerCase());
}

export function splitGoogleName(givenName: string | undefined, familyName: string | undefined, fullName: string | undefined, email: string) {
  if (givenName?.trim() && familyName?.trim()) {
    return { firstName: givenName.trim(), lastName: familyName.trim() };
  }

  const parts = (fullName || email.split("@")[0]).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || email.split("@")[0],
    lastName: parts.slice(1).join(" ") || email.split("@")[0]
  };
}
