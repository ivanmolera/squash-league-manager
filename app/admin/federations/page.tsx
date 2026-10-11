import { saveFederationManagerAction } from "@/app/admin/actions";
import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { activeFederationWhere } from "@/src/lib/entity-activity";
import { getDictionary } from "@/src/lib/i18n";
import { getManagerOptions } from "@/src/lib/manager-options";
import { prisma } from "@/src/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FederationsPage() {
  const [currentUser, dictionary, federations] = await Promise.all([
    getCurrentUser(),
    getDictionary(),
    prisma.federation.findMany({
      where: activeFederationWhere,
      include: {
        manager: { include: { player: true } },
        ranking: true,
        _count: { select: { clubs: true, competitions: true } }
      },
      orderBy: [{ name: "asc" }]
    })
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  if (!isAdmin) {
    redirect("/");
  }
  const managerOptions = await getManagerOptions(dictionary.locale, t.federationManagerNoAccount, t.federationManagerAccountOnly);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.federations}</h1>
        <p className="muted">{t.federationManagerSelectionHelp}</p>
        <Link className="secondary-link" href="/admin/visibility?kind=federations">{t.entityActivity}</Link>
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
                <select name="managerSelection" defaultValue={federation.managerPlayerId
                  ? `player:${federation.managerPlayerId}`
                  : federation.managerUserId ? `user:${federation.managerUserId}` : ""}>
                  <option value="">{t.noManager}</option>
                  {managerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.name}{option.note ? ` · ${option.note}` : ""}
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
