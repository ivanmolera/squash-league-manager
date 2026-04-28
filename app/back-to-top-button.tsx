import { ArrowUp } from "lucide-react";

export function BackToTopButton() {
  return (
    <a className="back-to-top" href="#page-top" aria-label="Volver al inicio de la página" title="Volver arriba">
      <ArrowUp aria-hidden="true" size={22} />
    </a>
  );
}
