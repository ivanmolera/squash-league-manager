export const dynamic = "force-static";

export function GET() {
  return new Response("User-agent: *\nAllow: /\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8"
    }
  });
}
