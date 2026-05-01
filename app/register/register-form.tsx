"use client";

import Link from "next/link";
import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { registerPlayerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

export function RegisterForm({
  labels
}: {
  labels: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    repeatPassword: string;
    register: string;
    registering: string;
    verificationLink: string;
    goToVerification: string;
  };
}) {
  const [state, formAction, isPending] = useActionState(registerPlayerAction, initialState);

  return (
    <form className="auth-form" action={formAction}>
      <label>
        {labels.firstName}
        <input name="firstName" autoComplete="given-name" required />
      </label>
      <label>
        {labels.lastName}
        <input name="lastName" autoComplete="family-name" required />
      </label>
      <label>
        {labels.email}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        {labels.password}
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label>
        {labels.repeatPassword}
        <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="success-message">{state.success}</p> : null}
      {state.verificationUrl ? (
        <div className="warning-box">
          <p>{labels.verificationLink}</p>
          <Link className="secondary-link" href={state.verificationUrl}>{labels.goToVerification}</Link>
        </div>
      ) : null}
      <button type="submit" disabled={isPending}>
        <UserPlus aria-hidden="true" size={18} />
        {isPending ? labels.registering : labels.register}
      </button>
    </form>
  );
}
