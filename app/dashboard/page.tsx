import { redirect } from "next/navigation";
import { ShieldCheck, Trophy, UsersRound, Warehouse } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { getCurrentUser } from "@/src/lib/auth";

const nextModules = [
  {
    title: "Clubes",
    text: "Alta de clubes, manager unico, nombres historicos por temporada.",
    icon: Warehouse
  },
  {
    title: "Jugadores",
    text: "Perfil, foto, sexo, mano dominante, raqueta y solicitudes de club.",
    icon: UsersRound
  },
  {
    title: "Competiciones",
    text: "Ligas individuales, ligas por equipos y torneos con BYE y WO.",
    icon: Trophy
  }
];

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const roles = user.roles.map((role) => role.role).join(", ");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Panel inicial</p>
          <h1>Hola, {user.displayName ?? user.email}</h1>
          <p className="muted">Rol activo: {roles}</p>
        </div>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            Salir
          </button>
        </form>
      </header>

      <section className="status-band">
        <ShieldCheck aria-hidden="true" size={28} />
        <div>
          <h2>Base lista para desarrollo incremental</h2>
          <p>
            El despliegue ya puede validar login, sesiones, migraciones Flyway,
            auditoria y conservacion de nombres historicos.
          </p>
        </div>
      </section>

      <section className="module-grid" aria-label="Siguientes modulos">
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
