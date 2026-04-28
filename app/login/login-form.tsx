"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({
  labels
}: {
  labels: { email: string; password: string; signingIn: string; signIn: string };
}) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form className="auth-form" action={formAction}>
      <label>
        {labels.email}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        {labels.password}
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <button type="submit" disabled={isPending}>
        <LogIn aria-hidden="true" size={18} />
        {isPending ? labels.signingIn : labels.signIn}
      </button>
    </form>
  );
}
