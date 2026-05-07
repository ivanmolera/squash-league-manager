import Link from "next/link";
import { redirect } from "next/navigation";
import { saveClubAction } from "@/app/admin/actions";
import { ClubFields } from "@/app/admin/clubs/club-fields";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewClubPage() {
  const [managers, federations, currentUser, dictionary] = await Promise.all([
    prisma.user.findMany({ include: { player: true }, orderBy: { email: "asc" } }),
    prisma.federation.findMany({ orderBy: { name: "asc" } }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  if (!currentUser) redirect("/login");
  if (!isAdmin) redirect("/admin/clubs");

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
          <ClubFields managers={managers} federations={federations} isAdmin={isAdmin} labels={t} />
          <button type="submit">{t.createClub}</button>
        </form>
      </section>
    </main>
  );
}
