"use client";

export function GenerateDrawButton({
  registrationDeadline,
  earlyDeadlineMessage,
  noSeedsMessage,
  continueMessage,
  label
}: {
  registrationDeadline: string;
  earlyDeadlineMessage: string;
  noSeedsMessage: string;
  continueMessage: string;
  label: string;
}) {
  return (
    <button
      type="submit"
      name="mode"
      value="generate"
      onClick={(event) => {
        const form = event.currentTarget.form;
        const formData = form ? new FormData(form) : null;
        const deadlineValue = formData?.get("registrationDeadline")?.toString() || registrationDeadline;
        const deadline = new Date(`${deadlineValue}T23:59:59`);
        const selectedSeeds = formData?.getAll("seedPlayerIds").filter(Boolean).length ?? 0;
        const warnings = [];

        if (deadline >= new Date()) {
          warnings.push(earlyDeadlineMessage);
        }

        if (selectedSeeds === 0) {
          warnings.push(noSeedsMessage);
        }

        if (warnings.length > 0 && !window.confirm(`${warnings.join("\n\n")}\n\n${continueMessage}`)) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
