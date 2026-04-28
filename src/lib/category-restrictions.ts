type CategoryRestrictions = {
  genderScope: string;
  minAge: number | null;
  maxAge: number | null;
};

export function categoryRestrictionLabel(
  category: CategoryRestrictions,
  labels: { male: string; female: string; other: string; noRestrictions: string }
) {
  const restrictions = [];

  if (category.genderScope === "male") restrictions.push(labels.male);
  if (category.genderScope === "female") restrictions.push(labels.female);
  if (category.genderScope === "other") restrictions.push(labels.other);
  if (category.minAge !== null) restrictions.push(`+${category.minAge}`);
  if (category.maxAge !== null) restrictions.push(`sub${category.maxAge}`);

  return restrictions.length ? restrictions.join(" · ") : labels.noRestrictions;
}
