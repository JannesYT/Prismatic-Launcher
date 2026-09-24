import { useCallback, useEffect, useState } from 'react'
import {
  Newspaper,
  Plus,
  RefreshCw,
  FolderOpen,
  ExternalLink,
  Pin,
  Pencil,
  Trash2,
  ArrowLeft,
  AlertTriangle
} from 'lucide-react'
import { GlassButton } from '../components/Glass'
import { Badge, EmptyState, Panel, SearchInput, Segmented } from '../components/Controls'
import { Markdown } from '../lib/markdown'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { formatRelative } from '../lib/appearance'
import type { NewsPost } from '../../../shared/news'
import { NewsComposer } from './NewsComposer'

interface NewsResult {
  posts: NewsPost[]
  errors: { source: string; reason: string }[]
}

export function NewsView(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const toast = useStore((s) => s.toast)

  const [result, setResult] = useState<NewsResult>({ posts: [], errors: [] })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'local' | 'mojang'>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<NewsPost | null>(null)
  const [composing, setComposing] = useState<NewsPost | 'new' | null>(null)

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true)
    void call<NewsResult>('news:list')
      .then((res) => setResult(res ?? { posts: [], errors: [] }))
      .catch((err) => toast('error', 'Could not load news', String(err).replace(/^Error:\s*/, '')))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const authoring = settings?.news.authorMode ?? true

  const visible = result.posts.filter((post) => {
    if (filter === 'local' && post.source !== 'local') return false
    if (filter === 'mojang' && post.source === 'local') return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      post.title.toLowerCase().includes(q) ||
      post.summary.toLowerCase().includes(q) ||
      post.body.toLowerCase().includes(q)
    )
  })

  // --- Reading a single post ---------------------------------------------
  if (open) {
    return (
      <div className="view">
        <div className="view__header">
          <GlassButton variant="quiet" iconOnly onClick={() => setOpen(null)} aria-label="Back to news">
            <ArrowLeft size={18} />
          </GlassButton>
          <div style={{ minWidth: 0 }}>
            <h1 className="view__title">{open.title}</h1>
            <p className="view__subtitle">
              {open.sourceName}
              {open.date && ` · ${new Date(open.date).toLocaleDateString()}`}
              {open.tag && ` · ${open.tag}`}
            </p>
          </div>
          <div className="view__actions">
            {open.source === 'local' && (
              <>
                <GlassButton variant="glass" onClick={() => setComposing(open)}>
                  <Pencil size={14} /> Edit
                </GlassButton>
                <GlassButton
                  variant="danger"
                  iconOnly
                  aria-label="Delete this post"
                  onClick={() => {
                    void call<boolean>('dialog:confirm', 'Delete post', `Delete "${open.title}"?`).then((ok) => {
                      if (!ok) return
                      void call<NewsResult>('news:delete', open.file)
                        .then((res) => {
                          setResult(res)
                          setOpen(null)
                          toast('success', 'Post deleted')
                        })
                        .catch((err) => toast('error', 'Could not delete', String(err)))
                    })
                  }}
                >
                  <Trash2 size={15} />
                </GlassButton>
              </>
            )}
            {open.link && (
              <GlassButton variant="glass" onClick={() => void call('shell:openExternal', open.link!)}>
                <ExternalLink size={14} /> Open
              </GlassButton>
            )}
          </div>
        </div>

        <Panel>
          <div style={{ padding: 'var(--sp-4)' }}>
            {open.image && (
              <img
                src={open.image}
                alt=""
                style={{ width: '100%', borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-4)' }}
              />
            )}
            {open.body ? (
              <Markdown source={open.body} />
            ) : (
              <>
                <p style={{ lineHeight: 1.65, margin: 0 }}>{open.summary}</p>
                {open.link && (
                  <p className="panel__hint" style={{ marginTop: 'var(--sp-3)' }}>
                    This post lives on another site, so only its summary is shown here.
                  </p>
                )}
              </>
            )}
          </div>
        </Panel>

        <NewsComposer
          post={composing === 'new' ? null : composing}
          open={composing !== null}
          onClose={(saved) => {
            setComposing(null)
            if (saved) {
              load(true)
              setOpen(null)
            }
          }}
        />
      </div>
    )
  }

  // --- The list -----------------------------------------------------------
  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h1 className="view__title">News</h1>
          <p className="view__subtitle">
            {loading
              ? 'Loading…'
              : `${result.posts.length} post${result.posts.length === 1 ? '' : 's'}${
                  result.posts.some((p) => p.source === 'local')
                    ? ''
                    : ' · write your own with the New post button'
                }`}
          </p>
        </div>
        <div className="view__actions">
          <SearchInput value={query} onChange={setQuery} placeholder="Search news" />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'local', label: 'Mine' },
              { value: 'mojang', label: 'Minecraft' }
            ]}
            layoutId="news-filter"
          />
          <GlassButton variant="glass" iconOnly aria-label="Refresh" onClick={() => load()}>
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
          </GlassButton>
          {authoring && (
            <>
              <GlassButton variant="glass" iconOnly aria-label="Open the news folder" onClick={() => void call('news:reveal')}>
                <FolderOpen size={15} />
              </GlassButton>
              <GlassButton variant="prominent" onClick={() => setComposing('new')}>
                <Plus size={16} /> New post
              </GlassButton>
            </>
          )}
        </div>
      </div>

      {result.errors.length > 0 && (
        <div
          className="glass panel"
          style={{ padding: 'var(--sp-3)', display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--warn)', flex: 'none', marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-label)' }}>Some sources could not be reached</div>
            {result.errors.map((e) => (
              <div key={e.source} className="row__desc">
                {e.source}: {e.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 && !loading ? (
        <EmptyState
          icon={<Newspaper size={30} />}
          title={query ? 'Nothing matches' : 'No news yet'}
          text={
            query
              ? 'Try a different search.'
              : 'Write a post, or drop a Markdown file into the news folder — it shows up here straight away.'
          }
          action={
            authoring && !query ? (
              <div className="hstack">
                <GlassButton variant="prominent" onClick={() => setComposing('new')}>
                  <Plus size={15} /> Write a post
                </GlassButton>
                <GlassButton variant="glass" onClick={() => void call('news:reveal')}>
                  <FolderOpen size={14} /> Open the folder
                </GlassButton>
              </div>
            ) : undefined
          }
        />
      ) : (
        <Panel>
          {visible.map((post) => (
            <button
              key={post.id}
              className="row row--button"
              style={{ alignItems: 'flex-start' }}
              onClick={() => {
                // A post whose content lives elsewhere opens there directly
                // rather than showing a near-empty detail page.
                if (!post.body && post.link) void call('shell:openExternal', post.link)
                else setOpen(post)
              }}
            >
              {post.image ? (
                <img
                  src={post.image}
                  alt=""
                  loading="lazy"
                  style={{
                    width: 76,
                    height: 50,
                    objectFit: 'cover',
                    borderRadius: 'var(--r-sm)',
                    flex: 'none',
                    background: 'var(--fill)'
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 76,
                    height: 50,
                    borderRadius: 'var(--r-sm)',
                    flex: 'none',
                    background: 'var(--fill)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--ink-4)'
                  }}
                >
                  <Newspaper size={18} />
                </div>
              )}

              <span className="row__text">
                <span className="row__label" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {post.pinned && <Pin size={12} style={{ color: 'var(--accent)' }} />}
                  {post.title}
                  {post.tag && <Badge tone={post.source === 'local' ? 'accent' : undefined}>{post.tag}</Badge>}
                  {post.source !== 'local' && <Badge>{post.sourceName}</Badge>}
                </span>
                {post.summary && <span className="row__desc">{post.summary}</span>}
                <span className="row__desc" style={{ opacity: 0.75 }}>
                  {post.date ? formatRelative(new Date(post.date).getTime()) : 'No date'}
                </span>
              </span>

              <span className="row__control">
                {!post.body && post.link && <ExternalLink size={14} style={{ color: 'var(--ink-4)' }} />}
              </span>
            </button>
          ))}
        </Panel>
      )}

      <NewsComposer
        post={composing === 'new' ? null : composing}
        open={composing !== null}
        onClose={(saved) => {
          setComposing(null)
          if (saved) load(true)
        }}
      />
    </div>
  )
}
