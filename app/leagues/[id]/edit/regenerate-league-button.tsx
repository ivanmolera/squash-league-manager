"use client";

export function RegenerateLeagueButton({ confirmMessage, label }: { confirmMessage: string; label: string }) {
  return (
    <button
      className="danger-button"
      name="mode"
      type="submit"
      value="regenerate"
      onClick={(event) => {
        const confirmed = window.confirm(confirmMessage);

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
