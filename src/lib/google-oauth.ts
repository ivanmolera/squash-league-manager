import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { appBaseUrl } from "@/src/lib/email";

export const googleOAuthCookieName = process.env.NODE_ENV === "production" ? "__Host-slm_google_oauth" : "slm_google_oauth";
export const googleOAuthCookieMaxAge = 10 * 60;

export type GoogleOAuthAttempt = {
  state: string;
  nonce: string;
  verifier: string;
  linkUserId: string | null;
  origin: string;
};

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function allowedGoogleOrigin(origin: string) {
  const canonical = new URL(appBaseUrl()).origin;
  return origin === canonical || (canonical === "https://squashflow.com" && origin === "https://www.squashflow.com");
}

export function googleRedirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`;
}

export function googleStartUrl() {
  return `${new URL(appBaseUrl()).origin}/api/auth/google/start`;
}

export function googleOAuthClient(origin: string) {
  return new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    googleRedirectUri(origin)
  );
}

export function newGoogleOAuthAttempt(linkUserId: string | null, origin: string): GoogleOAuthAttempt {
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    linkUserId,
    origin
  };
}

export function googleAuthorizationUrl(attempt: GoogleOAuthAttempt) {
  const challenge = createHash("sha256").update(attempt.verifier).digest("base64url");
  return googleOAuthClient(attempt.origin).generateAuthUrl({
    response_type: "code",
    scope: ["openid", "email", "profile"],
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: challenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: "select_account"
  });
}
