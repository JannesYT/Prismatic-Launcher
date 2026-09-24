import { useEffect, useState } from 'react'
import {
  Sparkles,
  Coffee,
  Gamepad2,
  Download,
  Terminal,
  Plug,
  Info,
  Droplet,
  Circle,
  RotateCcw,
  FolderOpen,
  ExternalLink,
  PackagePlus,
  Plus,
  X,
  Palette,
  DownloadCloud
} from 'lucide-react'
import { ThemeSection } from './ThemeSection'
import { GlassButton } from '../components/Glass'
import { Badge, Field, GlassSwitch, Panel, Row, Segmented } from '../components/Controls'
import { SliderRow } from '../components/GlassSlider'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { ACCENTS, formatBytes } from '../lib/appearance'
import type { GlassStyle, Settings } from '../../../shared/types'

type Section =
  | 'appearance'
  | 'theme'
  | 'java'
  | 'minecraft'
  | 'newInstance'
  | 'downloads'
  | 'commands'
  | 'integrations'
  | 'updates'
  | 'about'

const SECTIONS: { id: Section; label: string; icon: React.JSX.Element }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Sparkles size={16} /> },
  { id: 'theme', label: 'Theme and Layout', icon: <Palette size={16} /> },
  { id: 'java', label: 'Java', icon: <Coffee size={16} /> },
  { id: 'minecraft', label: 'Minecraft', icon: <Gamepad2 size={16} /> },
  { id: 'newInstance', label: 'New Instances', icon: <PackagePlus size={16} /> },
  { id: 'downloads', label: 'Downloads', icon: <Download size={16} /> },
  { id: 'commands', label: 'Custom Commands', icon: <Terminal size={16} /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={16} /> },
  { id: 'updates', label: 'Updates', icon: <DownloadCloud size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> }
]

