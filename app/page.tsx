const modules = [
  "Jugadores y perfiles",
  "Clubes y equipos",
  "Ligas individuales",
  "Ligas por equipos",
  "Torneos y cuadros",
  "Historico y rankings"
];

export default function Home() {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">Squash League Manager</p>
        <h1>Base tecnica inicial para gestionar competiciones de squash.</h1>
        <p>
          El primer hito deja preparado el modelo de datos, Flyway, Prisma y la
          estructura de despliegue para construir ligas, equipos, torneos,
          resultados historicos y rankings.
        </p>
      </section>
      <section className="module-grid" aria-label="Modulos principales">
        {modules.map((module) => (
          <article className="module" key={module}>
            <span>{module}</span>
          </article>
        ))}
      </section>
    </main>
  );
}
