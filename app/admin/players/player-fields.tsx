export type PlayerFieldData = {
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

export function PlayerFields({
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
        <label>{labels.email}<input name="email" type="email" defaultValue={player?.email ?? currentUserEmail ?? ""} readOnly={!isAdmin} required={!isAdmin} /></label>
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
