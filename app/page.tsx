import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";

export default async function Home() {
  const [user, { t }] = await Promise.all([getCurrentUser(), getDictionary()]);
  const roles = user?.roles.map((role) => role.role).join(", ");
  const modules = [
    { title: t.moduleCompetitions, text: t.moduleCompetitionsText },
    { title: t.moduleResults, text: t.moduleResultsText },
    { title: t.moduleHistory, text: t.moduleHistoryText },
    { title: t.moduleProfiles, text: t.moduleProfilesText }
  ];

  return (
    <main className="app-shell">
      <Navigation />
      <section className="public-hero">
        <p className="eyebrow">Squash League Manager</p>
        <h1>{user ? `${t.hello}, ${user.displayName ?? user.email}` : t.homeTitle}</h1>
        {user ? <p className="muted">{t.activeRole}: {roles}</p> : null}
      </section>

      <section className="module-grid" aria-label={t.publicAccess}>
        {modules.map((module) => (
          <article className="module" key={module.title}>
            <h2>{module.title}</h2>
            <p>{module.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
