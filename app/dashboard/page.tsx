import { ShieldCheck, Trophy, UsersRound, Warehouse } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";

export default async function DashboardPage() {
  const { t } = await getDictionary();
  const user = await getCurrentUser();
  const roles = user?.roles.map((role) => role.role).join(", ");
  const nextModules = [
    { title: t.clubs, text: t.moduleClubsText, icon: Warehouse },
    { title: t.players, text: t.modulePlayersText, icon: UsersRound },
    { title: t.moduleCompetitions, text: t.moduleCompetitionsNextText, icon: Trophy }
  ];

  return (
    <main className="app-shell">
      <Navigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">{t.dashboardIntro}</p>
          <h1>{user ? `Hola, ${user.displayName ?? user.email}` : t.publicQuery}</h1>
          <p className="muted">
            {user ? `${t.activeRole}: ${roles}` : t.noLoginNeeded}
          </p>
        </div>
        {user ? (
          <form action={logoutAction}>
            <button className="secondary-button" type="submit">
              {t.logout}
            </button>
          </form>
        ) : (
          <a className="secondary-link" href="/login">
            {t.adminAccess}
          </a>
        )}
      </header>

      <section className="status-band">
        <ShieldCheck aria-hidden="true" size={28} />
        <div>
          <h2>{t.developmentReadyTitle}</h2>
          <p>{t.developmentReadyText}</p>
        </div>
      </section>

      <section className="module-grid" aria-label={t.moduleCompetitions}>
        {nextModules.map((module) => {
          const Icon = module.icon;

          return (
            <article className="module" key={module.title}>
              <Icon aria-hidden="true" size={24} />
              <h2>{module.title}</h2>
              <p>{module.text}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
