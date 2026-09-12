/** fetch a las API routes propias: JSON de ida y vuelta, y el mensaje de error del servidor. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const hasJson = init?.json !== undefined;
  const response = await fetch(path, {
    ...init,
    method: init?.method ?? (hasJson ? "POST" : "GET"),
    headers: hasJson ? { "content-type": "application/json" } : init?.headers,
    body: hasJson ? JSON.stringify(init.json) : init?.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Error ${response.status}`);
  return data as T;
}
