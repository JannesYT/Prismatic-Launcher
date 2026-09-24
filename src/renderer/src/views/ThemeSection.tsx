import { useState } from 'react'
import { Image as ImageIcon, Save, Trash2, X, LayoutGrid, List } from 'lucide-react'
import { GlassButton } from '../components/Glass'
import { Badge, Field, GlassSwitch, Panel, Row, Segmented } from '../components/Controls'
import { SliderRow } from '../components/GlassSlider'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { activeTheme } from '../lib/appearance'
import { BUILT_IN_THEMES, LAYOUTS } from '../../../shared/themes'
import type { Settings, ThemeColors, ThemePreset } from '../../../shared/types'

/** A preview tile that renders in its own theme, not the active one. */
function ThemeCard({
  preset,
  active,
  onPick,
  onDelete
}: {
  preset: ThemePreset
  active: boolean
  onPick(): void
  onDelete?(): void
}): React.JSX.Element {
  const c = preset.colors
  return (
    <button type="button" className="theme-card" data-active={active} onClick={onPick} aria-pressed={active}>
      <div
        className="theme-card__swatch"
        style={{
          // The same three-field backdrop the app uses, so the preview shows
          // what the glass will actually refract.
          background: `radial-gradient(60% 70% at 22% 25%, ${c.tintA}, transparent 70%),
                       radial-gradient(55% 60% at 80% 70%, ${c.tintB}, transparent 70%),
                       radial-gradient(60% 60% at 50% 100%, ${c.tintC}, transparent 65%),
                       ${c.bg}`
        }}
      >
        <span className="theme-card__chip" />
      </div>
      <div className="theme-card__label" style={{ background: c.bg }}>
        <div className="theme-card__name" style={{ color: c.ink }}>
          {preset.name}
          {!preset.builtIn && (
            <span style={{ marginLeft: 6 }}>
              <Badge tone="accent">Yours</Badge>
            </span>
          )}
        </div>
        <div className="theme-card__desc" style={{ color: c.ink3 }}>
          {preset.description}
        </div>
      </div>
      {onDelete && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Delete ${preset.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation()
              onDelete()
            }
          }}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 22,
            height: 22,
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(0,0,0,.45)',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          <X size={12} />
        </span>
      )}
    </button>
  )
}

