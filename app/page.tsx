import Link from "next/link";
import { Navigation } from "@/app/navigation";

const modules = [
  {
    title: "Competiciones",
    text: "Ligas individuales, ligas por equipos y torneos con categorias."
  },
  {
    title: "Resultados",
    text: "Partidos al mejor de 5 sets, WO, BYE y auditoria de cambios."
  },
  {
    title: "Historico",
    text: "Temporadas cerradas, rankings guardados y nombres historicos."
  }
];

export default function Home() {
  return (
    <main className="app-shell">
      <Navigation />
      <section className="public-hero">
        <p className="eyebrow">Squash League Manager</p>
        <h1>Consulta ligas, torneos, resultados y rankings de squash.</h1>
        <p className="muted">
          Esta primera version deja preparada la base publica de consulta y el
          acceso admin para gestionar los datos.
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/dashboard">
            Ver app
          </Link>
          <Link className="secondary-link" href="/login">
            Acceso admin
          </Link>
        </div>
      </section>

      <section className="module-grid" aria-label="Modulos publicos">
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
