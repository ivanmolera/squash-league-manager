"use client";

import type { MouseEvent, ReactNode } from "react";

export function BracketLinks({ children }: { children: ReactNode }) {
  function revealMatch(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest<HTMLAnchorElement>("a.bracket-match-link[href^='#match-']");
    if (!link) return;

    const match = document.getElementById(link.hash.slice(1));
    const details = match?.closest("details");
    if (details) details.open = true;
  }

  return <div className="bracket-list" onClick={revealMatch}>{children}</div>;
}
