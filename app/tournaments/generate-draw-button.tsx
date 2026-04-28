"use client";

export function GenerateDrawButton({
  registrationDeadline,
  message,
  label
}: {
  registrationDeadline: string;
  message: string;
  label: string;
}) {
  return (
    <button
      type="submit"
      name="mode"
      value="generate"
      onClick={(event) => {
        const deadline = new Date(`${registrationDeadline}T23:59:59`);
        if (deadline >= new Date() && !window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
