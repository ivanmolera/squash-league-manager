"use client";

import { useActionState } from "react";
import { createResponsibleAction, type CreateResponsibleState } from "./actions";

const initialState: CreateResponsibleState = {};

export function ResponsibleForm({ labels }: { labels: Record<string, string> }) {
  const [state, formAction, isPending] = useActionState(createResponsibleAction, initialState);

  return (
    <form className="admin-form" action={formAction}>
      <p className="muted">{labels.responsibleOnlyIntro}</p>
      <div className="form-row">
        <label>{labels.firstName}<input name="firstName" autoComplete="given-name" defaultValue={state.values?.firstName ?? ""} required /></label>
        <label>{labels.lastName}<input name="lastName" autoComplete="family-name" defaultValue={state.values?.lastName ?? ""} required /></label>
      </div>
      <div className="form-row">
        <label>{labels.email}<input name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? ""} /></label>
        <label>{labels.phone}<input name="phone" autoComplete="tel" defaultValue={state.values?.phone ?? ""} /></label>
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" disabled={isPending}>{labels.createResponsible}</button>
    </form>
  );
}
