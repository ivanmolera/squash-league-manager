import { redirect } from "next/navigation";
import { savePlayerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { PlayerFields } from "@/app/admin/players/player-fields";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewPlayerProfilePage() {
  const [clubs, currentUser, dictionary] = await Promise.all([
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  if (!currentUser) redirect("/login");
  if (!isAdmin) redirect("/players/me");

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.newProfile}</h1>
        <LinkBack href="/admin/players" label={t.players} />
      </section>
      <section className="centered-list player-form-section">
        <form className="admin-form" action={savePlayerAction}>
          <PlayerFields clubs={clubs} currentUserEmail={currentUser.email} isAdmin={isAdmin} labels={t} />
          <button type="submit">{t.createPlayer}</button>
        </form>
      </section>
    </main>
  );
}

function LinkBack({ href, label }: { href: string; label: string }) {
  return <a className="secondary-link" href={href}>{label}</a>;
}
