import { useEffect, useState } from 'react'
import { Eye, Pencil, Save, Pin } from 'lucide-react'
import { Sheet } from '../components/Sheet'
import { GlassButton } from '../components/Glass'
import { Field, GlassSwitch, Segmented } from '../components/Controls'
import { Markdown } from '../lib/markdown'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import type { NewsPost } from '../../../shared/news'

/**
 * Write a post without touching the filesystem.
 *
 * The composer writes exactly the Markdown file a person would write by hand,
 * so the two ways of adding news produce identical results and neither becomes
 * the "real" one. Everything except the title is optional.
 */
export function NewsComposer({
  post,
  open,
  onClose
}: {
  post: NewsPost | null
  open: boolean
  onClose(saved: boolean): void
}): React.JSX.Element {
  const toast = useStore((s) => s.toast)

  const [title, setTitle] = useState('')
  const [tag, setTag] = useState('')
  const [date, setDate] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [link, setLink] = useState('')
  const [image, setImage] = useState('')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState(false)

  // Reload whenever the sheet opens, so editing a post never shows the last one.
  useEffect(() => {
    if (!open) return
    setTitle(post?.title ?? '')
    setTag(post?.tag ?? '')
    setDate(post?.date || new Date().toISOString().slice(0, 10))
    setBody(post?.body ?? '')
    setPinned(post?.pinned ?? false)
    setLink(post?.link ?? '')
    setImage(post?.image ?? '')
    setMode('write')
  }, [open, post])

  const save = (): void => {
    if (!title.trim()) return
    setBusy(true)
    void call('news:save', {
      title: title.trim(),
      body,
      date,
      tag,
      link,
      image,
      pinned,
      file: post?.file
    })
      .then(() => {
        toast('success', post ? 'Post updated' : 'Post published')
        onClose(true)
      })
      .catch((err) => toast('error', 'Could not save the post', String(err).replace(/^Error:\s*/, '')))
      .finally(() => setBusy(false))
  }

  const QUICK_TAGS = ['Update', 'Release', 'Heads up', 'Fixed', 'Note']

  return (
    <Sheet
      open={open}
      title={post ? 'Edit post' : 'New post'}
      onClose={() => onClose(false)}
      tall
      footer={
        <>
          <GlassButton variant="quiet" onClick={() => onClose(false)}>
            Cancel
          </GlassButton>
          <GlassButton variant="prominent" onClick={save} disabled={busy || !title.trim()}>
            <Save size={15} /> {post ? 'Save' : 'Publish'}
          </GlassButton>
        </>
      }
    >
      <div className="stack" style={{ gap: 'var(--sp-4)' }}>
        <Field label="Title">
          <input
            className="input"
            value={title}
            placeholder="What happened?"
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <div className="hstack" style={{ alignItems: 'flex-end', gap: 'var(--sp-3)' }}>
          <div style={{ flex: 1 }}>
            <Field label="Tag" hint="Optional. Shown as a badge on the card.">
              <input className="input" value={tag} placeholder="Update" onChange={(e) => setTag(e.target.value)} />
            </Field>
          </div>
          <div style={{ width: 150 }}>
            <Field label="Date">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        </div>

        {/* One click instead of typing the same five words every time. */}
        <div className="hstack hstack--wrap" style={{ gap: 6 }}>
          {QUICK_TAGS.map((t) => (
            <GlassButton
              key={t}
              variant={tag === t ? 'prominent' : 'glass'}
              size="sm"
              onClick={() => setTag(tag === t ? '' : t)}
            >
              {t}
            </GlassButton>
          ))}
        </div>

        <div>
          <div className="hstack" style={{ marginBottom: 8 }}>
            <span className="field__label" style={{ flex: 'none' }}>
              Body
            </span>
            <span className="spacer" />
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'write', label: 'Write', icon: <Pencil size={11} /> },
                { value: 'preview', label: 'Preview', icon: <Eye size={11} /> }
              ]}
              layoutId="composer-mode"
            />
          </div>

          {mode === 'write' ? (
            <textarea
              className="textarea"
              style={{ minHeight: 220, lineHeight: 1.6 }}
              value={body}
              placeholder={'Markdown works here.\n\n## A heading\n\n- a list item\n- **bold** and *italic*\n\n[a link](https://example.com)'}
              onChange={(e) => setBody(e.target.value)}
            />
          ) : (
            <div
              className="glass glass--allow-nested"
              style={{ padding: 'var(--sp-4)', borderRadius: 'var(--r-lg)', minHeight: 220 }}
            >
              {body.trim() ? (
                <Markdown source={body} />
              ) : (
                <p className="panel__hint" style={{ margin: 0 }}>
                  Nothing to preview yet.
                </p>
              )}
            </div>
          )}
          <p className="panel__hint" style={{ marginTop: 6 }}>
            Markdown: <code>**bold**</code>, <code>*italic*</code>, <code>## heading</code>, <code>- list</code>,{' '}
            <code>[text](url)</code>, <code>`code`</code>.
          </p>
        </div>

        <details>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 'var(--fs-label)',
              fontWeight: 600,
              color: 'var(--ink-2)',
              padding: '4px 0'
            }}
          >
            More options
          </summary>
          <div className="stack" style={{ gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
            <Field label="Image URL" hint="Shown at the top of the post and as the card thumbnail.">
              <input
                className="input mono"
                value={image}
                placeholder="https://…"
                onChange={(e) => setImage(e.target.value)}
              />
            </Field>
            <Field label="Read more link" hint="If set, the card opens this in your browser instead of the body.">
              <input
                className="input mono"
                value={link}
                placeholder="https://…"
                onChange={(e) => setLink(e.target.value)}
              />
            </Field>
            <div className="row" style={{ padding: 0 }}>
              <span className="row__text">
                <span className="row__label">
                  <Pin size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                  Pin to the top
                </span>
                <span className="row__desc">Pinned posts sort above everything, whatever their date.</span>
              </span>
              <span className="row__control">
                <GlassSwitch checked={pinned} onChange={setPinned} label="Pin to the top" />
              </span>
            </div>
          </div>
        </details>
      </div>
    </Sheet>
  )
}
