import { notFound } from "next/navigation";
import { changePlayerPasswordAction, savePlayerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [player, currentUser] = await Promise.all([
    prisma.player.findUnique({ where: { id }, include: { user: true } }),
    getCurrentUser()
  ]);
  if (!player) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin && player.userId !== currentUser?.id) notFound();

  return (
    <main className="app-shell">
      <Navigation />
      <section className="edit-stack">
        <form className="admin-form" action={savePlayerAction}>
          <h1>Editar jugador</h1>
          <input type="hidden" name="playerId" value={player.id} />
          <input type="hidden" name="profilePhotoUrl" value={player.profilePhotoUrl ?? ""} />
          <label>Nombre<input name="firstName" defaultValue={player.firstName} required /></label>
          <label>Apellidos<input name="lastName" defaultValue={player.lastName} required /></label>
          <label>Foto<input name="profilePhoto" type="file" accept="image/*" /></label>
          <label>Email<input name="email" type="email" defaultValue={player.user?.email ?? ""} readOnly={!isAdmin} required /></label>
          <label>Teléfono<input name="phone" defaultValue={player.user?.phone ?? ""} /></label>
          <label>Idioma
            <select name="preferredLocale" defaultValue={player.user?.preferredLocale ?? "es"}>
              <option value="ca">CA</option><option value="es">ES</option><option value="en">EN</option>
            </select>
          </label>
          <label>Sexo
            <select name="gender" defaultValue={player.gender}>
              <option value="male">Masculino</option><option value="female">Femenino</option><option value="other">Otro</option><option value="not_specified">No especificado</option>
            </select>
          </label>
          <label>Mano dominante
            <select name="dominantHand" defaultValue={player.dominantHand}>
              <option value="right">Diestro/a</option><option value="left">Zurdo/a</option><option value="ambidextrous">Ambidiestro/a</option><option value="not_specified">No especificado</option>
            </select>
          </label>
          <label>Altura<input name="heightCm" type="number" defaultValue={player.heightCm ?? ""} /></label>
          <label>Peso<input name="weightKg" type="number" step="0.1" defaultValue={String(player.weightKg ?? "")} /></label>
          <label>Raqueta<input name="racketBrand" defaultValue={player.racketBrand ?? ""} /></label>
          <label className="check-line"><input name="showContactPublic" type="checkbox" defaultChecked={player.showContactPublic} /> Mostrar email/teléfono públicamente</label>
          <label className="check-line"><input name="showPhysicalPublic" type="checkbox" defaultChecked={player.showPhysicalPublic} /> Mostrar altura/peso públicamente</label>
          <label className="check-line"><input name="receivesMatchCommunications" type="checkbox" defaultChecked={player.receivesMatchCommunications} /> Acepto recibir comunicaciones sobre horarios de mis partidos</label>
          {isAdmin ? <label className="check-line"><input name="emailVerified" type="checkbox" defaultChecked={player.user?.emailVerified ?? false} /> Email validado</label> : null}
          <button type="submit">Guardar</button>
        </form>
        {player.userId ? (
          <form className="admin-form" action={changePlayerPasswordAction}>
            <h2>Cambiar contraseña</h2>
            <input type="hidden" name="playerId" value={player.id} />
            {!isAdmin ? <label>Contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" required /></label> : null}
            <label>Nueva contraseña<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label>Repetir nueva contraseña<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <button type="submit">{isAdmin ? "Actualizar contraseña" : "Cambiar contraseña"}</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
