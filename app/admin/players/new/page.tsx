import Link from "next/link";
import { redirect } from "next/navigation";
import { savePlayerAction } from "@/app/admin/actions";
import { AccountOnlyForm } from "@/app/admin/players/new/account-only-form";
import { Navigation } from "@/app/navigation";
import { PlayerFields } from "@/app/admin/players/player-fields";
import { getCurrentUser } from "@/src/lib/auth";
import { activeClubWhere } from "@/src/lib/entity-activity";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewPlayerProfilePage({ searchParams }: { searchParams?: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const accountOnly = params?.type === "account";
  const [clubs, currentUser, dictionary] = await Promise.all([
    prisma.club.findMany({ where: activeClubWhere, orderBy: [{ province: "asc" }, { name: "asc" }] }),
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
        <nav className="profile-kind-switch" aria-label={t.profileType}>
          <Link href="/admin/players/new" className={!accountOnly ? "is-active" : ""} aria-current={!accountOnly ? "page" : undefined}>{t.playerProfileType}</Link>
          <Link href="/admin/players/new?type=account" className={accountOnly ? "is-active" : ""} aria-current={accountOnly ? "page" : undefined}>{t.accountOnlyType}</Link>
        </nav>
        {accountOnly ? (
          <AccountOnlyForm labels={t} />
        ) : (
          <form className="admin-form" action={savePlayerAction}>
            <input type="hidden" name="returnTo" value="/admin/players" />
            <PlayerFields clubs={clubs} currentUserEmail={currentUser.email} isAdmin={isAdmin} labels={t} />
            <button type="submit">{t.createPlayer}</button>
          </form>
        )}
      </section>
    </main>
  );
}

function LinkBack({ href, label }: { href: string; label: string }) {
  return <a className="secondary-link" href={href}>{label}</a>;
}
