import 'server-only'
import type { OperationDef } from './definitions'
import { API_BASE } from './limits'

/**
 * A `curl` command for an operation, built from its definition: the required
 * parameters with their examples, the token where it is needed, the body
 * where there is one. `$DEMIFY_URL` and `$DEMIFY_API_TOKEN` are for the reader
 * to set, so no address and no secret is ever printed.
 */
export function curlExample(operation: OperationDef): string {
  const path = operation.path.replace(/\{([^}]+)\}/g, (_, name: string) =>
    String(operation.parameters.find((p) => p.in === 'path' && p.name === name)?.example),
  )
  const query = operation.parameters
    .filter((p) => p.in === 'query' && p.required)
    .map((p) => `${p.name}=${encodeURIComponent(String(p.example))}`)
    .join('&')

  const lines = [`curl -sS${operation.method === 'GET' ? '' : ` -X ${operation.method}`} "$DEMIFY_URL${API_BASE}${path}${query ? `?${query}` : ''}"`]
  if (operation.access === 'token') lines.push('-H "Authorization: Bearer $DEMIFY_API_TOKEN"')
  for (const header of operation.parameters.filter((p) => p.in === 'header')) lines.push(`-H "${header.name}: ${header.example}"`)
  if (operation.requestBody) {
    lines.push('-H "Content-Type: application/json"')
    lines.push(`-d '${JSON.stringify(operation.requestBody.example)}'`)
  }
  return lines.join(' \\\n  ')
}
