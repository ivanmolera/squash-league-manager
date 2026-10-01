"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeSelector({
  initialTheme,
  lightLabel,
  darkLabel,
  consentMessage
}: {
  initialTheme: Theme;
  lightLabel: string;
  darkLabel: string;
  consentMessage: string;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [needsConsent, setNeedsConsent] = useState(false);

  useEffect(() => {
    const onConsent = () => setNeedsConsent(false);
    window.addEventListener("slm-cookie-consent", onConsent);
    return () => window.removeEventListener("slm-cookie-consent", onConsent);
  }, []);

  function changeTheme(nextTheme: Theme) {
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);

    if (document.cookie.split("; ").some((cookie) => cookie.startsWith("slm_cookies_accepted=true"))) {
      document.cookie = `slm_theme=${nextTheme}; Max-Age=31536000; Path=/; SameSite=Lax`;
      setNeedsConsent(false);
    } else {
      setNeedsConsent(true);
    }
  }

  return (
    <div className="theme-selector">
      <div className="theme-options" role="group" aria-label={`${lightLabel} / ${darkLabel}`}>
        <button type="button" aria-label={lightLabel} aria-pressed={theme === "light"} title={lightLabel} onClick={() => changeTheme("light")}>
          <Sun aria-hidden="true" size={16} />
        </button>
        <button type="button" aria-label={darkLabel} aria-pressed={theme === "dark"} title={darkLabel} onClick={() => changeTheme("dark")}>
          <Moon aria-hidden="true" size={16} />
        </button>
      </div>
      {needsConsent ? <span className="theme-warning" role="status">{consentMessage}</span> : null}
    </div>
  );
}
