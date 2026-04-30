import { ArrowUp } from "lucide-react";
import { getDictionary } from "@/src/lib/i18n";

export async function BackToTopButton() {
  const { t } = await getDictionary();

  return (
    <a className="back-to-top" href="#page-top" aria-label={t.backToTop} title={t.backToTopShort}>
      <ArrowUp aria-hidden="true" size={22} />
    </a>
  );
}
