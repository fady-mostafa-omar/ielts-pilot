// All calls go to app://ui/api/..., which the Electron main process forwards to the
// local backend and signs with the launch token. The renderer never sees the token.

export interface Health {
  status: string;
  version: string;
  schema_revision: string | null;
  data_dir: string;
}

export interface StoredValue {
  value: string | null;
  updated_at: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`api/v1/${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => request<Health>("health"),
  getValue: () => request<StoredValue>("spike/value"),
  putValue: (value: string) =>
    request<StoredValue>("spike/value", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value }),
    }),
};
