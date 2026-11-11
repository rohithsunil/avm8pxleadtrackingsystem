export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields; // { fieldName: 'message' } for form errors
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }
}

// Turn a failed zod parse into a 400 with per-field messages.
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] ?? '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  throw new HttpError(400, 'Please check the highlighted fields', fields);
}

export const isoDate = /^\d{4}-\d{2}-\d{2}$/;
