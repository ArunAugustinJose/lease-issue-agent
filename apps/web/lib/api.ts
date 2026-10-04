export const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, { ...options, cache: 'no-store' });
  } catch {
    throw new Error(
      'Could not reach the property service. Check that the API is running and try again.',
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.message ?? 'This request could not be completed.');
  return data as T;
}
export function fileUrl(path: string) {
  return API.replace(/\/api\/?$/, '') + path;
}
export function patch<T>(path: string, body: object) {
  return api<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
