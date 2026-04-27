import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Squash League Manager</p>
        <h1>Acceso</h1>
        <p className="muted">
          Entra con el usuario de pruebas para verificar el primer despliegue.
        </p>
        <LoginForm />
        <Link className="back-link" href="/">
          Volver a la consulta publica
        </Link>
      </section>
    </main>
  );
}
