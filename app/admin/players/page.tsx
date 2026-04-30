import Link from "next/link";
import { savePlayerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const [players, clubs, currentUser, dictionary] = await Promise.all([
    prisma.player.findMany({
      include: {
        user: true,
        memberships: {
          where: { toDate: null },
          include: { club: true },
          orderBy: { fromDate: "desc" },
          take: 1
        }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const ownPlayerId = players.find((player) => player.userId === currentUser?.id)?.id;
  const canCreateOwnProfile = Boolean(currentUser && !ownPlayerId);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.players}</h1>
        <p className="muted">{t.playerProfileIntro}</p>
      </section>

      <section className="work-grid">
        {isAdmin || canCreateOwnProfile ? (
          <form className="admin-form" action={savePlayerAction}>
            <h2>{isAdmin ? t.newProfile : t.createMyProfile}</h2>
            <PlayerFields clubs={clubs} currentUserEmail={currentUser?.email} isAdmin={isAdmin} labels={t} />
            <button type="submit">{t.createPlayer}</button>
          </form>
        ) : (
          <section className="list-panel quiet-panel">
            <p className="muted">{t.signInToEditProfile}</p>
          </section>
        )}

        <div className="list-panel">
          <h2>{t.playerList}</h2>
          {players.map((player) => {
            const clubName = player.memberships[0]?.clubNameAtThatTime ?? t.independent;

            return isAdmin || player.id === ownPlayerId ? (
              <article className="row-card" key={player.id}>
                <strong><Link href={`/players/${player.id}`}>{player.lastName}, {player.firstName}</Link></strong>
                <span>{clubName}</span>
                <Link className="secondary-link" href={`/players/${player.id}/edit`}>{t.edit}</Link>
              </article>
            ) : (
              <article className="row-card simple-row" key={player.id}>
                <strong><Link href={`/players/${player.id}`}>{player.lastName}, {player.firstName}</Link></strong>
                <span>{clubName}</span>
              </article>
            );
          })}
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
  profilePhotoUrl?: string | null;
  clubId?: string;
  showContactPublic?: boolean;
  showPhysicalPublic?: boolean;
  receivesMatchCommunications?: boolean;
};

function PlayerFields({
  clubs,
  currentUserEmail,
  isAdmin,
  labels,
  player
}: {
  clubs: Array<{ id: string; name: string }>;
  currentUserEmail?: string;
  isAdmin: boolean;
  labels: Record<string, string>;
  player?: PlayerFieldData;
}) {
  return (
    <>
      <div className="form-row">
        <label>{labels.firstName}<input name="firstName" defaultValue={player?.firstName ?? ""} required /></label>
        <label>{labels.lastName}<input name="lastName" defaultValue={player?.lastName ?? ""} required /></label>
      </div>
      <input type="hidden" name="profilePhotoUrl" value={player?.profilePhotoUrl ?? ""} />
      <label>{labels.photo}<input name="profilePhoto" type="file" accept="image/*" /></label>
      <div className="form-row">
        <label>{labels.email}<input name="email" type="email" defaultValue={player?.email ?? currentUserEmail ?? ""} readOnly={!isAdmin} required /></label>
        <label>{labels.phone}<input name="phone" defaultValue={player?.phone ?? ""} /></label>
      </div>
      <div className="form-row">
        <label>{labels.preferredLocale}
          <select name="preferredLocale" defaultValue={player?.preferredLocale ?? "es"}>
            <option value="ca">{labels.catalan}</option>
            <option value="es">{labels.spanish}</option>
            <option value="en">{labels.english}</option>
          </select>
        </label>
        <label>{labels.club}
          <select name="clubId" defaultValue={player?.clubId ?? ""} disabled={!isAdmin}>
            <option value="">{labels.noClub}</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
      </div>
      <label className="check-line">
        <input name="emailVerified" type="checkbox" defaultChecked={player?.emailVerified ?? false} disabled={!isAdmin} />
        {labels.emailVerified}
      </label>
      <label className="check-line">
        <input name="showContactPublic" type="checkbox" defaultChecked={player?.showContactPublic ?? true} />
        {labels.showContactPublic}
      </label>
      <label className="check-line">
        <input name="showPhysicalPublic" type="checkbox" defaultChecked={player?.showPhysicalPublic ?? true} />
        {labels.showPhysicalPublic}
      </label>
      <label className="check-line">
        <input name="receivesMatchCommunications" type="checkbox" defaultChecked={player?.receivesMatchCommunications ?? false} />
        {labels.receiveMatchCommunications}
      </label>
      <div className="form-row">
        <label>{labels.gender}
          <select name="gender" defaultValue={player?.gender ?? "not_specified"}>
            <option value="male">{labels.male}</option>
            <option value="female">{labels.female}</option>
            <option value="other">{labels.other}</option>
            <option value="not_specified">{labels.not_specified}</option>
          </select>
        </label>
        <label>{labels.dominantHand}
          <select name="dominantHand" defaultValue={player?.dominantHand ?? "not_specified"}>
            <option value="right">{labels.right}</option>
            <option value="left">{labels.left}</option>
            <option value="ambidextrous">{labels.ambidextrous}</option>
            <option value="not_specified">{labels.not_specified}</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>{labels.heightCm}<input name="heightCm" type="number" defaultValue={player?.heightCm ?? ""} /></label>
        <label>{labels.weightKg}<input name="weightKg" type="number" step="0.1" defaultValue={String(player?.weightKg ?? "")} /></label>
      </div>
      <label>{labels.racketBrand}<input name="racketBrand" defaultValue={player?.racketBrand ?? ""} /></label>
    </>
  );
}