export function SettingsView(): React.JSX.Element {
  const [section, setSection] = useState<Section>('appearance')
  const settings = useStore((s) => s.settings)

  if (!settings) return <div className="view" />

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h1 className="view__title">Settings</h1>
          <p className="view__subtitle">Global defaults. Every instance can override them individually.</p>
        </div>
      </div>

      <div className="detail">
        <nav className="glass sidelist">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className="sidelist__item"
              data-active={section === s.id}
              onClick={() => setSection(s.id)}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </nav>

        <div style={{ minWidth: 0 }}>
          {section === 'appearance' && <AppearanceSection settings={settings} />}
          {section === 'theme' && <ThemeSection settings={settings} />}
          {section === 'java' && <JavaSection settings={settings} />}
          {section === 'minecraft' && <MinecraftSection settings={settings} />}
          {section === 'newInstance' && <NewInstanceSection settings={settings} />}
          {section === 'downloads' && <DownloadsSection settings={settings} />}
          {section === 'commands' && <CommandsSection settings={settings} />}
          {section === 'integrations' && <IntegrationsSection settings={settings} />}
          {section === 'updates' && <UpdatesSection settings={settings} />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Appearance — the Liquid Glass controls
// ---------------------------------------------------------------------------

function AppearanceSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)
  const a = settings.appearance
  const glassOff = a.glassStyle !== 'liquid'

  const setStyle = (glassStyle: GlassStyle): void => {
    void patch({ appearance: { glassStyle } })
    // Native window material only makes sense with real glass.
    void call('window:setMaterial', glassStyle === 'liquid' && a.nativeWindowBlur)
  }

  return (
    <>
      <Panel
        title="Material"
        hint="Liquid Glass blurs and refracts whatever is behind a surface. Turning it off swaps the material for a flat tint or an opaque fill — every animation, spring and morph stays exactly the same."
      >
        <div style={{ padding: '0 var(--sp-3) var(--sp-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-3)' }}>
            <StyleCard
              active={a.glassStyle === 'liquid'}
              onClick={() => setStyle('liquid')}
              title="Liquid Glass"
              desc="Blur, refraction and specular highlights"
              preview="liquid"
            />
            <StyleCard
              active={a.glassStyle === 'tinted'}
              onClick={() => setStyle('tinted')}
              title="Tinted"
              desc="Flat translucent fill, no blur"
              preview="tinted"
            />
            <StyleCard
              active={a.glassStyle === 'solid'}
              onClick={() => setStyle('solid')}
              title="Solid"
              desc="Fully opaque, cheapest to render"
              preview="solid"
            />
          </div>
        </div>

        <Row
          label="Glass variant"
          desc="Regular keeps text legible over busy content. Clear is far more transparent, for surfaces over calm backgrounds."
        >
          <Segmented
            value={a.glassVariant}
            onChange={(glassVariant) => void patch({ appearance: { glassVariant } })}
            options={[
              { value: 'regular', label: 'Regular' },
              { value: 'clear', label: 'Clear' }
            ]}
            layoutId="glass-variant"
          />
        </Row>

        <Row
          label="Native window blur"
          desc="Lets glass surfaces sample your desktop wallpaper, not just the launcher's own background. Uses Acrylic on Windows 11 and Vibrancy on macOS."
        >
          <GlassSwitch
            checked={a.nativeWindowBlur}
            disabled={glassOff}
            onChange={(nativeWindowBlur) => {
              void patch({ appearance: { nativeWindowBlur } })
              void call('window:setMaterial', nativeWindowBlur && a.glassStyle === 'liquid')
            }}
            label="Native window blur"
          />
        </Row>
      </Panel>

      <Panel
        title="Glass Tuning"
        hint={
          glassOff
            ? 'These three shape the Liquid Glass material, so they have no effect in the current style. Switch back to Liquid Glass to use them.'
            : 'Lensing bends the content behind a surface — it is the difference between glass and frosted plastic.'
        }
      >
        <Row label="Lensing" desc="How strongly surfaces refract what sits behind them">
          <div style={{ width: 260 }}>
            <SliderRow
              value={a.lensing}
              min={0}
              max={100}
              disabled={glassOff}
              onChange={(lensing) => void patch({ appearance: { lensing } })}
              suffix="%"
              label="Lensing"
            />
          </div>
        </Row>
        <Row label="Blur" desc="Backdrop blur radius">
          <div style={{ width: 260 }}>
            <SliderRow
              value={a.blur}
              min={0}
              max={100}
              disabled={glassOff}
              onChange={(blur) => void patch({ appearance: { blur } })}
              suffix="%"
              label="Blur"
            />
          </div>
        </Row>
        <Row label="Specular highlight" desc="Brightness of the light catching each surface's edge">
          <div style={{ width: 260 }}>
            <SliderRow
              value={a.specular}
              min={0}
              max={100}
              disabled={glassOff}
              onChange={(specular) => void patch({ appearance: { specular } })}
              suffix="%"
              label="Specular highlight"
            />
          </div>
        </Row>
      </Panel>

      <Panel title="Theme">
        <Row label="Colour scheme">
          <Segmented
            value={a.theme}
            onChange={(theme) => void patch({ appearance: { theme } })}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
            layoutId="theme-picker"
          />
        </Row>
        <Row label="Accent colour" desc="Used for the active tab, buttons and slider fills">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 260 }}>
            {ACCENTS.map((accent) => (
              <button
                key={accent.value}
                type="button"
                aria-label={accent.name}
                title={accent.name}
                onClick={() => void patch({ appearance: { accent: accent.value } })}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: accent.value,
                  border: a.accent === accent.value ? '2.5px solid var(--ink)' : '2px solid transparent',
                  boxShadow: `0 1px 4px ${accent.value}66`,
                  cursor: 'pointer',
                  transition: 'transform var(--dur-fast) var(--ease-glass), border-color var(--dur-fast) var(--ease-out)',
                  transform: a.accent === accent.value ? 'scale(1.12)' : 'scale(1)'
                }}
              />
            ))}
          </div>
        </Row>
        <Row label="Corner radius" desc="Panels and cards; nested elements stay concentric automatically">
          <div style={{ width: 220 }}>
            <SliderRow
              value={a.cornerRadius}
              min={8}
              max={38}
              onChange={(cornerRadius) => void patch({ appearance: { cornerRadius } })}
              suffix="px"
              label="Corner radius"
            />
          </div>
        </Row>
        <Row label="Text size">
          <div style={{ width: 220 }}>
            <SliderRow
              value={a.fontScale}
              min={0.85}
              max={1.3}
              step={0.05}
              onChange={(fontScale) => void patch({ appearance: { fontScale } })}
              format={(v) => `${Math.round(v * 100)}%`}
              label="Text size"
            />
          </div>
        </Row>
      </Panel>

      <Panel title="Tab Bar" hint="The bar floats above your content in the navigation layer rather than sitting in a chrome strip.">
        <Row
          label="Minimize while scrolling"
          desc="Shrinks the bar to a pill when you scroll down, and brings it back when you scroll up"
        >
          <Segmented
            value={a.tabBarMinimize}
            onChange={(tabBarMinimize) => void patch({ appearance: { tabBarMinimize } })}
            options={[
              { value: 'onScrollDown', label: 'On scroll down' },
              { value: 'never', label: 'Never' }
            ]}
            layoutId="tabbar-minimize"
          />
        </Row>
        <Row label="Labels">
          <Segmented
            value={a.tabBarLabels}
            onChange={(tabBarLabels) => void patch({ appearance: { tabBarLabels } })}
            options={[
              { value: 'always', label: 'Always' },
              { value: 'selected', label: 'Selected' },
              { value: 'never', label: 'Icons only' }
            ]}
            layoutId="tabbar-labels"
          />
        </Row>
      </Panel>

      <Panel
        title="Motion and Accessibility"
        hint="Reduce Transparency forces the solid material without touching motion. Reduce Motion makes state changes arrive instantly without disabling them."
      >
        <Row label="Animation speed" desc="Applies to every transition in the app at once">
          <div style={{ width: 240 }}>
            <SliderRow
              value={a.motionScale}
              min={0.5}
              max={2}
              step={0.1}
              disabled={a.reduceMotion}
              onChange={(motionScale) => void patch({ appearance: { motionScale } })}
              format={(v) => `${v.toFixed(1)}×`}
              label="Animation speed"
            />
          </div>
        </Row>
        <Row label="Reduce transparency" desc="Overrides the material choice with the opaque style">
          <GlassSwitch
            checked={a.reduceTransparency}
            onChange={(reduceTransparency) => {
              void patch({ appearance: { reduceTransparency } })
              void call('window:setMaterial', !reduceTransparency && a.glassStyle === 'liquid' && a.nativeWindowBlur)
            }}
            label="Reduce transparency"
          />
        </Row>
        <Row label="Reduce motion" desc="Removes animation while keeping every state change">
          <GlassSwitch
            checked={a.reduceMotion}
            onChange={(reduceMotion) => void patch({ appearance: { reduceMotion } })}
            label="Reduce motion"
          />
        </Row>
        <Row label="Increase contrast" desc="Stronger borders and dimmer secondary text held closer to the foreground">
          <GlassSwitch
            checked={a.increaseContrast}
            onChange={(increaseContrast) => void patch({ appearance: { increaseContrast } })}
            label="Increase contrast"
          />
        </Row>
      </Panel>
    </>
  )
}

