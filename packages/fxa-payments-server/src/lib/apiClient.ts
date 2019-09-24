import { Config } from './config';

// TODO: Use a better type here
interface APIFetchOptions {
  [propName: string]: any;
}

type ErrorResponseBody = {
  code?: string;
  statusCode?: number;
  errno?: number;
  error?: string;
  message?: string;
  info?: string;
};

export class APIError extends Error {
  body: ErrorResponseBody | null;
  response: Response | null | undefined;
  code: string | null;
  statusCode: number | null;
  errno: number | null;
  error: string | null;

  constructor(
    body?: ErrorResponseBody,
    response?: Response,
    code?: string,
    errno?: number,
    error?: string,
    statusCode?: number,
    ...params: Array<any>
  ) {
    super(...params);
    this.response = response;
    this.body = body || null;
    this.code = code || null;
    this.statusCode = statusCode || null;
    this.errno = errno || null;
    this.error = error || null;

    if (this.body) {
      const { code, errno, error, message, statusCode } = this.body;
      Object.assign(this, { code, errno, error, message, statusCode });
    }
  }
}

export default class APIClient {
  config: Config;
  accessToken: string;

  constructor(config: Config, accessToken: string) {
    this.config = config;
    this.accessToken = accessToken;
  }

  async fetch(method: string, path: string, options: APIFetchOptions = {}) {
    const response = await fetch(path, {
      mode: 'cors',
      credentials: 'omit',
      method,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        ...(options.headers || {}),
      },
    });
    if (response.status >= 400) {
      let body = {};
      try {
        // Parse the body as JSON, but will fail if things have really gone wrong
        body = await response.json();
      } catch (_) {
        // No-op
      }
      throw new APIError(body, response);
    }
    return response.json();
  }

  get(...args: [string, object?]) {
    return this.fetch('GET', ...args);
  }

  delete(...args: [string, object?]) {
    return this.fetch('DELETE', ...args);
  }

  post(path: string, body: object) {
    return this.fetch('POST', path, { body: JSON.stringify(body) });
  }
}
