import Link from "next/link";

export function AdminSectionTabs({
  active,
  labels
}: {
  active: "settings" | "visibility";
  labels: { settings: string; visibility: string; admin: string };
}) {
  return (
    <nav aria-label={labels.admin} className="activity-tabs admin-section-tabs">
      <Link aria-current={active === "settings" ? "page" : undefined} href="/admin/settings">
        {labels.settings}
      </Link>
      <Link aria-current={active === "visibility" ? "page" : undefined} href="/admin/visibility">
        {labels.visibility}
      </Link>
    </nav>
  );
}
