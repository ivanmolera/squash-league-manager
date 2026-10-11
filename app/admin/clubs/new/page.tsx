import Link from "next/link";
import { redirect } from "next/navigation";
import { saveClubAction } from "@/app/admin/actions";
import { ClubFields } from "@/app/admin/clubs/club-fields";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { activeFederationWhere } from "@/src/lib/entity-activity";
import { getDictionary } from "@/src/lib/i18n";
import { getManagerOptions } from "@/src/lib/manager-options";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewClubPage() {
  const [federations, currentUser, dictionary] = await Promise.all([
    prisma.federation.findMany({ where: activeFederationWhere, orderBy: { name: "asc" } }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  if (!currentUser) redirect("/login");
  if (!isAdmin) redirect("/admin/clubs");
  const managers = await getManagerOptions(dictionary.locale, t.federationManagerNoAccount, t.federationManagerAccountOnly);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.newClub}</h1>
        <Link className="secondary-link" href="/admin/clubs">{t.clubs}</Link>
      </section>
      <section className="centered-list">
        <form className="admin-form" action={saveClubAction}>
          <input type="hidden" name="returnTo" value="/admin/clubs" />
          <ClubFields managers={managers} federations={federations} isAdmin={isAdmin} labels={t} />
          <p className="muted">{t.clubManagerSelectionHelp}</p>
          <button type="submit">{t.createClub}</button>
        </form>
      </section>
    </main>
  );
}
