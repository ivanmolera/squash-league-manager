"use client";

export function RegenerateLeagueButton() {
  return (
    <button
      className="danger-button"
      name="mode"
      type="submit"
      value="regenerate"
      onClick={(event) => {
        const confirmed = window.confirm(
          "Regenerar las jornadas borrará el calendario y los partidos actuales de esta liga. ¿Seguro que quieres continuar?"
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      Regenerar jornadas
    </button>
  );
}
