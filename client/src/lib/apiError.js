/**
 * Normalises anything axios throws into a shape the UI can render.
 *
 * The API always answers failures with { error: { code, message, details? } }, where details
 * is keyed by request path ("body.email"). `fieldErrors` strips the prefix so it can be fed
 * straight into react-hook-form's setError.
 */
export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }

  /** { email: 'Use your college email.' } — ready for setError(name, { message }). */
  get fieldErrors() {
    if (!this.details) return {};
    return Object.fromEntries(
      Object.entries(this.details).map(([path, message]) => [
        path.replace(/^(body|query|params)\./, ''),
        message,
      ])
    );
  }
}

export function toApiError(error) {
  if (error instanceof ApiError) return error;

  const payload = error?.response?.data?.error;
  if (payload) {
    return new ApiError({
      status: error.response.status,
      code: payload.code ?? 'UNKNOWN',
      message: payload.message ?? 'Something went wrong.',
      details: payload.details,
    });
  }

  if (error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED') {
    return new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  return new ApiError({
    status: error?.response?.status ?? 0,
    code: 'UNKNOWN',
    message: 'Something went wrong. Try again.',
  });
}
