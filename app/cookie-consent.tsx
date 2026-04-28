"use client";

import { useEffect, useState } from "react";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function hasCookieConsent() {
  return document.cookie.split("; ").some((cookie) => cookie.startsWith("slm_cookies_accepted=true"));
}

export function CookieConsent({
  title,
  text,
  accept
}: {
  title: string;
  text: string;
  accept: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasCookieConsent());
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <section className="cookie-banner" aria-label={title}>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          setCookie("slm_cookies_accepted", "true");
          setVisible(false);
        }}
      >
        {accept}
      </button>
    </section>
  );
}
