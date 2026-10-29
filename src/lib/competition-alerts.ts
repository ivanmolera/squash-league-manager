import "server-only";

import { prisma } from "@/src/lib/prisma";
import { sendCompetitionAlertEmail } from "@/src/lib/competition-alert-email";
import { daysUntilCompetition, eligibleCompetitionCategories, madridCalendarDate } from "@/src/lib/competition-alert-policy";
import { featureDefaults, getFeatureSettings } from "@/src/lib/features";

const MAX_EMAILS_PER_RUN = 100;
const MAX_ATTEMPTS = 4;

export async function runCompetitionAlerts({ dryRun = false }: { dryRun?: boolean } = {}) {
  const now = new Date();
  const features = await getFeatureSettings();
  if (!features.player_communications) {
    return { competitions: 0, eligible: 0, sent: 0, failed: 0, skipped: 0, dryRun, disabled: true };
  }
  const competitions = await prisma.competition.findMany({
    where: {
      startsAt: { gt: now, lt: new Date(now.getTime() + 9 * 86_400_000) },
      status: { in: ["draft", "registration_open", "active"] },
      type: { in: [
        ...(features.tournaments ? ["tournament" as const] : []),
        ...(features.leagues ? ["individual_league" as const, "team_league" as const] : [])
      ] }
    },
    include: {
      categories: { include: { category: true } },
      hostClub: { select: { name: true, address: true, city: true, postalCode: true, active: true, federation: { select: { active: true } } } },
      organizerFederation: { select: { active: true } },
      ranking: { select: { id: true } }
    },
    orderBy: { startsAt: "asc" }
  });
  const upcoming = competitions.filter((competition) => competition.startsAt &&
    daysUntilCompetition(competition.startsAt, now) >= 1 &&
    daysUntilCompetition(competition.startsAt, now) <= 7 &&
    competition.hostClub?.active !== false &&
    competition.hostClub?.federation?.active !== false &&
    competition.organizerFederation?.active !== false);

  const users = await prisma.user.findMany({
    where: {
      receivesCompetitionAlerts: true,
      emailVerified: true,
      suspendedAt: null,
      player: { is: { active: true, isSportsProfile: true, mergedIntoPlayerId: null } }
    },
    select: {
      id: true, email: true, preferredLocale: true,
      player: {
        select: {
          id: true, gender: true, birthDate: true,
          memberships: { select: { clubId: true, seasonId: true, fromDate: true, toDate: true } },
          rankingCategories: { where: { isLevelCategory: true, validTo: null }, select: { rankingId: true, seasonId: true, categoryId: true } }
        }
      }
    }
  });
  const rankingCodes = [...new Set(upcoming.filter((competition) => !competition.rankingId && competition.rankingCode !== "none")
    .map((competition) => competition.rankingCode))];
  const rankings = await prisma.ranking.findMany({ where: { code: { in: rankingCodes } }, select: { code: true, id: true } });
  const rankingIdByCode = new Map(rankings.map((ranking) => [ranking.code, ranking.id]));

  const result = { competitions: upcoming.length, eligible: 0, sent: 0, failed: 0, skipped: 0, dryRun };
  for (const competition of upcoming) {
    const startsAt = competition.startsAt!;
    const eventDate = madridCalendarDate(startsAt);
    if (!competition.categories.length) continue;

    const participants = await prisma.competitionParticipant.findMany({
      where: { competitionId: competition.id, playerId: { not: null } },
      select: { playerId: true, competitionCategoryId: true }
    });
    const participantIds = new Set(participants.map((entry) => entry.playerId));
    const registrations = competition.type === "tournament" ? await prisma.tournamentRegistration.findMany({
      where: { competitionCategory: { competitionId: competition.id }, status: { in: ["pending", "accepted"] } },
      select: { playerId: true, competitionCategoryId: true }
    }) : [];
    const registeredIds = new Set(registrations.map((entry) => entry.playerId));
    const teamIds = competition.type === "team_league" ? [...new Set((await prisma.teamTie.findMany({
      where: { competitionId: competition.id }, select: { homeTeamId: true, awayTeamId: true }
    })).flatMap((tie) => [tie.homeTeamId, tie.awayTeamId]))] : [];
    const rosterPlayerIds = teamIds.length ? new Set((await prisma.teamRoster.findMany({
      where: { teamId: { in: teamIds }, fromDate: { lte: eventDate }, OR: [{ toDate: null }, { toDate: { gte: eventDate } }] },
      select: { playerId: true }
    })).map((roster) => roster.playerId)) : new Set<string>();
    const rankingId = competition.rankingId ?? rankingIdByCode.get(competition.rankingCode) ?? null;

    for (const user of users) {
      const player = user.player;
      if (!player) continue;
      const memberOfHost = competition.hostClubId && player.memberships.some((membership) =>
        membership.clubId === competition.hostClubId && membership.seasonId === competition.seasonId &&
        membership.fromDate <= eventDate && (!membership.toDate || membership.toDate >= eventDate));
      if (competition.type !== "tournament" && competition.hostClubId && !memberOfHost) continue;
      const alreadyInTournament = participantIds.has(player.id) || registeredIds.has(player.id);
      if (competition.type === "tournament" && !alreadyInTournament &&
        !(competition.status === "registration_open" &&
          (!competition.registrationDeadline || competition.registrationDeadline > now))) continue;
      if (competition.type === "individual_league" && !participantIds.has(player.id) &&
        !(competition.status === "registration_open" && (!competition.registrationDeadline || competition.registrationDeadline > now))) continue;
      if (competition.type === "team_league" && !rosterPlayerIds.has(player.id)) continue;

      const assignment = rankingId ? player.rankingCategories.find((entry) =>
        entry.rankingId === rankingId && entry.seasonId === competition.seasonId) : null;
      const attendingCategoryIds = competition.type === "tournament" && alreadyInTournament
        ? new Set([
          ...participants.filter((entry) => entry.playerId === player.id).map((entry) => entry.competitionCategoryId),
          ...registrations.filter((entry) => entry.playerId === player.id).map((entry) => entry.competitionCategoryId)
        ]) : null;
      const categories = attendingCategoryIds
        ? competition.categories.filter((entry) => attendingCategoryIds.has(entry.id)).map((entry) => entry.category)
        : eligibleCompetitionCategories(competition.categories.map((entry) => entry.category),
          player, assignment?.categoryId ?? null, startsAt);
      if (!categories.length) continue;
      result.eligible += 1;
      if (dryRun) continue;
      if (result.sent + result.failed >= MAX_EMAILS_PER_RUN) return result;

      await prisma.competitionAlertDelivery.upsert({
        where: { userId_competitionId: { userId: user.id, competitionId: competition.id } },
        create: { userId: user.id, competitionId: competition.id }, update: {}
      });
      const staleBefore = new Date(now.getTime() - 60 * 60 * 1000);
      const claim = await prisma.competitionAlertDelivery.updateMany({
        where: {
          userId: user.id, competitionId: competition.id, attempts: { lt: MAX_ATTEMPTS },
          OR: [{ status: "pending" }, { status: "failed" }, { status: "sending", lastAttemptAt: { lt: staleBefore } }]
        },
        data: { status: "sending", attempts: { increment: 1 }, lastAttemptAt: now, lastError: null }
      });
      if (!claim.count) { result.skipped += 1; continue; }

      try {
        const communicationsSetting = await prisma.appFeatureSetting.findUnique({
          where: { featureKey: "player_communications" }, select: { enabled: true }
        });
        if (!(communicationsSetting?.enabled ?? featureDefaults.player_communications)) {
          await prisma.competitionAlertDelivery.delete({
            where: { userId_competitionId: { userId: user.id, competitionId: competition.id } }
          });
          result.skipped += 1;
          return result;
        }
        const stillOptedIn = await prisma.user.count({
          where: { id: user.id, receivesCompetitionAlerts: true, emailVerified: true, suspendedAt: null,
            player: { is: { id: player.id, active: true, isSportsProfile: true, mergedIntoPlayerId: null } } }
        });
        if (!stillOptedIn) {
          await prisma.competitionAlertDelivery.delete({
            where: { userId_competitionId: { userId: user.id, competitionId: competition.id } }
          });
          result.skipped += 1;
          continue;
        }
        const outcome = await sendCompetitionAlertEmail({
          userId: user.id, playerId: player.id, email: user.email, locale: user.preferredLocale,
          competition: {
            id: competition.id, name: competition.name, type: competition.type,
            description: competition.description, startsAt, endsAt: competition.endsAt,
            registrationDeadline: competition.registrationDeadline, hostClub: competition.hostClub
          },
          categoryNames: categories.map((category) => category.name),
          daysUntil: daysUntilCompetition(startsAt, now)
        });
        if (!outcome.sent) throw new Error("Email provider is not configured");
        await prisma.competitionAlertDelivery.update({
          where: { userId_competitionId: { userId: user.id, competitionId: competition.id } },
          data: { status: "sent", sentAt: new Date() }
        });
        result.sent += 1;
      } catch (error) {
        await prisma.competitionAlertDelivery.update({
          where: { userId_competitionId: { userId: user.id, competitionId: competition.id } },
          data: { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error" }
        });
        result.failed += 1;
      }
    }
  }
  return result;
}
