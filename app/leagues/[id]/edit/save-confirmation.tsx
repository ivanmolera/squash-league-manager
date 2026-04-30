"use client";

import { useEffect, useState } from "react";

export function SaveConfirmation({ message }: { message: string }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return <p className="success-message" role="status">{message}</p>;
}
