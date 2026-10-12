"use client";

import { useRef } from "react";
import { Monitor, Smartphone } from "lucide-react";

export function MobileViewFrame({ initialPath, mobileLabel, desktopLabel }: { initialPath: string; mobileLabel: string; desktopLabel: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  function returnToDesktop() {
    let path = initialPath;
    try {
      const location = frame.current?.contentWindow?.location;
      if (location) path = `${location.pathname}${location.search}`;
    } catch {
      // The current frame may have navigated to an external site.
    }
    window.location.assign(path.startsWith("/view/mobile") ? "/" : path);
  }

  return (
    <main className="mobile-view-shell">
      <div className="mobile-view-toolbar">
        <strong>SquashFlow</strong>
        <span><Smartphone aria-hidden="true" size={17} /> {mobileLabel}</span>
        <button onClick={returnToDesktop} type="button" title={desktopLabel}><Monitor aria-hidden="true" size={17} /> {desktopLabel}</button>
      </div>
      <iframe ref={frame} src={initialPath} title="SquashFlow mobile" />
    </main>
  );
}
