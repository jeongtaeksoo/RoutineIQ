import { z } from "zod";

import { apiFetch, type ApiFetchError, type ApiFetchInit } from "@/lib/api-client";

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
  label = "API response"
): z.infer<TSchema> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");

  const err: ApiFetchError = new Error(`Invalid ${label} format`);
  err.code = "invalid_response";
  err.hint = issues || "Schema mismatch";
  err.status = 502;
  throw err;
}

export async function apiFetchWithSchema<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  init?: ApiFetchInit,
  label?: string
): Promise<z.infer<TSchema>> {
  const data = await apiFetch<unknown>(path, init);
  return parseWithSchema(schema, data, label ?? path);
}
