"use client";

import { useState } from "react";
import type { Locale } from "@/src/lib/i18n";

function hasCookieConsent() {
  return document.cookie.split("; ").some((cookie) => cookie.startsWith("slm_cookies_accepted=true"));
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

export function LanguageSelector({
  locale,
  label,
  help,
  consentMessage
}: {
  locale: Locale;
  label: string;
  help: string;
  consentMessage: string;
}) {
  const [needsConsent, setNeedsConsent] = useState(false);

  function changeLocale(nextLocale: string) {
    if (!hasCookieConsent()) {
      setNeedsConsent(true);
      return;
    }

    setCookie("slm_locale", nextLocale);
    window.location.reload();
  }

  return (
    <div className="locale-form">
      <label>
        <span className="sr-only">{label}</span>
        <select aria-label={help} defaultValue={locale} onChange={(event) => changeLocale(event.target.value)}>
          <option value="ca">CA</option>
          <option value="es">ES</option>
          <option value="en">EN</option>
        </select>
      </label>
      {needsConsent ? <span className="locale-warning">{consentMessage}</span> : null}
    </div>
  );
}
