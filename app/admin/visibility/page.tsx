import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { updateEntityActivityAction } from "@/app/admin/actions";
import { SaveConfirmation } from "@/app/leagues/[id]/edit/save-confirmation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { activeClubWhere, isClubEffectivelyActive } from "@/src/lib/entity-activity";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type EntityKind = "players" | "clubs" | "federations";
type StatusFilter = "all" | "active" | "inactive";

type ActivityRow = {
  id: string;
  name: string;
  detail: string | null;
  active: boolean;
  effectiveActive: boolean;
  inheritedInactive: boolean;
  href: string | null;
};

export default async function EntityActivityPage({
  searchParams
}: {
  searchParams?: Promise<{ kind?: string; status?: string; q?: string; saved?: string }>;
}) {
  const query = await searchParams;
  const [currentUser, { t }] = await Promise.all([getCurrentUser(), getDictionary()]);
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const isFederationManager = Boolean(currentUser?.roles.some((role) => role.role === "manager_fed"));
  if (!currentUser || (!isAdmin && !isFederationManager)) notFound();

  const kind: EntityKind = isAdmin && (query?.kind === "players" || query?.kind === "federations")
    ? query.kind
    : "clubs";
  const status: StatusFilter = query?.status === "active" || query?.status === "inactive" ? query.status : "all";
  const search = query?.q?.trim().slice(0, 100) ?? "";
  let rows: ActivityRow[] = [];

  if (kind === "players") {
    const players = await prisma.player.findMany({
      where: {
        mergedIntoPlayerId: null,
        ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
        ...(search ? { OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { user: { is: { email: { contains: search, mode: "insensitive" } } } }
        ] } : {})
      },
      include: { user: { select: { email: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });
    rows = players.map((player) => ({
      id: player.id,
      name: `${player.lastName}, ${player.firstName}`,
      detail: player.user?.email ?? null,
      active: player.active,
      effectiveActive: player.active,
      inheritedInactive: false,
      href: `/players/${player.id}`
    }));
  } else if (kind === "clubs") {
    const clubs = await prisma.club.findMany({
      where: {
        AND: [
          ...(!isAdmin ? [{ federation: { is: { managerUserId: currentUser.id } } }] : []),
          ...(status === "active" ? [activeClubWhere] : status === "inactive" ? [{ NOT: activeClubWhere }] : []),
          ...(search ? [{ OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { city: { contains: search, mode: "insensitive" as const } },
            { federation: { is: { name: { contains: search, mode: "insensitive" as const } } } }
          ] }] : [])
        ]
      },
      include: { federation: { select: { name: true, active: true } } },
      orderBy: [{ name: "asc" }]
    });
    rows = clubs.map((club) => ({
      id: club.id,
      name: club.name,
      detail: [club.city, club.federation?.name].filter(Boolean).join(" · ") || null,
      active: club.active,
      effectiveActive: isClubEffectivelyActive(club),
      inheritedInactive: club.active && club.federation?.active === false,
      href: `/clubs/${club.id}`
    }));
  } else {
    const federations = await prisma.federation.findMany({
      where: {
        ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
        ...(search ? { OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } }
        ] } : {})
      },
      include: { _count: { select: { clubs: true } } },
      orderBy: { name: "asc" }
    });
    rows = federations.map((federation) => ({
      id: federation.id,
      name: federation.name,
      detail: `${federation.code} · ${federation._count.clubs} ${t.clubs}`,
      active: federation.active,
      effectiveActive: federation.active,
      inheritedInactive: false,
      href: null
    }));
  }

  const tabHref = (nextKind: EntityKind) => {
    const params = new URLSearchParams({ kind: nextKind, status });
    if (search) params.set("q", search);
    return `/admin/visibility?${params}`;
  };

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.entityActivity}</h1>
        <p className="muted">{t.entityActivityIntro}</p>
        {isAdmin ? <Link className="secondary-link" href="/admin/settings">{t.applicationSettings}</Link> : null}
        {query?.saved === "1" ? <SaveConfirmation message={t.activitySaved} /> : null}
      </section>

      {isAdmin ? (
        <nav className="activity-tabs" aria-label={t.entityActivity}>
          {(["players", "clubs", "federations"] as const).map((tab) => (
            <Link aria-current={kind === tab ? "page" : undefined} href={tabHref(tab)} key={tab}>
              {t[tab]}
            </Link>
          ))}
        </nav>
      ) : null}

      <form className="activity-filters" method="get">
        <input name="kind" type="hidden" value={kind} />
        <label>
          {t.searchEntities}
          <input defaultValue={search} name="q" placeholder={t.searchEntities} type="search" />
        </label>
        <label>
          {t.allStatuses}
          <select defaultValue={status} name="status">
            <option value="all">{t.allStatuses}</option>
            <option value="active">{t.activeEntities}</option>
            <option value="inactive">{t.inactiveEntities}</option>
          </select>
        </label>
        <button type="submit">{t.filter}</button>
      </form>

      <section aria-label={t[kind]} className="activity-list">
        {rows.length === 0 ? <p className="muted">{t.noEntities}</p> : null}
        {rows.map((row) => (
          <article className="activity-row" key={row.id}>
            <div className="activity-row-main">
              <strong>{row.href ? <Link href={row.href}>{row.name}</Link> : row.name}</strong>
              {row.detail ? <span className="muted">{row.detail}</span> : null}
              {row.inheritedInactive ? <span className="activity-inherited">{t.hiddenByFederation}</span> : null}
            </div>
            <span className={`activity-badge${row.effectiveActive ? " is-active" : ""}`}>
              {row.effectiveActive ? t.activeEntity : t.inactiveEntity}
            </span>
            <form action={updateEntityActivityAction}>
              <input name="entityType" type="hidden" value={kind.slice(0, -1)} />
              <input name="entityId" type="hidden" value={row.id} />
              <input name="active" type="hidden" value={String(!row.active)} />
              <input name="returnKind" type="hidden" value={kind} />
              <input name="returnStatus" type="hidden" value={status} />
              <input name="returnSearch" type="hidden" value={search} />
              <button aria-label={`${row.active ? t.deactivateEntity : t.activateEntity}: ${row.name}`} className="activity-button" title={row.active ? t.deactivateEntity : t.activateEntity} type="submit">
                {row.active ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                <span>{row.active ? t.deactivateEntity : t.activateEntity}</span>
              </button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
