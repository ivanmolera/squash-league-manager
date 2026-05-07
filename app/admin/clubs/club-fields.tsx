import { ClubCrest } from "@/src/components/club-crest";
import { formatUserManagerName } from "@/src/lib/names";

export function ClubFields({
  club,
  managers,
  federations,
  isAdmin,
  labels
}: {
  club?: { name?: string; city?: string | null; province?: string | null; address?: string | null; postalCode?: string | null; availableCourts?: number; phone?: string | null; managesCourtBookings?: boolean; publicCourtAccess?: boolean; websiteUrl?: string | null; logoUrl?: string | null; managerUserId?: string | null; federationId?: string | null; showContactPublic?: boolean; closedDays?: Array<{ closedOn: Date }> };
  managers: Array<{ id: string; email: string; displayName: string | null; player?: { firstName: string; lastName: string } | null }>;
  federations: Array<{ id: string; name: string; code: string }>;
  isAdmin: boolean;
  labels: Record<string, string>;
}) {
  return (
    <>
      <div className="club-logo-edit-row">
        <ClubCrest logoUrl={club?.logoUrl} clubName={club?.name ?? "Club"} size="small" />
        <label>{labels.logo}<input name="clubLogo" type="file" accept="image/*" /></label>
      </div>
      <label>{labels.name}<input name="name" defaultValue={club?.name ?? ""} required /></label>
      <div className="form-row">
        <label>{labels.city}<input name="city" defaultValue={club?.city ?? ""} /></label>
        <label>{labels.province}<input name="province" defaultValue={club?.province ?? ""} /></label>
      </div>
      <label>{labels.postalCode}<input name="postalCode" defaultValue={club?.postalCode ?? ""} /></label>
      <label>{labels.availableCourts}<input name="availableCourts" type="number" min="0" defaultValue={club?.availableCourts ?? 0} /></label>
      <label className="check-line">
        <input name="managesCourtBookings" type="checkbox" defaultChecked={club?.managesCourtBookings ?? false} />
        {labels.manageCourtBookingsWithApp}
      </label>
      <label className="check-line">
        <input name="publicCourtAccess" type="checkbox" defaultChecked={club?.publicCourtAccess ?? true} />
        {labels.publicCourtAccess}
      </label>
      <div className="form-row">
        <label>{labels.clubPhone}<input name="phone" type="tel" defaultValue={club?.phone ?? ""} /></label>
        <label>{labels.website}<input name="websiteUrl" type="url" defaultValue={club?.websiteUrl ?? ""} /></label>
      </div>
      <div className="form-row">
        <label>{labels.address}<input name="address" defaultValue={club?.address ?? ""} /></label>
        <label>{labels.closedDays}<textarea name="closedDays" defaultValue={club?.closedDays?.map((day) => day.closedOn.toISOString().slice(0, 10)).join("\n") ?? ""} placeholder="2026-01-01" /></label>
      </div>
      <label>{labels.assignedManager}
        <select name="managerUserId" defaultValue={club?.managerUserId ?? ""} disabled={!isAdmin}>
          <option value="">{labels.noManager}</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {formatUserManagerName(manager)}
            </option>
          ))}
        </select>
      </label>
      <label>{labels.federation}
        <select name="federationId" defaultValue={club?.federationId ?? ""} disabled={!isAdmin}>
          <option value="">{labels.noFederation}</option>
          {federations.map((federation) => (
            <option key={federation.id} value={federation.id}>
              {federation.name} ({federation.code})
            </option>
          ))}
        </select>
      </label>
      <label className="check-line">
        <input name="showContactPublic" type="checkbox" defaultChecked={club?.showContactPublic ?? true} />
        {labels.showClubContactPublic}
      </label>
    </>
  );
}
