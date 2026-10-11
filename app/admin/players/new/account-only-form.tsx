"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createAccountOnlyAction, type CreateAccountOnlyState } from "./actions";

const initialState: CreateAccountOnlyState = {};

export function AccountOnlyForm({ labels }: { labels: Record<string, string> }) {
  const [state, formAction, isPending] = useActionState(createAccountOnlyAction, initialState);

  if (state.success) {
    return (
      <div className="admin-form" role="status">
        <p className="success-message">{state.success}</p>
        {state.invitationUrl ? <Link className="secondary-link" href={state.invitationUrl}>{labels.activateAccount}</Link> : null}
        <Link className="secondary-link" href="/admin/players/new?type=account">{labels.createAnotherAccount}</Link>
      </div>
    );
  }

  return (
    <form className="admin-form" action={formAction}>
      <p className="muted">{labels.accountOnlyIntro}</p>
      <div className="form-row">
        <label>{labels.firstName}<input name="firstName" autoComplete="given-name" defaultValue={state.values?.firstName ?? ""} required /></label>
        <label>{labels.lastName}<input name="lastName" autoComplete="family-name" defaultValue={state.values?.lastName ?? ""} required /></label>
      </div>
      <label>{labels.email}<input name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? ""} required /></label>
      <label>{labels.activeRole}
        <select name="role" defaultValue={state.values?.role ?? "player"}>
          <option value="player">{labels.player}</option>
          <option value="manager">{labels.manager}</option>
          <option value="manager_fed">{labels.federationManager}</option>
        </select>
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" disabled={isPending}>{isPending ? labels.creatingAccount : labels.createAccount}</button>
    </form>
  );
}
