import type { State } from './models';
export class ApiError extends Error {}
export async function api<T = State>(path: string, body?: unknown) {
  const response = await fetch(
    '/api/' + path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new ApiError(data.error || 'Не удалось выполнить запрос');
  return data;
}