export function ThemeSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)
  const toast = useStore((s) => s.toast)
  const a = settings.appearance
  const current = activeTheme(settings)
  const [newName, setNewName] = useState('')

  const setColor = (key: keyof ThemeColors, value: string): void => {
    // Editing any colour switches to the custom set, seeded from whatever was
    // showing — so tweaking a preset never destroys the preset itself.
    void patch({
      appearance: { themePreset: 'custom', customTheme: { ...current, [key]: value } }
    })
  }

  const saveAsPreset = (): void => {
    const name = newName.trim()
    if (!name) return
    const preset: ThemePreset = {
      id: `user-${Date.now().toString(36)}`,
      name,
      description: 'Saved from your current colours',
      colors: { ...current },
      builtIn: false
    }
    void patch({
      appearance: { userPresets: [...a.userPresets, preset], themePreset: preset.id, customTheme: null }
    })
    setNewName('')
    toast('success', `Saved "${name}"`)
  }

  const pickWallpaper = (): void => {
    void call<string | null>('dialog:pickFile', [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
    ]).then((file) => {
      if (!file) return
      // Copied into the launcher's data folder, because only paths under it
      // are servable through the custom protocol.
      void call<{ path: string }>('icons:importPath', file)
        .then((stored) => patch({ appearance: { backgroundImage: stored.path } }))
        .catch((err) => toast('error', 'Could not use that image', String(err).replace(/^Error:\s*/, '')))
    })
  }

  const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
    { key: 'bg', label: 'Background', hint: 'The base colour behind everything' },
    { key: 'tintA', label: 'Tint one', hint: 'Give the glass something to refract' },
    { key: 'tintB', label: 'Tint two', hint: '' },
    { key: 'tintC', label: 'Tint three', hint: '' },
    { key: 'ink', label: 'Text', hint: '' },
    { key: 'ink3', label: 'Secondary text', hint: '' }
  ]

  return (
    <>
      <Panel
        title="Layout"
        hint="Where navigation lives. Views do not change — only the shape around them, so pick whichever matches the launcher you are used to."
      >
        <div className="theme-grid">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              className="theme-card"
              data-active={a.layout === l.id}
              onClick={() => void patch({ appearance: { layout: l.id } })}
            >
              <div className="theme-card__swatch" style={{ background: 'var(--fill)', padding: 8 }}>
                {/* A wireframe of the layout, which reads faster than a name. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
                  <div style={{ height: 6, background: 'var(--line-strong)', borderRadius: 2 }} />
                  <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                    {(l.id === 'sidebar' || l.id === 'compact') && (
                      <div
                        style={{
                          width: l.id === 'compact' ? 8 : 18,
                          background: 'var(--accent)',
                          borderRadius: 2,
                          opacity: 0.8
                        }}
                      />
                    )}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {l.id === 'topTabs' && (
                        <div style={{ height: 6, background: 'var(--accent)', borderRadius: 2, opacity: 0.8 }} />
                      )}
                      <div style={{ flex: 1, background: 'var(--line)', borderRadius: 2 }} />
                      {l.id === 'bottomTabs' && (
                        <div
                          style={{
                            height: 8,
                            width: '70%',
                            margin: '0 auto',
                            background: 'var(--accent)',
                            borderRadius: 999,
                            opacity: 0.85
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="theme-card__label">
                <div className="theme-card__name">{l.name}</div>
                <div className="theme-card__desc">{l.description}</div>
              </div>
            </button>
          ))}
        </div>

        <Row label="Density" desc="Compact tightens spacing and row heights throughout">
          <Segmented
            value={a.density}
            onChange={(density) => void patch({ appearance: { density } })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' }
            ]}
            layoutId="density"
          />
        </Row>

        <Row label="Instance list">
          <Segmented
            value={a.instanceView}
            onChange={(instanceView) => void patch({ appearance: { instanceView } })}
            options={[
              { value: 'grid', label: 'Grid', icon: <LayoutGrid size={12} /> },
              { value: 'list', label: 'List', icon: <List size={12} /> }
            ]}
            layoutId="instance-view"
          />
        </Row>

        <Row label="Card size" desc="Width of each instance tile in the grid">
          <div style={{ width: 240 }}>
            <SliderRow
              value={a.cardSize}
              min={120}
              max={260}
              step={4}
              disabled={a.instanceView !== 'grid'}
              onChange={(cardSize) => void patch({ appearance: { cardSize } })}
              suffix="px"
              label="Card size"
            />
          </div>
        </Row>

        {(a.layout === 'sidebar' || a.layout === 'topTabs') && (
          <Row label="Sidebar width">
            <div style={{ width: 240 }}>
              <SliderRow
                value={a.railWidth}
                min={150}
                max={320}
                step={5}
                onChange={(railWidth) => void patch({ appearance: { railWidth } })}
                suffix="px"
                label="Sidebar width"
              />
            </div>
          </Row>
        )}
      </Panel>

      <Panel title="Theme" hint="Each preset sets the background and the three colour fields the glass refracts.">
        <div className="theme-grid">
          {BUILT_IN_THEMES.map((preset) => (
            <ThemeCard
              key={preset.id}
              preset={preset}
              active={a.themePreset === preset.id}
              onPick={() =>
                void patch({ appearance: { themePreset: preset.id, customTheme: null, accent: preset.colors.accent } })
              }
            />
          ))}
          {a.userPresets.map((preset) => (
            <ThemeCard
              key={preset.id}
              preset={preset}
              active={a.themePreset === preset.id}
              onPick={() =>
                void patch({ appearance: { themePreset: preset.id, customTheme: null, accent: preset.colors.accent } })
              }
              onDelete={() => {
                const remaining = a.userPresets.filter((p) => p.id !== preset.id)
                void patch({
                  appearance: {
                    userPresets: remaining,
                    // Falling back to the default rather than leaving a
                    // dangling id that resolves to nothing.
                    themePreset: a.themePreset === preset.id ? 'prismatic' : a.themePreset
                  }
                })
              }}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Custom Colours"
        hint={
          a.themePreset === 'custom'
            ? 'Editing your own colour set.'
            : 'Changing any colour copies the current theme into your own set, leaving the preset untouched.'
        }
        actions={a.themePreset === 'custom' ? <Badge tone="accent">Custom</Badge> : undefined}
      >
        {COLOR_FIELDS.map((field) => (
          <Row key={field.key} label={field.label} desc={field.hint || undefined}>
            <input
              className="input mono"
              style={{ width: 200 }}
              value={String(current[field.key])}
              spellCheck={false}
              onChange={(e) => setColor(field.key, e.target.value)}
            />
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: String(current[field.key]),
                flex: 'none'
              }}
            />
          </Row>
        ))}

        <div style={{ padding: 'var(--sp-3)' }}>
          <Field label="Save these colours as a preset">
            <div className="hstack" style={{ gap: 'var(--sp-2)' }}>
              <input
                className="input"
                value={newName}
                placeholder="My theme"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveAsPreset()
                }}
              />
              <GlassButton variant="glass" onClick={saveAsPreset} disabled={!newName.trim()} style={{ flex: 'none' }}>
                <Save size={14} /> Save
              </GlassButton>
            </div>
          </Field>
        </div>
      </Panel>

      <Panel
        title="Wallpaper"
        hint="Drawn behind every glass surface, so it is what the material refracts. Blur it heavily to keep text readable."
        actions={
          <GlassButton variant="glass" size="sm" onClick={pickWallpaper}>
            <ImageIcon size={13} /> Choose
          </GlassButton>
        }
      >
        {a.backgroundImage ? (
          <>
            <Row label="Current image" desc={a.backgroundImage}>
              <GlassButton
                variant="danger"
                size="sm"
                iconOnly
                aria-label="Remove wallpaper"
                onClick={() => void patch({ appearance: { backgroundImage: null } })}
              >
                <Trash2 size={13} />
              </GlassButton>
            </Row>
            <Row label="Opacity">
              <div style={{ width: 240 }}>
                <SliderRow
                  value={a.backgroundOpacity}
                  min={0}
                  max={100}
                  onChange={(backgroundOpacity) => void patch({ appearance: { backgroundOpacity } })}
                  suffix="%"
                  label="Wallpaper opacity"
                />
              </div>
            </Row>
            <Row label="Blur" desc="Higher keeps the interface legible over a busy picture">
              <div style={{ width: 240 }}>
                <SliderRow
                  value={a.backgroundBlur}
                  min={0}
                  max={60}
                  onChange={(backgroundBlur) => void patch({ appearance: { backgroundBlur } })}
                  suffix="px"
                  label="Wallpaper blur"
                />
              </div>
            </Row>
          </>
        ) : (
          <p className="panel__hint" style={{ padding: 'var(--sp-3)' }}>
            No wallpaper set. The theme's own colour fields are used instead.
          </p>
        )}
      </Panel>

      <Panel title="Bedrock Edition">
        <Row
          label="Show Bedrock in the instance list"
          desc="Windows only. Prismatic can start it, but cannot manage its versions or mods — it is a Store app."
        >
          <GlassSwitch
            checked={settings.bedrock.show}
            onChange={(show) => void patch({ bedrock: { show } })}
            label="Show Bedrock"
          />
        </Row>
        <Row label="Prefer the Preview build" desc="When both the retail and Preview versions are installed">
          <GlassSwitch
            checked={settings.bedrock.preferPreview}
            disabled={!settings.bedrock.show}
            onChange={(preferPreview) => void patch({ bedrock: { preferPreview } })}
            label="Prefer Preview"
          />
        </Row>
      </Panel>
    </>
  )
}
