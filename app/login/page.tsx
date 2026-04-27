import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Squash League Manager</p>
        <h1>Acceso</h1>
        <p className="muted">
          Entra con el usuario de pruebas para verificar el primer despliegue.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
