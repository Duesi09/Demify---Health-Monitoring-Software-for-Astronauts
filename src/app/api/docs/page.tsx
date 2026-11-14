import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import { curlExample } from '@/server/api/curl'
import { OPERATIONS } from '@/server/api/definitions'
import { API_BASE, AUDIT_PAGE, CLIENT_HEADER, MAX_BATCH_READINGS, MAX_BODY_BYTES, WRITE_LIMIT } from '@/server/api/limits'
import { buildOpenApiDocument, SECURITY_SCHEME } from '@/server/api/openapi'
import { PROBLEMS, problemType } from '@/server/api/problem'

export const metadata: Metadata = {
  title: 'HTTP API | Demify',
  description: 'The endpoints of the Demify HTTP API: send readings from a device or a ground system and read back the evaluation.',
}

/*
 * The human-readable reference of the HTTP API, drawn from the OpenAPI
 * document the server generates, so it lists what the server answers and
 * nothing else. It is reached by its address and from docs/api.md, not from
 * the navigation of the monitor: it is for the people who connect systems, not
 * for the crew.
 */

const link = 'text-ink underline decoration-axis underline-offset-4 hover:decoration-ink'
const code = 'rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.85em] text-ink'
const block = 'overflow-x-auto rounded-xl bg-page p-4 font-mono text-xs leading-relaxed text-ink ring-1 ring-edge'

