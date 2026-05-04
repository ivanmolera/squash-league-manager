"use client";

import { useActionState } from "react";
import type { AccountActionState } from "@/app/account/actions";
import { resetPasswordAction } from "@/app/account/actions";

const initialState: AccountActionState = {};

export function ResetPasswordForm({
  token,
  labels
}: {
  token: string;
  labels: {
    password: string;
    repeatPassword: string;
    submit: string;
    submitting: string;
  };
}) {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);

  return (
    <form className="auth-form" action={formAction}>
      <input name="token" type="hidden" value={token} />
      <label>
        {labels.password}
        <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label>
        {labels.repeatPassword}
        <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="success-message">{state.success}</p> : null}
      <button type="submit" disabled={isPending}>{isPending ? labels.submitting : labels.submit}</button>
    </form>
  );
}
