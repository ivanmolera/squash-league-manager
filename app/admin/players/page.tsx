import Link from "next/link";
import { savePlayerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const [players, clubs, currentUser] = await Promise.all([
    prisma.player.findMany({
      include: {
        user: true,
        memberships: { include: { club: true }, take: 1 }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    getCurrentUser()
  ]);
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const ownPlayerId = players.find((player) => player.userId === currentUser?.id)?.id;
  const canCreateOwnProfile = Boolean(currentUser && !ownPlayerId);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Admin</p>
        <h1>Jugadores</h1>
        <p className="muted">Alta y modificación de perfiles con email validado, teléfono e idioma.</p>
      </section>

      <section className="work-grid">
        {isAdmin || canCreateOwnProfile ? (
          <form className="admin-form" action={savePlayerAction}>
            <h2>{isAdmin ? "Nuevo perfil" : "Crear mi perfil"}</h2>
            <PlayerFields clubs={clubs} currentUserEmail={currentUser?.email} isAdmin={isAdmin} />
            <button type="submit">Crear jugador</button>
          </form>
        ) : (
          <section className="list-panel">
            <h2>Solo lectura</h2>
            <p className="muted">Inicia sesión para modificar tu perfil.</p>
          </section>
        )}

        <div className="list-panel">
          <h2>Listado de jugadores</h2>
          {players.map((player) => (
            isAdmin || player.id === ownPlayerId ? (
              <article className="row-card" key={player.id}>
                <strong><Link href={`/players/${player.id}`}>{player.lastName}, {player.firstName}</Link></strong>
                <Link className="secondary-link" href={`/players/${player.id}/edit`}>Editar</Link>
              </article>
            ) : (
              <article className="row-card simple-row" key={player.id}>
                <strong><Link href={`/players/${player.id}`}>{player.lastName}, {player.firstName}</Link></strong>
              </article>
            )
          ))}
        </div>
      </section>
    </main>
  );
}

type PlayerFieldData = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  emailVerified?: boolean;
  preferredLocale?: string;
  gender?: string;
  dominantHand?: string;
  heightCm?: number | null;
  weightKg?: unknown;
  racketBrand?: string | null;
  clubId?: string;
  showContactPublic?: boolean;
  showPhysicalPublic?: boolean;
};

function PlayerFields({
  clubs,
  currentUserEmail,
  isAdmin,
  player
}: {
  clubs: Array<{ id: string; name: string }>;
  currentUserEmail?: string;
  isAdmin: boolean;
  player?: PlayerFieldData;
}) {
  return (
    <>
      <div className="form-row">
        <label>Nombre<input name="firstName" defaultValue={player?.firstName ?? ""} required /></label>
        <label>Apellidos<input name="lastName" defaultValue={player?.lastName ?? ""} required /></label>
      </div>
      <div className="form-row">
        <label>Email<input name="email" type="email" defaultValue={player?.email ?? currentUserEmail ?? ""} readOnly={!isAdmin} required /></label>
        <label>Teléfono<input name="phone" defaultValue={player?.phone ?? ""} /></label>
      </div>
      <div className="form-row">
        <label>Idioma
          <select name="preferredLocale" defaultValue={player?.preferredLocale ?? "es"}>
            <option value="ca">Catalan</option>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>Club
          <select name="clubId" defaultValue={player?.clubId ?? ""} disabled={!isAdmin}>
            <option value="">Sin club</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
      </div>
      <label className="check-line">
        <input name="emailVerified" type="checkbox" defaultChecked={player?.emailVerified ?? false} disabled={!isAdmin} />
        Email validado
      </label>
      <label className="check-line">
        <input name="showContactPublic" type="checkbox" defaultChecked={player?.showContactPublic ?? true} />
        Mostrar email/teléfono públicamente
      </label>
      <label className="check-line">
        <input name="showPhysicalPublic" type="checkbox" defaultChecked={player?.showPhysicalPublic ?? true} />
        Mostrar altura/peso públicamente
      </label>
      <div className="form-row">
        <label>Sexo
          <select name="gender" defaultValue={player?.gender ?? "not_specified"}>
            <option value="male">Masculino</option>
            <option value="female">Femenino</option>
            <option value="other">Otro</option>
            <option value="not_specified">No especificado</option>
          </select>
        </label>
        <label>Mano dominante
          <select name="dominantHand" defaultValue={player?.dominantHand ?? "not_specified"}>
            <option value="right">Diestro/a</option>
            <option value="left">Zurdo/a</option>
            <option value="ambidextrous">Ambidiestro/a</option>
            <option value="not_specified">No especificado</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>Altura cm<input name="heightCm" type="number" defaultValue={player?.heightCm ?? ""} /></label>
        <label>Peso kg<input name="weightKg" type="number" step="0.1" defaultValue={String(player?.weightKg ?? "")} /></label>
      </div>
      <label>Marca de raqueta<input name="racketBrand" defaultValue={player?.racketBrand ?? ""} /></label>
    </>
  );
}