/** The descriptions use a little Markdown: paragraphs, `code`, **strong** and *emphasis*. */
function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split('\n\n').map((paragraph, index) => (
        <p key={index} className={className}>
          {paragraph.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, at) =>
            part.startsWith('`') ? (
              <code key={at} className={code}>
                {part.slice(1, -1)}
              </code>
            ) : part.startsWith('**') ? (
              <strong key={at} className="font-semibold text-ink">
                {part.slice(2, -2)}
              </strong>
            ) : part.startsWith('*') ? (
              <em key={at}>{part.slice(1, -1)}</em>
            ) : (
              <Fragment key={at}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </>
  )
}

function Pill({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide whitespace-nowrap ${
        strong ? 'bg-ink text-page' : 'text-ink-2 ring-1 ring-axis'
      }`}
    >
      {children}
    </span>
  )
}

function typeOf(schema: { type?: string; enum?: readonly unknown[]; minimum?: number; maximum?: number; default?: unknown }): string {
  if (schema.enum) return schema.enum.join(' | ')
  if (schema.type === 'integer') {
    return `whole number, ${schema.minimum} to ${schema.maximum}${schema.default === undefined ? '' : `, default ${String(schema.default)}`}`
  }
  return schema.type ?? ''
}

type Document = ReturnType<typeof buildOpenApiDocument>
type Described = Document['paths'][string][string]

interface Listed {
  path: string
  method: string
  described: Described
}

/** Every operation of the document, in the order the document lists them. */
function operationsOf(document: Document): Listed[] {
  return Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, described]) => ({ path, method: method.toUpperCase(), described })),
  )
}

const anchorOf = (described: Described) => `operation-${described.operationId}`
const needsToken = (described: Described) => described.security.some((scheme) => SECURITY_SCHEME in scheme)

function Endpoint({ path, method, described }: Listed) {
  const parameters = described.parameters ?? []
  // The command line is built from the definition the document entry was generated from.
  const definition = OPERATIONS.find((operation) => operation.id === described.operationId)
  const example = Object.values(described.responses['200']?.content ?? {})[0]?.example
  return (
    <article id={anchorOf(described)} className="card scroll-mt-6 p-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Pill strong>{method}</Pill>
        <h3 className="font-mono text-base font-semibold break-all text-ink">
          {API_BASE}
          {path}
        </h3>
        <Pill>{needsToken(described) ? 'Needs the API token' : 'Open'}</Pill>
      </header>
      <p className="mt-3 text-lg font-semibold tracking-tight">{described.summary}</p>
      <div className="mt-2 flex flex-col gap-2">
        <Prose text={described.description} className="max-w-4xl text-sm leading-relaxed text-ink-2" />
      </div>

      {parameters.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="eyebrow pb-2 text-left">Parameters</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-4 font-normal">
                  Name
                </th>
                <th scope="col" className="py-1.5 pr-4 font-normal">
                  In
                </th>
                <th scope="col" className="py-1.5 pr-4 font-normal">
                  Value
                </th>
                <th scope="col" className="py-1.5 font-normal">
                  Meaning
                </th>
              </tr>
            </thead>
            <tbody>
              {parameters.map((parameter) => (
                <tr key={parameter.name} className="border-t border-grid align-top">
                  <th scope="row" className="py-2 pr-4 font-mono text-xs font-normal whitespace-nowrap text-ink">
                    {parameter.name}
                    <span className="block font-sans text-muted">{parameter.required ? 'required' : 'optional'}</span>
                  </th>
                  <td className="py-2 pr-4 text-ink-2">{parameter.in}</td>
                  <td className="py-2 pr-4 text-ink-2">{typeOf(parameter.schema)}</td>
                  <td className="py-2 text-ink-2">
                    <Prose text={parameter.description} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {definition && (
        <>
          <h4 className="eyebrow mt-5">Try it</h4>
          <pre className={`${block} mt-2`} tabIndex={0} role="region" aria-label="Example request">
            {curlExample(definition)}
          </pre>
        </>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="eyebrow pb-2 text-left">Answers</caption>
          <tbody>
            {Object.entries(described.responses).map(([status, response]) => (
              <tr key={status} className="border-t border-grid align-top">
                <th scope="row" className="w-16 py-2 pr-4 font-mono text-xs font-semibold text-ink tabular-nums">
                  {status}
                </th>
                <td className="py-2 text-ink-2">
                  <Prose text={response.description} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {example !== undefined && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-2">Show an example of the 200 answer</summary>
          <pre className={`${block} mt-2 max-h-96`} tabIndex={0} role="region" aria-label="Example answer">
            {JSON.stringify(example, null, 2)}
          </pre>
        </details>
      )}
    </article>
  )
}

export default function ApiDocsPage() {
  const document = buildOpenApiDocument()
  const operations = operationsOf(document)
  const [about, ...notes] = document.info.description.split('\n\n')
  const faultExample = Object.values(document.paths['/crew/{crewId}/readings']?.post?.responses['400']?.content ?? {})[0]?.example

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="text-4xl font-semibold tracking-tight">
          Demify <span className="text-ink-2">HTTP API</span>
        </p>
        <Link href="/" className="rounded-full bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-ink-2 ring-1 ring-edge transition-colors hover:bg-white/[0.1] hover:text-ink">
          Back to the monitor
        </Link>
      </header>

      <main className="flex min-w-0 flex-col gap-5">
        <section aria-labelledby="about" className="card p-6">
          <p className="eyebrow">
            Version {document.info.version} | base address {API_BASE}
          </p>
          <h1 id="about" className="mt-2 text-3xl font-semibold tracking-tight">
            Connect devices and ground systems
          </h1>
          <Prose text={about} className="mt-3 max-w-4xl text-lg leading-snug text-ink-2" />
          <div className="mt-4 flex max-w-4xl flex-col gap-3">
            {notes.map((note) => (
              <Prose key={note} text={note} className="text-sm leading-relaxed text-ink-2" />
            ))}
          </div>
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href={`${API_BASE}/openapi.json`} className={link}>
              OpenAPI 3.1 document
            </a>
            <a href={`${API_BASE}/status`} className={link}>
              Status of this server
            </a>
            <a href={`${API_BASE}/metrics-catalog`} className={link}>
              Indicator catalogue
            </a>
          </p>
        </section>

        <nav aria-labelledby="contents" className="card p-6">
          <h2 id="contents" className="eyebrow">
            Endpoints
          </h2>
          <ul className="mt-3 flex flex-col">
            {operations.map(({ path, method, described }) => (
              <li key={described.operationId} className="border-t border-grid first:border-t-0">
                <a href={`#${anchorOf(described)}`} className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="w-12 font-mono text-xs font-semibold text-ink">{method}</span>
                  <span className="font-mono text-ink underline decoration-axis underline-offset-4 group-hover:decoration-ink">
                    {API_BASE}
                    {path}
                  </span>
                  <span className="text-ink-2">{described.summary}</span>
                  <span className="ml-auto text-xs text-muted">{needsToken(described) ? 'token' : 'open'}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {document.tags.map((tag, index) => (
          <section key={tag.name} aria-labelledby={`tag-${index}`} className="flex flex-col gap-5">
            <div className="px-1 pt-3">
              <h2 id={`tag-${index}`} className="text-2xl font-semibold tracking-tight">
                {tag.name}
              </h2>
              <p className="mt-1 text-sm text-ink-2">{tag.description}</p>
            </div>
            {operations
              .filter(({ described }) => described.tags.some((name) => name === tag.name))
              .map((listed) => (
                <Endpoint key={listed.described.operationId} {...listed} />
              ))}
          </section>
        ))}

        <section aria-labelledby="errors" className="card p-6">
          <h2 id="errors" className="text-2xl font-semibold tracking-tight">
            Errors
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-ink-2">
            Every error is a problem document (RFC 9457) sent as <code className={code}>application/problem+json</code>. Its{' '}
            <code className={code}>type</code> is the address of one of the entries below, <code className={code}>detail</code> says what
            went wrong in this request, and a 400 lists every fault it found under <code className={code}>errors</code>, each with where it
            is (<code className={code}>in</code>, <code className={code}>field</code>) and what is wrong.
          </p>
          <pre className={`${block} mt-3`} tabIndex={0} role="region" aria-label="Example error">
            {JSON.stringify(faultExample, null, 2)}
          </pre>
          <dl className="mt-4 flex flex-col">
            {Object.entries(PROBLEMS).map(([kind, problem]) => (
              <div key={kind} id={`problem-${problem.slug}`} className="scroll-mt-6 border-t border-grid py-3 sm:grid sm:grid-cols-[4rem_14rem_1fr] sm:gap-4">
                <dt className="font-mono text-xs font-semibold text-ink tabular-nums sm:pt-0.5">{problem.status}</dt>
                <dd className="text-sm font-semibold text-ink">
                  {problem.title}
                  <span className="block font-mono text-xs font-normal break-all text-muted">{problemType(kind as keyof typeof PROBLEMS)}</span>
                </dd>
                <dd className="mt-1 text-sm text-ink-2 sm:mt-0">
                  <Prose text={problem.meaning} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="limits" className="card p-6">
          <h2 id="limits" className="text-2xl font-semibold tracking-tight">
            Limits
          </h2>
          <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Request body', `${MAX_BODY_BYTES / 1024} KiB at most`],
              ['Readings in one batch', `1 to ${MAX_BATCH_READINGS}`],
              [
                'Write requests',
                `${WRITE_LIMIT.requests} per ${WRITE_LIMIT.windowSeconds} seconds for each ${CLIENT_HEADER} name, counted in memory by each server process`,
              ],
              ['Audit entries in one page', `${AUDIT_PAGE.default} by default, ${AUDIT_PAGE.max} at most`],
            ].map(([name, value]) => (
              <div key={name} className="border-t border-grid pt-3">
                <dt className="text-ink-2">{name}</dt>
                <dd className="mt-0.5 text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="pt-2 text-xs text-muted">
        <p>
          Prototype for the NASA Space Apps Challenge. Mission data is simulated. Reference ranges are demo defaults and not medical
          advice. The guide with a walk-through is docs/api.md in the source repository.
        </p>
      </footer>
    </div>
  )
}
