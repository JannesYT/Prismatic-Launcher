import type { ReactNode } from 'react'
import { call } from './ipc'

/**
 * A small Markdown renderer that produces React elements.
 *
 * Deliberately not `dangerouslySetInnerHTML` with a Markdown-to-HTML library:
 * news can come from a subscribed feed, which is content the launcher does not
 * control. Building elements directly means there is no path from a feed to
 * executable markup — the worst a hostile post can do is look odd.
 *
 * Supports what a changelog actually needs: headings, bold, italic, inline and
 * fenced code, links, images, bullet and numbered lists, quotes and rules.
 * Anything unrecognised is shown as plain text rather than swallowed.
 */

let keyCounter = 0
const nextKey = (): string => `md-${keyCounter++}`

/** Only http(s) links are clickable; anything else renders as text. */
function safeHref(href: string): string | null {
  const trimmed = href.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

/** Inline formatting, applied inside a single line. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // One pass over the alternatives, longest-delimiter first so ** beats *.
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(~~[^~]+~~)|(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))/g

  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]

    if (token.startsWith('`')) {
      nodes.push(
        <code key={nextKey()} className="mono" style={{ background: 'var(--fill-active)', padding: '1px 5px', borderRadius: 4 }}>
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={nextKey()}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('~~')) {
      nodes.push(<s key={nextKey()}>{token.slice(2, -2)}</s>)
    } else if (token.startsWith('![')) {
      const inner = /!\[([^\]]*)\]\(([^)]+)\)/.exec(token)
      const src = inner ? safeHref(inner[2]) : null
      nodes.push(
        src ? (
          <img
            key={nextKey()}
            src={src}
            alt={inner?.[1] ?? ''}
            loading="lazy"
            style={{ maxWidth: '100%', borderRadius: 'var(--r-md)', display: 'block', margin: '8px 0' }}
          />
        ) : (
          <span key={nextKey()}>{inner?.[1] ?? token}</span>
        )
      )
    } else if (token.startsWith('[')) {
      const inner = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)
      const href = inner ? safeHref(inner[2]) : null
      nodes.push(
        href ? (
          <a
            key={nextKey()}
            href={href}
            onClick={(e) => {
              // Everything opens in the system browser; the launcher window
              // must never navigate away from itself.
              e.preventDefault()
              void call('shell:openExternal', href)
            }}
            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 560 }}
          >
            {inner?.[1]}
          </a>
        ) : (
          <span key={nextKey()}>{inner?.[1] ?? token}</span>
        )
      )
    } else {
      nodes.push(<em key={nextKey()}>{token.slice(1, -1)}</em>)
    }
    last = match.index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ source }: { source: string }): React.JSX.Element {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []

  let paragraph: string[] = []
  let listItems: string[] = []
  let listOrdered = false
  let quote: string[] = []
  let codeLines: string[] | null = null

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push(
      <p key={nextKey()} style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
        {renderInline(paragraph.join(' '))}
      </p>
    )
    paragraph = []
  }

  const flushList = (): void => {
    if (listItems.length === 0) return
    const Tag = listOrdered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={nextKey()} style={{ margin: '0 0 12px', paddingLeft: 22, lineHeight: 1.65 }}>
        {listItems.map((item) => (
          <li key={nextKey()} style={{ marginBottom: 3 }}>
            {renderInline(item)}
          </li>
        ))}
      </Tag>
    )
    listItems = []
  }

  const flushQuote = (): void => {
    if (quote.length === 0) return
    blocks.push(
      <blockquote
        key={nextKey()}
        style={{
          margin: '0 0 12px',
          padding: '6px 14px',
          borderLeft: '3px solid var(--accent)',
          color: 'var(--ink-2)',
          lineHeight: 1.6
        }}
      >
        {renderInline(quote.join(' '))}
      </blockquote>
    )
    quote = []
  }

  const flushAll = (): void => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const line of lines) {
    // A fenced block swallows everything until the closing fence, so markup
    // inside a code sample is never interpreted.
    if (line.trimStart().startsWith('```')) {
      if (codeLines === null) {
        flushAll()
        codeLines = []
      } else {
        blocks.push(
          <pre
            key={nextKey()}
            className="mono"
            style={{
              margin: '0 0 12px',
              padding: 'var(--sp-3)',
              background: 'rgba(0,0,0,.28)',
              borderRadius: 'var(--r-md)',
              overflowX: 'auto',
              fontSize: 12,
              lineHeight: 1.55
            }}
          >
            {codeLines.join('\n')}
          </pre>
        )
        codeLines = null
      }
      continue
    }
    if (codeLines !== null) {
      codeLines.push(line)
      continue
    }

    const trimmed = line.trim()

    if (trimmed === '') {
      flushAll()
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll()
      blocks.push(<hr key={nextKey()} style={{ border: 0, borderTop: '1px solid var(--line)', margin: '14px 0' }} />)
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushAll()
      const level = heading[1].length
      const sizes = [20, 17, 15, 14]
      blocks.push(
        <div
          key={nextKey()}
          style={{
            fontSize: sizes[level - 1],
            fontWeight: 680,
            letterSpacing: '-0.015em',
            margin: level === 1 ? '4px 0 10px' : '14px 0 8px'
          }}
        >
          {renderInline(heading[2])}
        </div>
      )
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (bullet || numbered) {
      flushParagraph()
      flushQuote()
      const ordered = Boolean(numbered)
      // A change of list type starts a new list rather than mixing them.
      if (listItems.length > 0 && ordered !== listOrdered) flushList()
      listOrdered = ordered
      listItems.push((bullet ?? numbered)![1])
      continue
    }

    const quoted = /^>\s?(.*)$/.exec(trimmed)
    if (quoted) {
      flushParagraph()
      flushList()
      quote.push(quoted[1])
      continue
    }

    flushList()
    flushQuote()
    paragraph.push(trimmed)
  }

  // An unterminated code fence still renders, rather than vanishing.
  if (codeLines !== null && codeLines.length > 0) {
    blocks.push(
      <pre key={nextKey()} className="mono" style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
        {codeLines.join('\n')}
      </pre>
    )
  }
  flushAll()

  return <div style={{ fontSize: 'var(--fs-body)' }}>{blocks}</div>
}
