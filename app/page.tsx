import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { getDictionary } from "@/src/lib/i18n";

export default async function Home() {
  const { t } = await getDictionary();
  const modules = [
    { title: t.moduleCompetitions, text: t.moduleCompetitionsText },
    { title: t.moduleResults, text: t.moduleResultsText },
    { title: t.moduleHistory, text: t.moduleHistoryText }
  ];

  return (
    <main className="app-shell">
      <Navigation />
      <section className="public-hero">
        <p className="eyebrow">Squash League Manager</p>
        <h1>{t.homeTitle}</h1>
        <p className="muted">{t.homeText}</p>
        <div className="hero-actions">
          <Link className="primary-link" href="/dashboard">
            {t.viewApp}
          </Link>
          <Link className="secondary-link" href="/login">
            {t.adminAccess}
          </Link>
        </div>
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
