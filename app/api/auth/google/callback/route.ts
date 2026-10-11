import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getCurrentUser, hashSessionToken, sessionCookieName } from "@/src/lib/auth";
import { appBaseUrl } from "@/src/lib/email";
import { isFeatureEnabled } from "@/src/lib/features";
import {
  googleOAuthClient,
  allowedGoogleOrigin,
  googleOAuthConfigured,
  googleOAuthCookieName,
  googleRedirectUri,
  type GoogleOAuthAttempt
} from "@/src/lib/google-oauth";
import { isGoogleAuthoritativeEmail, splitGoogleName } from "@/src/lib/google-account-policy";
import { getDictionary } from "@/src/lib/i18n";
import { findPlayerLinkCandidates } from "@/src/lib/player-identity";
import { prisma } from "@/src/lib/prisma";

function loginRedirect(error: string) {
  const url = new URL("/login", appBaseUrl());
  url.searchParams.set("google_error", error);
  return NextResponse.redirect(url);
}

function validState(expected: string, received: string | null) {
  if (!received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const attemptCookie = cookieStore.get(googleOAuthCookieName)?.value;
  cookieStore.delete(googleOAuthCookieName);

  let attempt: GoogleOAuthAttempt;
  try {
    attempt = JSON.parse(attemptCookie ?? "");
  } catch {
    return loginRedirect("failed");
  }

  if (!attempt || typeof attempt.state !== "string" || typeof attempt.nonce !== "string" ||
      typeof attempt.verifier !== "string" || typeof attempt.origin !== "string" ||
      !googleOAuthConfigured() || !allowedGoogleOrigin(attempt.origin) ||
      attempt.origin !== new URL(appBaseUrl()).origin ||
      !validState(attempt.state, request.nextUrl.searchParams.get("state"))) {
    return loginRedirect("failed");
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || request.nextUrl.searchParams.has("error")) return loginRedirect("failed");

  try {
    const client = googleOAuthClient(attempt.origin);
    const { tokens } = await client.getToken({
      code,
      codeVerifier: attempt.verifier,
      redirect_uri: googleRedirectUri(attempt.origin)
    });
    if (!tokens.id_token) return loginRedirect("failed");

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID
    });
    const identity = ticket.getPayload();
    if (!identity?.sub || !identity.email || identity.email_verified !== true || identity.nonce !== attempt.nonce) {
      return loginRedirect("failed");
    }

    const email = identity.email.toLowerCase();
    const linked = await prisma.externalIdentity.findUnique({
      where: { provider_subject: { provider: "google", subject: identity.sub } },
      include: { user: true }
    });
    const currentUser = attempt.linkUserId ? await getCurrentUser() : null;
    if (attempt.linkUserId && currentUser?.id !== attempt.linkUserId) return loginRedirect("failed");

    if (linked && currentUser && linked.userId !== currentUser.id) return loginRedirect("conflict");
    if (linked?.user.suspendedAt) return loginRedirect("suspended");

    let userId = linked?.userId;
    if (!userId) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (currentUser && (currentUser.email !== email || existingUser?.id !== currentUser.id)) {
        return loginRedirect("conflict");
      }
      if (existingUser?.suspendedAt) return loginRedirect("suspended");
      if (existingUser && !currentUser && (!existingUser.emailVerified || !isGoogleAuthoritativeEmail(email, identity.hd))) {
        return loginRedirect("link_required");
      }

      if (existingUser) {
        await prisma.externalIdentity.create({
          data: { userId: existingUser.id, provider: "google", subject: identity.sub }
        });
        userId = existingUser.id;
      } else {
        if (!(await isFeatureEnabled("public_registration"))) return loginRedirect("registration_disabled");

        const { locale } = await getDictionary();
        const name = splitGoogleName(identity.given_name, identity.family_name, identity.name, email);
        const candidate = (await findPlayerLinkCandidates({
          ...name,
          email,
          onlyUnlinked: true,
          minimumScore: 82,
          take: 1
        }))[0];
        const user = await prisma.user.create({
          data: {
            firebaseUid: `google:${identity.sub}`,
            email,
            emailVerified: true,
            displayName: identity.name || `${name.firstName} ${name.lastName}`,
            preferredLocale: locale,
            roles: { create: { role: "player" } },
            externalIdentities: { create: { provider: "google", subject: identity.sub } },
            ...(candidate
              ? {
                  playerLinkRequests: {
                    create: {
                      candidatePlayerId: candidate.player.id,
                      requestedFirstName: name.firstName,
                      requestedLastName: name.lastName,
                      requestedEmail: email,
                      matchScore: candidate.score,
                      matchReasons: candidate.reasons
                    }
                  }
                }
              : {
                  player: {
                    create: {
                      firstName: name.firstName,
                      lastName: name.lastName,
                      genericProfileVariant: "neutral",
                      showContactPublic: false,
                      showPhysicalPublic: false
                    }
                  }
                })
          }
        });
        userId = user.id;
      }
    }

    if (currentUser) {
      const path = currentUser.player ? `/players/${currentUser.player.id}?google_linked=1` : "/dashboard";
      return NextResponse.redirect(new URL(path, attempt.origin));
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.authSession.create({ data: { userId, tokenHash: hashSessionToken(token), expiresAt } });
    const response = NextResponse.redirect(new URL("/dashboard", attempt.origin));
    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt
    });
    return response;
  } catch (error) {
    console.error("Google sign-in failed", error);
    return loginRedirect("failed");
  }
}
