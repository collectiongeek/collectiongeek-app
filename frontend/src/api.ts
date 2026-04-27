const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export async function fetchHealthz(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/healthz`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
