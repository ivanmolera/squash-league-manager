import { savePlayerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const [players, clubs] = await Promise.all([
    prisma.player.findMany({
      include: {
        user: true,
        memberships: { include: { club: true }, take: 1 }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.club.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Admin</p>
        <h1>Jugadores</h1>
        <p className="muted">Alta y modificacion de perfiles con email validado, telefono e idioma.</p>
      </section>

      <section className="work-grid">
        <form className="admin-form" action={savePlayerAction}>
          <h2>Nuevo perfil</h2>
          <PlayerFields clubs={clubs} />
          <button type="submit">Crear jugador</button>
        </form>

        <div className="list-panel">
          <h2>Perfiles existentes</h2>
          {players.map((player) => (
            <form className="compact-form" action={savePlayerAction} key={player.id}>
              <input type="hidden" name="playerId" value={player.id} />
              <PlayerFields
                clubs={clubs}
                player={{
                  ...player,
                  email: player.user?.email ?? "",
                  phone: player.user?.phone ?? "",
                  emailVerified: player.user?.emailVerified ?? false,
                  preferredLocale: player.user?.preferredLocale ?? "es",
                  clubId: player.memberships[0]?.clubId ?? ""
                }}
              />
              <button type="submit">Guardar cambios</button>
            </form>
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
};

function PlayerFields({
  clubs,
  player
}: {
  clubs: Array<{ id: string; name: string }>;
  player?: PlayerFieldData;
}) {
  return (
    <>
      <div className="form-row">
        <label>Nombre<input name="firstName" defaultValue={player?.firstName ?? ""} required /></label>
        <label>Apellidos<input name="lastName" defaultValue={player?.lastName ?? ""} required /></label>
      </div>
      <div className="form-row">
        <label>Email<input name="email" type="email" defaultValue={player?.email ?? ""} required /></label>
        <label>Telefono<input name="phone" defaultValue={player?.phone ?? ""} required /></label>
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
          <select name="clubId" defaultValue={player?.clubId ?? ""}>
            <option value="">Sin club</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
      </div>
      <label className="check-line">
        <input name="emailVerified" type="checkbox" defaultChecked={player?.emailVerified ?? false} />
        Email validado
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