/** A live preview tile: each one renders in its own material regardless of the current setting. */
function StyleCard({
  active,
  onClick,
  title,
  desc,
  preview
}: {
  active: boolean
  onClick(): void
  title: string
  desc: string
  preview: GlassStyle
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        position: 'relative',
        padding: 0,
        border: active ? '2px solid var(--accent)' : '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        background: 'transparent',
        cursor: 'pointer',
        overflow: 'hidden',
        textAlign: 'left',
        transition: 'border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-glass)'
      }}
    >
      {/* A busy backdrop, so the difference between the three is actually visible. */}
      <div
        style={{
          height: 78,
          position: 'relative',
          background:
            'radial-gradient(60% 70% at 25% 30%, rgba(var(--accent-r),var(--accent-g),var(--accent-b),.75), transparent 70%), radial-gradient(50% 60% at 78% 70%, rgba(236,72,153,.6), transparent 70%), linear-gradient(135deg, #2b3350, #101522)',
          display: 'grid',
          placeItems: 'center'
        }}
      >
        <div
          data-glass={preview}
          data-preview="true"
          style={{
            width: '72%',
            height: 34,
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            fontSize: 11,
            fontWeight: 650,
            color: preview === 'solid' ? '#101318' : '#fff',
            background:
              preview === 'liquid'
                ? 'rgba(255,255,255,.28)'
                : preview === 'tinted'
                  ? 'rgba(255,255,255,.6)'
                  : '#ffffff',
            backdropFilter: preview === 'liquid' ? 'blur(10px) saturate(190%) brightness(1.15)' : 'none',
            WebkitBackdropFilter: preview === 'liquid' ? 'blur(10px) saturate(190%) brightness(1.15)' : 'none',
            boxShadow:
              preview === 'liquid'
                ? 'inset 0 1px 0 rgba(255,255,255,.75), 0 4px 14px -4px rgba(0,0,0,.5)'
                : preview === 'tinted'
                  ? '0 3px 10px -4px rgba(0,0,0,.4)'
                  : '0 2px 6px -2px rgba(0,0,0,.3)'
          }}
        >
          {preview === 'liquid' ? <Droplet size={13} /> : <Circle size={13} />}
        </div>
      </div>
      <div style={{ padding: 'var(--sp-3)' }}>
        <div style={{ fontSize: 'var(--fs-label)', fontWeight: 640 }}>{title}</div>
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------

function JavaSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)
  const toast = useStore((s) => s.toast)
  const [installs, setInstalls] = useState<
    { path: string; version: string; major: number; vendor: string; arch: string; managed: boolean }[]
  >([])
  const [scanning, setScanning] = useState(false)

  const scan = (): void => {
    setScanning(true)
    void call<typeof installs>('java:detect')
      .then(setInstalls)
      .catch((err) => toast('error', 'Java scan failed', String(err)))
      .finally(() => setScanning(false))
  }

  useEffect(scan, [])

  const totalRam = 32 * 1024 // upper bound for the slider; the real cap is the machine's RAM

  return (
    <>
      <Panel
        title="Memory"
        hint="Minecraft rarely benefits from more than 8 GB unless you run a very large modpack. Allocating most of your RAM makes garbage collection pauses worse, not better."
      >
        <Row label="Maximum memory" desc="The -Xmx value handed to the JVM">
          <div style={{ width: 280 }}>
            <SliderRow
              value={settings.java.memory.max}
              min={1024}
              max={totalRam}
              step={256}
              onChange={(max) => void patch({ java: { memory: { max } } })}
              format={(v) => formatBytes(v * 1024 * 1024)}
              label="Maximum memory"
            />
          </div>
        </Row>
        <Row label="Minimum memory" desc="-Xms; leaving this low lets the JVM grow on demand">
          <div style={{ width: 280 }}>
            <SliderRow
              value={settings.java.memory.min}
              min={256}
              max={8192}
              step={256}
              onChange={(min) => void patch({ java: { memory: { min } } })}
              format={(v) => formatBytes(v * 1024 * 1024)}
              label="Minimum memory"
            />
          </div>
        </Row>
      </Panel>

      <Panel
        title="Runtime"
        hint="Different Minecraft versions need different Java versions: 1.16 and older want Java 8, 1.17–1.20.4 want 17, and 1.20.5+ want 21."
        actions={
          <GlassButton variant="glass" size="sm" onClick={scan} disabled={scanning}>
            <RotateCcw size={13} /> {scanning ? 'Scanning…' : 'Rescan'}
          </GlassButton>
        }
      >
        <Row
          label="Download Java automatically"
          desc="Fetches a matching Eclipse Temurin runtime when an instance needs one you don't have"
        >
          <GlassSwitch
            checked={settings.java.autoDownload}
            onChange={(autoDownload) => void patch({ java: { autoDownload } })}
            label="Download Java automatically"
          />
        </Row>
        <Row
          label="Skip compatibility checks"
          desc="Launch even when the Java version doesn't match what the game asks for. Expect crashes."
        >
          <GlassSwitch
            checked={settings.java.skipCompatChecks}
            onChange={(skipCompatChecks) => void patch({ java: { skipCompatChecks } })}
            label="Skip compatibility checks"
          />
        </Row>

        <div style={{ padding: 'var(--sp-3)' }}>
          <span className="field__label">Detected Installations</span>
          <div className="stack" style={{ gap: 2, marginTop: 8 }}>
            {installs.length === 0 && (
              <p className="panel__hint">
                {scanning ? 'Looking for Java…' : 'No Java found on this machine. Automatic downloads will handle it.'}
              </p>
            )}
            {installs.map((inst) => {
              const selected = settings.java.path === inst.path
              return (
                <button
                  key={inst.path}
                  className="row row--button"
                  onClick={() => void patch({ java: { path: selected ? null : inst.path } })}
                >
                  <span className="row__text">
                    <span className="row__label">
                      Java {inst.version} <span className="muted">· {inst.vendor}</span>
                    </span>
                    <span className="row__desc mono truncate">{inst.path}</span>
                  </span>
                  <span className="row__control">
                    {inst.arch === 'x86' && <Badge tone="warn">32-bit</Badge>}
                    {inst.managed && <Badge tone="accent">Managed</Badge>}
                    {selected && <Badge tone="ok">Selected</Badge>}
                  </span>
                </button>
              )
            })}
          </div>
          {settings.java.path && (
            <div style={{ marginTop: 'var(--sp-3)' }}>
              <GlassButton variant="quiet" size="sm" onClick={() => void patch({ java: { path: null } })}>
                Clear selection and choose automatically
              </GlassButton>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="JVM Arguments" hint="Applied to every instance unless the instance overrides them.">
        <div style={{ padding: 'var(--sp-3)' }}>
          <textarea
            className="textarea mono"
            value={settings.java.jvmArgs}
            spellCheck={false}
            onChange={(e) => void patch({ java: { jvmArgs: e.target.value } })}
          />
        </div>
      </Panel>
    </>
  )
}

function MinecraftSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)
  const m = settings.minecraft

  return (
    <>
      <Panel title="Game Window">
        <Row label="Width">
          <input
            className="input"
            style={{ width: 110 }}
            type="number"
            value={m.window.width}
            onChange={(e) => void patch({ minecraft: { window: { width: Number(e.target.value) } } })}
          />
        </Row>
        <Row label="Height">
          <input
            className="input"
            style={{ width: 110 }}
            type="number"
            value={m.window.height}
            onChange={(e) => void patch({ minecraft: { window: { height: Number(e.target.value) } } })}
          />
        </Row>
        <Row label="Start maximized">
          <GlassSwitch
            checked={m.window.maximized}
            onChange={(maximized) => void patch({ minecraft: { window: { maximized } } })}
            label="Start maximized"
          />
        </Row>
        <Row label="Start in fullscreen">
          <GlassSwitch
            checked={m.window.fullscreen}
            onChange={(fullscreen) => void patch({ minecraft: { window: { fullscreen } } })}
            label="Start in fullscreen"
          />
        </Row>
      </Panel>

      <Panel title="Launcher Behaviour">
        <Row label="Hide the launcher while playing" desc="Reappears when the game closes">
          <GlassSwitch
            checked={m.closeLauncherOnLaunch}
            onChange={(closeLauncherOnLaunch) => void patch({ minecraft: { closeLauncherOnLaunch } })}
            label="Hide the launcher while playing"
          />
        </Row>
        <Row label="Quit the launcher when the game exits">
          <GlassSwitch
            checked={m.quitLauncherOnGameExit}
            onChange={(quitLauncherOnGameExit) => void patch({ minecraft: { quitLauncherOnGameExit } })}
            label="Quit the launcher when the game exits"
          />
        </Row>
        <Row label="Open the log after launching" desc="Useful while a modpack is still misbehaving">
          <GlassSwitch
            checked={m.showLogAfterLaunch}
            onChange={(showLogAfterLaunch) => void patch({ minecraft: { showLogAfterLaunch } })}
            label="Open the log after launching"
          />
        </Row>
      </Panel>

      <Panel
        title="Native Libraries"
        hint="Use your system's GLFW and OpenAL instead of the copies Mojang ships. Helps on Wayland and with some audio setups; can break things otherwise."
      >
        <Row label="Use system GLFW">
          <GlassSwitch
            checked={m.useNativeGLFW}
            onChange={(useNativeGLFW) => void patch({ minecraft: { useNativeGLFW } })}
            label="Use system GLFW"
          />
        </Row>
        <Row label="Use system OpenAL">
          <GlassSwitch
            checked={m.useNativeOpenAL}
            onChange={(useNativeOpenAL) => void patch({ minecraft: { useNativeOpenAL } })}
            label="Use system OpenAL"
          />
        </Row>
      </Panel>
    </>
  )
}

