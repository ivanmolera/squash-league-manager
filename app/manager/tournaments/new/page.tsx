import Link from "next/link";
import { redirect } from "next/navigation";
import { TournamentForm } from "@/app/manager/tournaments/tournament-form";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewTournamentPage() {
  await requireFeature("tournaments");
  const [categories, clubs, federations, currentUser, dictionary] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.club.findMany({ include: { federation: true }, orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.federation.findMany({ include: { ranking: true }, orderBy: [{ name: "asc" }] }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const isManager = Boolean(currentUser?.roles.some((role) => role.role === "manager"));
  const isFederationManager = Boolean(currentUser?.roles.some((role) => role.role === "manager_fed"));
  const editableFederations = isAdmin ? federations : federations.filter((federation) => federation.managerUserId === currentUser?.id);
  const editableFederationIds = new Set(editableFederations.map((federation) => federation.id));
  const editableClubs = isAdmin
    ? clubs
    : clubs.filter((club) => club.managerUserId === currentUser?.id || (club.federationId && editableFederationIds.has(club.federationId)));
  const canEdit = isAdmin || isManager || isFederationManager;

  if (!currentUser) redirect("/login");
  if (!canEdit) redirect("/manager/tournaments");

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.manager}</p>
        <h1>{t.createNewTournament}</h1>
        <Link className="secondary-link" href="/manager/tournaments">{t.tournaments}</Link>
      </section>
      <section className="centered-list">
        <TournamentForm
          categories={categories}
          editableClubs={editableClubs}
          editableFederations={editableFederations}
          isAdmin={isAdmin}
          labels={t}
          returnTo="/manager/tournaments"
        />
      </section>
    </main>
  );
}
