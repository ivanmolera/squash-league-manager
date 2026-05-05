import { saveFederationManagerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { formatUserManagerName } from "@/src/lib/names";
import { prisma } from "@/src/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FederationsPage() {
  const [currentUser, dictionary, federations, users] = await Promise.all([
    getCurrentUser(),
    getDictionary(),
    prisma.federation.findMany({
      include: {
        manager: { include: { player: true } },
        ranking: true,
        _count: { select: { clubs: true, competitions: true } }
      },
      orderBy: [{ name: "asc" }]
    }),
    prisma.user.findMany({ include: { player: true }, orderBy: { email: "asc" } })
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const sortedUsers = [...users].sort((left, right) =>
    formatUserManagerName(left).localeCompare(formatUserManagerName(right), dictionary.locale, { sensitivity: "base" })
  );

  if (!isAdmin) {
    redirect("/");
  }

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.federations}</h1>
      </section>
      <section className="list-panel">
        {federations.map((federation) => (
          <article className="row-card" key={federation.id}>
            <div className="federation-row-details">
              <strong>{federation.name}</strong>
              <span>{federation.code}{federation.ranking ? ` · ${federation.ranking.code}` : ""}</span>
              <span>{federation.city ?? t.noCity}{federation.province ? ` · ${federation.province}` : ""}</span>
              <span>{federation._count.clubs} {t.clubs} · {federation._count.competitions} {t.tournaments}</span>
            </div>
            <form className="inline-form" action={saveFederationManagerAction}>
              <input type="hidden" name="federationId" value={federation.id} />
              <label>
                {t.federationManager}
                <select name="managerUserId" defaultValue={federation.managerUserId ?? ""}>
                  <option value="">{t.noManager}</option>
                  {sortedUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {formatUserManagerName(user)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">{t.save}</button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
