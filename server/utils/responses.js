/**
 * utils/responses.js — one JSON shape for every response.
 *
 * WHY THIS EXISTS
 * A REST API should answer with the same structure every time, so the
 * frontend can have ONE code path for "did it work?" and "show the error".
 *
 * Success: { "success": true,  "data": ... }
 * Error:   { "success": false, "message": "...", "errors": [ ... ] }
 */
export function ok(res, data = null, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function created(res, data = null) {
  return ok(res, data, 201);
}

export function fail(res, message, status = 400, errors = undefined) {
  return res.status(status).json(errors ? { success: false, message, errors } : { success: false, message });
}
