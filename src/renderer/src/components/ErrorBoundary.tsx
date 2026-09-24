import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { GlassButton } from './Glass'

/**
 * Stops one broken view from blanking the whole launcher.
 *
 * React unmounts the entire tree when a render throws, so without this a null
 * from a single IPC channel turns into a white window with no way back. The
 * game, the downloads and every other screen are unaffected by that bug — the
 * interface should reflect that.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string; onReset?(): void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the component stack, which is what actually identifies the culprit.
    console.error('[Prismatic] View crashed:', error, info.componentStack)
  }

  private reset = (): void => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="view">
        <div className="glass panel" style={{ padding: 'var(--sp-5)' }}>
          <div className="hstack" style={{ gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
            <AlertTriangle size={22} style={{ color: 'var(--warn)', flex: 'none', marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="panel__title">
                {this.props.label ? `${this.props.label} stopped working` : 'This view stopped working'}
              </h2>
              <p className="panel__hint">
                The rest of the launcher is fine — your instances, downloads and any running game are untouched.
              </p>
              <pre
                className="mono"
                style={{
                  marginTop: 'var(--sp-3)',
                  padding: 'var(--sp-3)',
                  background: 'rgba(0,0,0,.25)',
                  borderRadius: 'var(--r-md)',
                  overflow: 'auto',
                  maxHeight: 200,
                  fontSize: 11,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {error.message}
                {error.stack ? `\n\n${error.stack.split('\n').slice(1, 6).join('\n')}` : ''}
              </pre>
              <div className="hstack" style={{ marginTop: 'var(--sp-4)' }}>
                <GlassButton variant="prominent" onClick={this.reset}>
                  <RotateCcw size={14} /> Try again
                </GlassButton>
                <GlassButton variant="quiet" onClick={() => window.location.reload()}>
                  Reload the launcher
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
