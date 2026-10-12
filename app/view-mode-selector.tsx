"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Monitor, MonitorSmartphone, Smartphone } from "lucide-react";
import { setViewModeAction } from "@/app/actions";

export function ViewModeSelector({ mobileLabel, desktopLabel, label }: { mobileLabel: string; desktopLabel: string; label: string }) {
  const pathname = usePathname();
  const previewRef = useRef<HTMLInputElement>(null);
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => setEmbedded(window.self !== window.top), []);
  if (embedded) return null;

  return (
    <details className="nav-view-mode">
      <summary aria-label={label} title={label}><MonitorSmartphone aria-hidden="true" size={18} /></summary>
      <div className="nav-view-mode-options">
        <form action={setViewModeAction}>
          <input name="mode" type="hidden" value="mobile" />
          <input name="returnTo" type="hidden" value={pathname} />
          <input name="preview" ref={previewRef} type="hidden" value="0" />
          <button aria-label={mobileLabel} onClick={() => { if (previewRef.current) previewRef.current.value = window.screen.width > 640 ? "1" : "0"; }} type="submit">
            <Smartphone aria-hidden="true" size={17} /> {mobileLabel}
          </button>
        </form>
        <form action={setViewModeAction}>
          <input name="mode" type="hidden" value="desktop" />
          <input name="returnTo" type="hidden" value={pathname} />
          <button aria-label={desktopLabel} type="submit"><Monitor aria-hidden="true" size={17} /> {desktopLabel}</button>
        </form>
      </div>
    </details>
  );
}
