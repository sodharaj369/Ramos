import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  handleCancelJob,
  handleCreateDiscoveryJob,
  handleCreateImportJob,
  handleCreateVerificationJob,
  handleGetJob,
  handleListJobs,
  handleListProviders,
  handleRunJobBatch,
} from "@/lib/jobs.handlers.server";

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => handleListProviders());

export const createDiscoveryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceId: z.string().min(1),
        query: z.string().min(2),
        location: z.string().nullish(),
        industry: z.string().nullish(),
        keyword: z.string().nullish(),
        requireWebsite: z.boolean().optional(),
        requirePhone: z.boolean().optional(),
        requireEmail: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    handleCreateDiscoveryJob(context.supabase, context.userId, data),
  );

export const createImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        label: z.string().min(1),
        rows: z
          .array(z.object({ company_name: z.string().min(1) }).passthrough())
          .min(1)
          .max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    handleCreateImportJob(context.supabase, context.userId, data),
  );

export const createVerificationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        label: z.string().min(1),
        provider: z.string().nullish(),
        items: z
          .array(z.object({ email: z.string().min(3), lead_id: z.string().uuid().optional() }))
          .min(1)
          .max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    handleCreateVerificationJob(context.supabase, context.userId, data),
  );

export const runJobBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) =>
    handleRunJobBatch(context.supabase, context.userId, data.jobId),
  );

export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => handleGetJob(context.supabase, data.jobId));

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => handleListJobs(context.supabase));

export const cancelJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => handleCancelJob(context.supabase, data.jobId));
