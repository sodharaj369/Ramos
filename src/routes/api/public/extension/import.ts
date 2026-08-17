/**
 * Extension ingestion endpoint.
 * Public route prefix (external caller: the Chrome extension), but every
 * request must carry a valid Sales Intel bearer token. The user identity is
 * derived from that token — never from the body.
 */
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/public/extension/import")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { authenticateExtensionRequest } = await import("@/lib/extension-auth.server");
        const auth = await authenticateExtensionRequest(request);
        if (!auth) return json({ error: "Unauthorized" }, 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const { extensionImportSchema, importExtensionBatch } = await import(
          "@/lib/extension-import.server"
        );
        const parsed = extensionImportSchema.safeParse(body);
        if (!parsed.success) {
          return json(
            { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
            400,
          );
        }

        try {
          const result = await importExtensionBatch(auth.supabase, auth.userId, parsed.data);
          return json(result);
        } catch (err) {
          return json(
            { error: err instanceof Error ? err.message : "Import failed" },
            500,
          );
        }
      },
    },
  },
});
