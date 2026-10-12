"use client";

import { usePathname } from "next/navigation";
import { Eye, ShieldCheck } from "lucide-react";
import { setPlayerPreviewAction } from "@/app/actions";

export function AdminViewToggle({ preview, playerLabel, adminLabel }: { preview: boolean; playerLabel: string; adminLabel: string }) {
  const pathname = usePathname();
  const label = preview ? adminLabel : playerLabel;

  return (
    <form action={setPlayerPreviewAction}>
      <input name="preview" type="hidden" value={preview ? "0" : "1"} />
      <input name="returnTo" type="hidden" value={pathname} />
      <button aria-label={label} aria-pressed={preview} className={`nav-view-toggle${preview ? " is-active" : ""}`} title={label} type="submit">
        {preview ? <ShieldCheck aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
      </button>
    </form>
  );
}
