import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// WorkOS sends webhook events here.
// WORKOS_WEBHOOK_SECRET must be set via: npx convex env set WORKOS_WEBHOOK_SECRET "whsec_..."
http.route({
  path: "/workos-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const sigHeader = request.headers.get("WorkOS-Signature");

    if (!sigHeader || !process.env.WORKOS_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const verified = await verifyWebhookSignature(
      body,
      sigHeader,
      process.env.WORKOS_WEBHOOK_SECRET
    );
    if (!verified) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(body) as WorkOSEvent;

    switch (event.event) {
      case "user.created":
        await ctx.runMutation(internal.users.createUserFromWebhook, {
          workosUserId: event.data.id,
          email: event.data.email,
        });
        break;

      case "user.deleted":
        await ctx.runMutation(internal.users.deleteUserFromWebhook, {
          workosUserId: event.data.id,
        });
        break;

      default:
        // Unhandled event types are silently accepted (200) so WorkOS doesn't retry.
        break;
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;

// --- types & helpers ---

type WorkOSEvent =
  | { event: "user.created"; data: { id: string; email: string } }
  | { event: "user.deleted"; data: { id: string } };

async function verifyWebhookSignature(
  body: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  // Header format: "t=<timestamp>,v1=<hex-signature>"
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`)
  );

  const expectedHex = Array.from(new Uint8Array(expected))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison using XOR to avoid timing attacks.
  if (expectedHex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