/**
 * What every new modded instance starts with. Kept as a list the user edits
 * rather than a fixed set, so it covers "always give me Sodium" just as well as
 * "always give me the mod I'm developing".
 */
function NewInstanceSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)
  const toast = useStore((s) => s.toast)
  const [slug, setSlug] = useState('')
  const n = settings.newInstance

  const addSlug = (): void => {
    const clean = slug.trim().toLowerCase()
    if (!clean) return
    if (n.modrinthSlugs.includes(clean)) {
      toast('info', `${clean} is already in the list`)
      setSlug('')
      return
    }
    void patch({ newInstance: { modrinthSlugs: [...n.modrinthSlugs, clean] } })
    setSlug('')
  }

  const removeSlug = (value: string): void => {
    void patch({ newInstance: { modrinthSlugs: n.modrinthSlugs.filter((s) => s !== value) } })
  }

  const addJar = (): void => {
    void call<string | null>('dialog:pickFile', [{ name: 'Mod jar', extensions: ['jar'] }]).then((file) => {
      if (!file || n.localJars.includes(file)) return
      void patch({ newInstance: { localJars: [...n.localJars, file] } })
    })
  }

  const removeJar = (value: string): void => {
    void patch({ newInstance: { localJars: n.localJars.filter((j) => j !== value) } })
  }

  return (
    <>
      <Panel
        title="Default Mods"
        hint="Installed automatically into every new instance that has a mod loader. Vanilla instances are left alone, since they have nowhere to put mods."
      >
        <Row
          label="Install defaults on create"
          desc="The New Instance dialog can still turn this off case by case"
        >
          <GlassSwitch
            checked={n.installDefaults}
            onChange={(installDefaults) => void patch({ newInstance: { installDefaults } })}
            label="Install defaults on create"
          />
        </Row>
        <Row
          label="Also add them to modpacks"
          desc="Applies to imported .mrpack and CurseForge packs, and to packs installed from Discover. Anything the pack already ships is detected and left alone."
        >
          <GlassSwitch
            checked={n.applyToPacks}
            disabled={!n.installDefaults}
            onChange={(applyToPacks) => void patch({ newInstance: { applyToPacks } })}
            label="Also add them to modpacks"
          />
        </Row>
        <Row
          label="Skip mods that don't fit"
          desc="If a mod has no build for the chosen version or loader, carry on and report it rather than failing the whole instance"
        >
          <GlassSwitch
            checked={n.skipIncompatible}
            onChange={(skipIncompatible) => void patch({ newInstance: { skipIncompatible } })}
            label="Skip mods that don't fit"
          />
        </Row>
      </Panel>

      <Panel
        title="From Modrinth"
        hint="Project slugs, as they appear in the URL: modrinth.com/mod/**sodium**. The right build for each instance's version and loader is picked automatically."
      >
        <div style={{ padding: 'var(--sp-3)' }}>
          <div className="hstack" style={{ gap: 'var(--sp-2)' }}>
            <input
              className="input mono"
              value={slug}
              placeholder="sodium"
              spellCheck={false}
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addSlug()
              }}
            />
            <GlassButton variant="glass" onClick={addSlug} disabled={!slug.trim()} style={{ flex: 'none' }}>
              <Plus size={14} /> Add
            </GlassButton>
          </div>
        </div>
        {n.modrinthSlugs.length === 0 ? (
          <p className="panel__hint" style={{ padding: '0 var(--sp-3) var(--sp-3)' }}>
            Nothing configured. Most Fabric mods need <code>fabric-api</code>.
          </p>
        ) : (
          n.modrinthSlugs.map((value) => (
            <div className="row" key={value}>
              <span className="row__text">
                <span className="row__label mono">{value}</span>
              </span>
              <span className="row__control">
                <GlassButton
                  variant="quiet"
                  size="sm"
                  iconOnly
                  aria-label={`Open ${value} on Modrinth`}
                  onClick={() => void call('shell:openExternal', `https://modrinth.com/mod/${value}`)}
                >
                  <ExternalLink size={13} />
                </GlassButton>
                <GlassButton
                  variant="danger"
                  size="sm"
                  iconOnly
                  aria-label={`Remove ${value}`}
                  onClick={() => removeSlug(value)}
                >
                  <X size={14} />
                </GlassButton>
              </span>
            </div>
          ))
        )}
      </Panel>

      <Panel
        title="Local Jars"
        hint="Copied straight into the mods folder. Useful for a mod you build yourself — point this at prismatic-hud/fabric/build/libs and every new instance gets it."
        actions={
          <GlassButton variant="glass" size="sm" onClick={addJar}>
            <Plus size={13} /> Add jar
          </GlassButton>
        }
      >
        {n.localJars.length === 0 ? (
          <p className="panel__hint" style={{ padding: 'var(--sp-3)' }}>
            No local jars. These are copied as-is, so remember to re-add the file after you rebuild it with a new
            version number.
          </p>
        ) : (
          n.localJars.map((value) => (
            <div className="row" key={value}>
              <span className="row__text">
                <span className="row__label">{value.split(/[\\/]/).pop()}</span>
                <span className="row__desc mono truncate">{value}</span>
              </span>
              <span className="row__control">
                <GlassButton
                  variant="danger"
                  size="sm"
                  iconOnly
                  aria-label={`Remove ${value}`}
                  onClick={() => removeJar(value)}
                >
                  <X size={14} />
                </GlassButton>
              </span>
            </div>
          ))
        )}
      </Panel>
    </>
  )
}

function DownloadsSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)
  const d = settings.downloads

  return (
    <Panel title="Downloads">
      <Row label="Parallel downloads" desc="Higher is faster on good connections and worse on flaky ones">
        <div style={{ width: 240 }}>
          <SliderRow
            value={d.concurrency}
            min={1}
            max={32}
            onChange={(concurrency) => void patch({ downloads: { concurrency } })}
            label="Parallel downloads"
          />
        </div>
      </Row>
      <Row label="Verify file hashes" desc="Checks every download's SHA-1. Leave this on; it catches corrupt files before they crash the game.">
        <GlassSwitch
          checked={d.verifyHashes}
          onChange={(verifyHashes) => void patch({ downloads: { verifyHashes } })}
          label="Verify file hashes"
        />
      </Row>
      <Row label="Download mirror" desc="BMCLAPI is a mirror that is much faster from mainland China">
        <Segmented
          value={d.mirror}
          onChange={(mirror) => void patch({ downloads: { mirror } })}
          options={[
            { value: 'official', label: 'Mojang' },
            { value: 'bmclapi', label: 'BMCLAPI' }
          ]}
          layoutId="mirror"
        />
      </Row>
    </Panel>
  )
}

function CommandsSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)

  return (
    <Panel
      title="Custom Commands"
      hint="Placeholders such as ${game_directory}, ${version_name} and ${auth_player_name} are substituted before the command runs."
    >
      <div className="stack" style={{ padding: 'var(--sp-3)', gap: 'var(--sp-4)' }}>
        <Field label="Pre-launch command" hint="Runs before the game starts. A non-zero exit aborts the launch.">
          <input
            className="input mono"
            value={settings.commands.pre}
            placeholder='e.g. mkdir -p "${game_directory}/backups"'
            onChange={(e) => void patch({ commands: { pre: e.target.value } })}
          />
        </Field>
        <Field label="Wrapper command" hint="The game is launched through this. Used for prime-run, gamemoderun, mangohud.">
          <input
            className="input mono"
            value={settings.commands.wrapper}
            placeholder="e.g. gamemoderun"
            onChange={(e) => void patch({ commands: { wrapper: e.target.value } })}
          />
        </Field>
        <Field label="Post-exit command" hint="Runs after the game closes, whether it crashed or not.">
          <input
            className="input mono"
            value={settings.commands.post}
            placeholder="e.g. notify-send 'Minecraft closed'"
            onChange={(e) => void patch({ commands: { post: e.target.value } })}
          />
        </Field>
      </div>
    </Panel>
  )
}

function IntegrationsSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)
  const i = settings.integrations

  return (
    <>
      <Panel
        title="Microsoft Accounts"
        hint="Prismatic ships its own Azure application ID, approved by Mojang for the Java game service API, so sign-in works out of the box. Leave this empty unless you are running a fork with its own registration."
      >
        <div style={{ padding: 'var(--sp-3)' }}>
          <Field
            label="Azure application (client) ID"
            hint="Empty means the built-in ID is used."
          >
            <input
              className="input mono"
              value={i.msaClientId}
              placeholder="Using the built-in ID"
              onChange={(e) => void patch({ integrations: { msaClientId: e.target.value } })}
            />
          </Field>
          <div className="hstack" style={{ marginTop: 'var(--sp-3)' }}>
            {i.msaClientId && (
              <GlassButton
                variant="quiet"
                size="sm"
                onClick={() => void patch({ integrations: { msaClientId: '' } })}
              >
                Use the built-in ID
              </GlassButton>
            )}
            <GlassButton
              variant="quiet"
              size="sm"
              onClick={() => void call('shell:openExternal', 'https://aka.ms/mce-reviewappid')}
            >
              <ExternalLink size={13} /> Register your own
            </GlassButton>
          </div>
          <p className="panel__hint" style={{ marginTop: 'var(--sp-3)' }}>
            A client ID is a public identifier, not a secret — the device code flow has no client secret, and
            signing in still happens on Microsoft&rsquo;s own page.
          </p>
        </div>
      </Panel>

      <Panel
        title="CurseForge"
        hint="Modrinth works with no key at all. CurseForge's API requires one, which you can create for free at console.curseforge.com."
      >
        <div style={{ padding: 'var(--sp-3)' }}>
          <Field label="API key">
            <input
              className="input mono"
              type="password"
              value={i.curseforgeApiKey}
              placeholder="Leave empty to use Modrinth only"
              onChange={(e) => void patch({ integrations: { curseforgeApiKey: e.target.value } })}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Discord">
        <Row label="Rich Presence" desc="Shows the instance you're playing on your Discord profile">
          <GlassSwitch
            checked={i.discordRichPresence}
            onChange={(discordRichPresence) => void patch({ integrations: { discordRichPresence } })}
            label="Discord Rich Presence"
          />
        </Row>
      </Panel>
    </>
  )
}

/**
 * Update settings.
 *
 * The launcher checks and tells you; it does not install. An MSI has to be
 * replaced by running a newer MSI, which Windows applies as an in-place
 * upgrade, and electron-updater has no MSI support to lean on.
 */
