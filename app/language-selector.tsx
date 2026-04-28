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
  const locales = [
    { id: "ca", name: "Català", flag: "CAT" },
    { id: "es", name: "Español", flag: "ES" },
    { id: "en", name: "English", flag: "UK" }
  ];

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
      <span className="sr-only">{label}</span>
      <div className="flag-switcher" role="group" aria-label={help}>
        {locales.map((item) => (
          <button
            aria-label={item.name}
            aria-pressed={locale === item.id}
            className={`flag-button flag-${item.id}${locale === item.id ? " is-active" : ""}`}
            key={item.id}
            onClick={() => changeLocale(item.id)}
            title={item.name}
            type="button"
          >
            <span aria-hidden="true">{item.flag}</span>
          </button>
        ))}
      </div>
      {needsConsent ? <span className="locale-warning">{consentMessage}</span> : null}
    </div>
  );
}
