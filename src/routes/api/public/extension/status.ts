/** Lightweight connectivity/session check used by the extension. */
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};

export const Route = createFileRoute("/api/public/extension/status")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const { authenticateExtensionRequest } = await import("@/lib/extension-auth.server");
        const auth = await authenticateExtensionRequest(request);
        return new Response(JSON.stringify({ authenticated: Boolean(auth) }), {
          status: auth ? 200 : 401,
          headers: { "content-type": "application/json", ...CORS },
        });
      },
    },
  },
});
