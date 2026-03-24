export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const headers = new Headers(init?.headers || {})
  const res = await fetch(input, { ...init, headers })
  return res
}