function UpdatesSection({ settings }: { settings: Settings }): React.JSX.Element {
  const patch = useStore((s) => s.patchSettings)
  const toast = useStore((s) => s.toast)
  const u = settings.updates

  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{
    currentVersion: string
    latestVersion: string
    updateAvailable: boolean
    notes: string
    url: string
    downloadUrl: string | null
  } | null>(null)

  const checkNow = (): void => {
    setChecking(true)
    setResult(null)
    void call<typeof result>('updates:check')
      .then((res) => {
        setResult(res)
        if (res && !res.updateAvailable) toast('success', `You are on the latest version (${res.currentVersion})`)
      })
      .catch((err) => toast('error', 'Update check failed', String(err).replace(/^Error:\s*/, '')))
      .finally(() => setChecking(false))
  }

  return (
    <>
      <Panel
        title="Updates"
        hint="Prismatic tells you when a new version is out and opens the download. It does not install it for you — an MSI is replaced by running the newer MSI, which Windows applies as an in-place upgrade."
        actions={
          <GlassButton variant="glass" size="sm" onClick={checkNow} disabled={checking || u.source === 'none'}>
            <RotateCcw size={13} className={checking ? 'spin' : undefined} /> Check now
          </GlassButton>
        }
      >
        <Row label="Where to look">
          <Segmented
            value={u.source}
            onChange={(source) => void patch({ updates: { source } })}
            options={[
              { value: 'github', label: 'GitHub' },
              { value: 'url', label: 'Custom URL' },
              { value: 'none', label: 'Off' }
            ]}
            layoutId="update-source"
          />
        </Row>

        {u.source === 'github' && (
          <div style={{ padding: 'var(--sp-3)' }}>
            <Field
              label="Repository"
              hint="owner/repo. Reads the Releases page, so publishing an update means creating a release and attaching the installer."
            >
              <input
                className="input mono"
                value={u.githubRepo}
                placeholder="jannes/prismatic"
                spellCheck={false}
                onChange={(e) => void patch({ updates: { githubRepo: e.target.value } })}
              />
            </Field>
          </div>
        )}

        {u.source === 'url' && (
          <div style={{ padding: 'var(--sp-3)' }}>
            <Field
              label="Feed URL"
              hint='A JSON file like {"version":"0.3.0","notes":"…","downloadUrl":"https://…"}'
            >
              <input
                className="input mono"
                value={u.feedUrl}
                placeholder="https://example.com/prismatic/latest.json"
                spellCheck={false}
                onChange={(e) => void patch({ updates: { feedUrl: e.target.value } })}
              />
            </Field>
          </div>
        )}

        <Row label="Check when the launcher starts" desc="A failed check on startup stays silent">
          <GlassSwitch
            checked={u.checkOnStartup}
            disabled={u.source === 'none'}
            onChange={(checkOnStartup) => void patch({ updates: { checkOnStartup } })}
            label="Check on startup"
          />
        </Row>

        <Row label="Include pre-releases" desc="Offers beta builds as well as stable ones">
          <GlassSwitch
            checked={u.includePrereleases}
            disabled={u.source !== 'github'}
            onChange={(includePrereleases) => void patch({ updates: { includePrereleases } })}
            label="Include pre-releases"
          />
        </Row>

        {result && (
          <Row
            label={
              result.updateAvailable
                ? `Version ${result.latestVersion} is available`
                : `Up to date (${result.currentVersion})`
            }
            desc={result.updateAvailable ? `You have ${result.currentVersion}.` : undefined}
          >
            {result.updateAvailable && (
              <GlassButton variant="prominent" size="sm" onClick={() => void call('updates:download', result)}>
                <ExternalLink size={13} /> Download
              </GlassButton>
            )}
          </Row>
        )}

        {u.dismissedVersion && (
          <Row label="Dismissed update" desc={`You hid the banner for ${u.dismissedVersion}.`}>
            <GlassButton variant="quiet" size="sm" onClick={() => void patch({ updates: { dismissedVersion: '' } })}>
              Show it again
            </GlassButton>
          </Row>
        )}
      </Panel>

      <Panel title="Publishing an Update" hint="For when you are the one shipping the new version.">
        <div style={{ padding: 'var(--sp-3)' }}>
          <ol className="panel__hint" style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
            <li>
              Raise <code>version</code> in <code>package.json</code>.
            </li>
            <li>
              Run <code>npm run pack:msi</code>.
            </li>
            <li>Create a GitHub release tagged with that version and attach the .msi.</li>
            <li>Everyone running an older build sees the banner on next start.</li>
          </ol>
          <p className="panel__hint" style={{ marginTop: 'var(--sp-3)' }}>
            The MSI keeps the same upgrade code between versions, so installing a newer one replaces the old
            installation rather than adding a second copy.
          </p>
        </div>
      </Panel>
    </>
  )
}

function AboutSection(): React.JSX.Element {
  const [info, setInfo] = useState<Record<string, string> | null>(null)
  const reset = useStore((s) => s.patchSettings)
  const toast = useStore((s) => s.toast)

  useEffect(() => {
    void call<Record<string, string>>('app:info').then(setInfo).catch(() => {})
  }, [])

  return (
    <>
      <Panel title="About Prismatic">
        <div style={{ padding: 'var(--sp-3)' }}>
          <p className="panel__hint" style={{ marginBottom: 'var(--sp-4)' }}>
            An open-source Minecraft launcher with a Liquid Glass interface. Not affiliated with Mojang or Microsoft.
          </p>
          <dl className="kv">
            <dt>Version</dt>
            <dd>{info?.version ?? '—'}</dd>
            <dt>Electron</dt>
            <dd>{info?.electron ?? '—'}</dd>
            <dt>Chromium</dt>
            <dd>{info?.chrome ?? '—'}</dd>
            <dt>Node</dt>
            <dd>{info?.node ?? '—'}</dd>
            <dt>Platform</dt>
            <dd>{info?.platform ?? '—'}</dd>
            <dt>Data folder</dt>
            <dd className="mono" style={{ wordBreak: 'break-all' }}>
              {info?.dataDir ?? '—'}
            </dd>
          </dl>
          <div className="hstack" style={{ marginTop: 'var(--sp-4)' }}>
            <GlassButton variant="glass" size="sm" onClick={() => void call('shell:openPath', info?.dataDir ?? '')}>
              <FolderOpen size={13} /> Open data folder
            </GlassButton>
          </div>
        </div>
      </Panel>

      <Panel title="Reset">
        <Row label="Restore default settings" desc="Instances, accounts and downloaded files are left untouched">
          <GlassButton
            variant="danger"
            size="sm"
            onClick={() => {
              void call<boolean>('dialog:confirm', 'Reset settings', 'Restore every setting to its default?', 'Reset').then(
                (ok) => {
                  if (!ok) return
                  void call('settings:reset').then(() => {
                    void reset({})
                    toast('success', 'Settings restored to defaults')
                  })
                }
              )
            }}
          >
            <RotateCcw size={13} /> Reset
          </GlassButton>
        </Row>
      </Panel>
    </>
  )
}
