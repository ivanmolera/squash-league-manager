import { redirect } from "next/navigation";
import { savePlayerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

function splitDisplayName(value: string | null | undefined) {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export default async function MyPlayerProfilePage() {
  const [currentUser, dictionary] = await Promise.all([getCurrentUser(), getDictionary()]);
  const { t } = dictionary;

  if (!currentUser) redirect("/login");
  if (currentUser.player) redirect(`/players/${currentUser.player.id}`);

  const existingPlayer = await prisma.player.findFirst({
    where: {
      mergedIntoPlayerId: null,
      userId: currentUser.id
    },
    select: { id: true, userId: true }
  });

  if (existingPlayer) {
    if (!existingPlayer.userId) {
      await prisma.player.update({
        where: { id: existingPlayer.id },
        data: { userId: currentUser.id }
      });
    }
    redirect(`/players/${existingPlayer.id}`);
  }

  const name = splitDisplayName(currentUser.displayName);
  const isAdmin = currentUser.roles.some((role) => role.role === "admin");

  if (isAdmin) {
    const player = await prisma.player.create({
      data: {
        userId: currentUser.id,
        firstName: name.firstName || currentUser.email.split("@")[0],
        lastName: name.lastName || currentUser.email
      },
      select: { id: true }
    });
    redirect(`/players/${player.id}`);
  }

  return (
    <main className="app-shell">
      <Navigation />
      <section className="edit-stack">
        <form className="admin-form" action={savePlayerAction}>
          <h1>{t.createMyProfile}</h1>
          <input type="hidden" name="profilePhotoUrl" value="" />
          <label>{t.firstName}<input name="firstName" defaultValue={name.firstName} required /></label>
          <label>{t.lastName}<input name="lastName" defaultValue={name.lastName} required /></label>
          <label>{t.photo}<input name="profilePhoto" type="file" accept="image/*" /></label>
          <label>{t.email}<input name="email" type="email" defaultValue={currentUser.email} readOnly required /></label>
          <label>{t.phone}<input name="phone" defaultValue={currentUser.phone ?? ""} /></label>
          <label>{t.preferredLocale}
            <select name="preferredLocale" defaultValue={currentUser.preferredLocale ?? "es"}>
              <option value="ca">{t.catalan}</option>
              <option value="es">{t.spanish}</option>
              <option value="en">{t.english}</option>
            </select>
          </label>
          <label>{t.gender}
            <select name="gender" defaultValue="not_specified">
              <option value="male">{t.male}</option>
              <option value="female">{t.female}</option>
              <option value="other">{t.other}</option>
              <option value="not_specified">{t.not_specified}</option>
            </select>
          </label>
          <label>{t.birthDate}<input name="birthDate" type="date" /></label>
          <label>{t.dominantHand}
            <select name="dominantHand" defaultValue="not_specified">
              <option value="right">{t.right}</option>
              <option value="left">{t.left}</option>
              <option value="ambidextrous">{t.ambidextrous}</option>
              <option value="not_specified">{t.not_specified}</option>
            </select>
          </label>
          <label>{t.height}<input name="heightCm" type="number" /></label>
          <label>{t.weight}<input name="weightKg" type="number" step="0.1" /></label>
          <label>{t.racket}<input name="racketBrand" /></label>
          <label className="check-line"><input name="showContactPublic" type="checkbox" defaultChecked /> {t.showContactPublic}</label>
          <label className="check-line"><input name="showPhysicalPublic" type="checkbox" defaultChecked /> {t.showPhysicalPublic}</label>
          <button type="submit">{t.createPlayer}</button>
        </form>
      </section>
    </main>
  );
}
