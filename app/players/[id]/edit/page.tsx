import { notFound } from "next/navigation";
import { changePlayerPasswordAction, savePlayerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { SaveConfirmation } from "./save-confirmation";

export const dynamic = "force-dynamic";

export default async function EditPlayerPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [player, currentUser, dictionary, features] = await Promise.all([
    prisma.player.findUnique({ where: { id }, include: { user: true } }),
    getCurrentUser(),
    getDictionary(),
    getFeatureSettings()
  ]);
  const { t } = dictionary;
  if (!player) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin && player.userId !== currentUser?.id) notFound();

  return (
    <main className="app-shell">
      <Navigation />
      <section className="edit-stack">
        <form className="admin-form" action={savePlayerAction}>
          <h1>{t.myProfile}</h1>
          {query?.saved === "1" ? <SaveConfirmation message={t.savedChanges} /> : null}
          <input type="hidden" name="playerId" value={player.id} />
          <input type="hidden" name="profilePhotoUrl" value={player.profilePhotoUrl ?? ""} />
          <label>{t.firstName}<input name="firstName" defaultValue={player.firstName} required /></label>
          <label>{t.lastName}<input name="lastName" defaultValue={player.lastName} required /></label>
          <label>{t.photo}<input name="profilePhoto" type="file" accept="image/*" /></label>
          <label>{t.email}<input name="email" type="email" defaultValue={player.user?.email ?? ""} readOnly={!isAdmin} required={!isAdmin} /></label>
          <label>{t.phone}<input name="phone" defaultValue={player.user?.phone ?? ""} /></label>
          <label>{t.preferredLocale}
            <select name="preferredLocale" defaultValue={player.user?.preferredLocale ?? "es"}>
              <option value="ca">{t.catalan}</option><option value="es">{t.spanish}</option><option value="en">{t.english}</option>
            </select>
          </label>
          <label>{t.gender}
            <select name="gender" defaultValue={player.gender}>
              <option value="male">{t.male}</option><option value="female">{t.female}</option><option value="other">{t.other}</option><option value="not_specified">{t.not_specified}</option>
            </select>
          </label>
          <label>{t.dominantHand}
            <select name="dominantHand" defaultValue={player.dominantHand}>
              <option value="right">{t.right}</option><option value="left">{t.left}</option><option value="ambidextrous">{t.ambidextrous}</option><option value="not_specified">{t.not_specified}</option>
            </select>
          </label>
          <label>{t.height}<input name="heightCm" type="number" defaultValue={player.heightCm ?? ""} /></label>
          <label>{t.weight}<input name="weightKg" type="number" step="0.1" defaultValue={String(player.weightKg ?? "")} /></label>
          <label>{t.racket}<input name="racketBrand" defaultValue={player.racketBrand ?? ""} /></label>
          <label className="check-line"><input name="showContactPublic" type="checkbox" defaultChecked={player.showContactPublic} /> {t.showContactPublic}</label>
          <label className="check-line"><input name="showPhysicalPublic" type="checkbox" defaultChecked={player.showPhysicalPublic} /> {t.showPhysicalPublic}</label>
          {features.player_communications ? (
            <label className="check-line"><input name="receivesMatchCommunications" type="checkbox" defaultChecked={player.receivesMatchCommunications} /> {t.receiveMatchCommunications}</label>
          ) : null}
          {isAdmin ? <label className="check-line"><input name="emailVerified" type="checkbox" defaultChecked={player.user?.emailVerified ?? false} /> {t.emailVerified}</label> : null}
          <button type="submit">{t.save}</button>
        </form>
        {player.userId ? (
          <form className="admin-form" action={changePlayerPasswordAction}>
            <h2>{t.changePassword}</h2>
            <input type="hidden" name="playerId" value={player.id} />
            {!isAdmin ? <label>{t.currentPassword}<input name="currentPassword" type="password" autoComplete="current-password" required /></label> : null}
            <label>{t.newPassword}<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label>{t.repeatNewPassword}<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <button type="submit">{isAdmin ? t.updatePassword : t.changePassword}</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
