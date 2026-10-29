import { OAuth2Client } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";
import { runCompetitionAlerts } from "@/src/lib/competition-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const oauth = new OAuth2Client();

export async function POST(request: NextRequest) {
  const audience = process.env.SCHEDULER_OIDC_AUDIENCE;
  const serviceAccount = process.env.SCHEDULER_SERVICE_ACCOUNT_EMAIL;
  if (!audience || !serviceAccount) return NextResponse.json({ error: "Job is not configured" }, { status: 503 });

  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const ticket = await oauth.verifyIdToken({ idToken: bearer, audience });
    if (ticket.getPayload()?.email !== serviceAccount) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCompetitionAlerts({ dryRun: request.nextUrl.searchParams.get("dryRun") === "1" });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Competition alert job failed", error);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
