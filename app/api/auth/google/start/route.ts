import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { appBaseUrl } from "@/src/lib/email";
import {
  googleAuthorizationUrl,
  googleOAuthConfigured,
  googleOAuthCookieMaxAge,
  googleOAuthCookieName,
  newGoogleOAuthAttempt
} from "@/src/lib/google-oauth";

export async function GET() {
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(`${appBaseUrl()}/login?google_error=unavailable`);
  }

  const origin = new URL(appBaseUrl()).origin;

  const currentUser = await getCurrentUser();
  const attempt = newGoogleOAuthAttempt(currentUser?.id ?? null, origin);
  const response = NextResponse.redirect(googleAuthorizationUrl(attempt));
  response.cookies.set(googleOAuthCookieName, JSON.stringify(attempt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: googleOAuthCookieMaxAge
  });
  return response;
}
