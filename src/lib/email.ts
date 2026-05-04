import "server-only";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type SendEmailResult = {
  sent: boolean;
  provider: "resend" | "development";
};

const resendEndpoint = "https://api.resend.com/emails";

export function appBaseUrl() {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "SquashFlow <no-reply@squashflow.com>";

  if (!apiKey) {
    return { sent: false, provider: "development" };
  }

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend email failed with status ${response.status}: ${errorText}`);
  }

  return { sent: true, provider: "resend" };
}
