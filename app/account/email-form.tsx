"use client";

import { useActionState } from "react";
import type { AccountActionState } from "@/app/account/actions";

const initialState: AccountActionState = {};

export function EmailRequestForm({
  action,
  labels
}: {
  action: (state: AccountActionState, formData: FormData) => Promise<AccountActionState>;
  labels: {
    email: string;
    submit: string;
    submitting: string;
  };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form className="auth-form" action={formAction}>
      <label>
        {labels.email}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="success-message">{state.success}</p> : null}
      <button type="submit" disabled={isPending}>{isPending ? labels.submitting : labels.submit}</button>
    </form>
  );
}
