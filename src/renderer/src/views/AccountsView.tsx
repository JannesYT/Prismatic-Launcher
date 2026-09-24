import { useState } from 'react'
import {
  Plus,
  Trash2,
  Check,
  Copy,
  UserPlus,
  ShieldCheck,
  RefreshCw,
  WifiOff,
  CircleUserRound,
  Pencil,
  ExternalLink
} from 'lucide-react'
import { GlassButton } from '../components/Glass'
import { Badge, EmptyState, Field, Panel } from '../components/Controls'
import { Sheet } from '../components/Sheet'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import type { Account, DeviceCodePrompt } from '../../../shared/types'

const OFFLINE_NAME = /^[A-Za-z0-9_]{1,16}$/

export function AccountsView(): React.JSX.Element {
  const accounts = useStore((s) => s.accounts)
  const active = accounts.find((a) => a.active) ?? null

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h1 className="view__title">Accounts</h1>
          <p className="view__subtitle">
            {active ? (
              <>
                Launching as <strong>{active.username}</strong>
                {active.type === 'offline' && ' (offline)'}
              </>
            ) : (
              'No account selected yet — add one below to be able to play.'
            )}
          </p>
        </div>
      </div>

      {/* Two peer managers rather than one mixed list: the two account types
          have genuinely different capabilities and failure modes. */}
      <div className="two-col">
        <MicrosoftManager />
        <OfflineManager />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Microsoft
// ---------------------------------------------------------------------------

function MicrosoftManager(): React.JSX.Element {
  const accounts = useStore((s) => s.accounts).filter((a) => a.type === 'msa')
  const toast = useStore((s) => s.toast)

  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState<DeviceCodePrompt | null>(null)

  const startSignIn = (): void => {
    setBusy(true)
    void call<DeviceCodePrompt>('accounts:msaStart')
      .then((p) => {
        setPrompt(p)
        void call('shell:openExternal', p.verificationUri)
      })
      .catch((err) => toast('error', 'Could not start sign-in', String(err).replace(/^Error:\s*/, '')))
      .finally(() => setBusy(false))
  }

  return (
    <div>
      <Panel
        title="Microsoft Accounts"
        hint="Accounts that own Minecraft: Java Edition. These work on every server, keep your skin and capes, and are the only way to play online."
        actions={
          <GlassButton variant="prominent" size="sm" onClick={startSignIn} disabled={busy}>
            <Plus size={14} /> Add
          </GlassButton>
        }
      >
        {accounts.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={24} />}
            title="No Microsoft account"
            text="Sign in with the account that owns the game. Prismatic never sees your password — Microsoft shows you a code to type on their own site."
            action={
              <GlassButton variant="prominent" onClick={startSignIn} disabled={busy}>
                <Plus size={15} /> Sign in with Microsoft
              </GlassButton>
            }
          />
        ) : (
          accounts.map((account) => <AccountRow key={account.id} account={account} />)
        )}

        {/* Kept because a fork using its own unapproved registration will hit
            exactly this, and the error arrives after two successful steps so it
            reads like a token problem rather than a registration one. */}
        <div style={{ padding: 'var(--sp-3)', boxShadow: 'inset 0 1px 0 var(--line)' }}>
          <p className="panel__hint">
            Sign-in failing with <strong>Invalid app registration</strong>? That means the Azure application in use
            has not been approved by Mojang. Prismatic&rsquo;s built-in ID is approved, so this only affects a fork
            with its own registration set in Settings.
          </p>
          <div className="hstack" style={{ marginTop: 'var(--sp-2)' }}>
            <GlassButton
              variant="quiet"
              size="sm"
              onClick={() => void call('shell:openExternal', 'https://aka.ms/mce-reviewappid')}
            >
              <ExternalLink size={13} /> Request API access
            </GlassButton>
            <GlassButton
              variant="quiet"
              size="sm"
              onClick={() =>
                void call('shell:openExternal', 'https://help.minecraft.net/hc/en-us/articles/16254801392141')
              }
            >
              <ExternalLink size={13} /> Read the policy
            </GlassButton>
          </div>
        </div>
      </Panel>

      <DeviceCodeSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------

function OfflineManager(): React.JSX.Element {
  const accounts = useStore((s) => s.accounts).filter((a) => a.type === 'offline')
  const refresh = useStore((s) => s.refreshAccounts)
  const toast = useStore((s) => s.toast)

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const taken = accounts.some((a) => a.username.toLowerCase() === name.trim().toLowerCase())
  const valid = OFFLINE_NAME.test(name.trim())
  const canAdd = valid && !taken && !busy

  // Why the name is rejected, shown only once the user has typed something.
  const problem =
    name.trim() === ''
      ? null
      : !valid
        ? 'Use 1–16 characters: letters, digits and underscores only.'
        : taken
          ? 'You already have an offline account with that name.'
          : null

  const add = (): void => {
    if (!canAdd) return
    setBusy(true)
    void call<Account>('accounts:addOffline', name.trim())
      .then(() => {
        void refresh()
        toast('success', `Added ${name.trim()}`)
        setName('')
      })
      .catch((err) => toast('error', 'Could not add the account', String(err).replace(/^Error:\s*/, '')))
      .finally(() => setBusy(false))
  }

  return (
    <Panel
      title="Offline Accounts"
      hint="For LAN games, singleplayer and servers with online mode turned off. No sign-in, no skin, and public servers will reject them."
    >
      {/* Adding is inline here rather than behind a sheet: an offline account is
          just a name, so a dialog would be more ceremony than the task deserves. */}
      <div style={{ padding: 'var(--sp-3)' }}>
        <Field label="New offline username">
          <div className="hstack" style={{ gap: 'var(--sp-2)' }}>
            <input
              className="input"
              value={name}
              placeholder="Steve"
              maxLength={16}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={problem !== null}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
            />
            <GlassButton variant="glass" onClick={add} disabled={!canAdd} style={{ flex: 'none' }}>
              <UserPlus size={14} /> Add
            </GlassButton>
          </div>
        </Field>
        {problem && (
          <p className="panel__hint" style={{ color: 'var(--bad)', marginTop: 6 }}>
            {problem}
          </p>
        )}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<WifiOff size={24} />}
          title="No offline accounts"
          text="Handy for testing a modpack without signing in, or for playing on a local server."
        />
      ) : (
        accounts.map((account) => <AccountRow key={account.id} account={account} />)
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Shared row
// ---------------------------------------------------------------------------

function AccountRow({ account }: { account: Account }): React.JSX.Element {
  const refresh = useStore((s) => s.refreshAccounts)
  const toast = useStore((s) => s.toast)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(account.username)

  const isOffline = account.type === 'offline'

  const setActive = (): void => {
    void call('accounts:setActive', account.id)
      .then(() => refresh())
      .catch((err) => toast('error', 'Could not switch account', String(err)))
  }

  const remove = (): void => {
    void call<boolean>(
      'dialog:confirm',
      'Remove account',
      `Remove ${account.username}? ${isOffline ? 'Worlds created with it are not touched.' : 'You can sign in again at any time.'}`,
      'Remove'
    ).then((ok) => {
      if (!ok) return
      void call('accounts:remove', account.id)
        .then(() => refresh())
        .catch((err) => toast('error', 'Could not remove the account', String(err)))
    })
  }

  // Renaming an offline account changes its UUID, because the UUID is derived
  // from the name. That silently orphans singleplayer inventories, so say so.
  const commitRename = (): void => {
    const next = draft.trim()
    setRenaming(false)
    if (next === account.username) return
    if (!OFFLINE_NAME.test(next)) {
      toast('error', 'Invalid username', 'Use 1–16 characters: letters, digits and underscores.')
      setDraft(account.username)
      return
    }
    void call<boolean>(
      'dialog:confirm',
      'Rename offline account',
      `Rename "${account.username}" to "${next}"? An offline account's UUID is derived from its name, so the game will treat this as a different player — existing inventories and positions in singleplayer worlds stay with the old name.`,
      'Rename'
    ).then((ok) => {
      if (!ok) {
        setDraft(account.username)
        return
      }
      // Replace rather than mutate: the UUID has to be recomputed.
      void call('accounts:remove', account.id)
        .then(() => call<Account>('accounts:addOffline', next))
        .then((created) => (account.active ? call('accounts:setActive', created.id) : null))
        .then(() => refresh())
        .then(() => toast('success', `Renamed to ${next}`))
        .catch((err) => {
          toast('error', 'Rename failed', String(err).replace(/^Error:\s*/, ''))
          void refresh()
        })
    })
  }

  return (
    <div className="row">
      <Avatar account={account} />

      <span className="row__text">
        {renaming ? (
          <input
            className="input"
            style={{ height: 30, maxWidth: 200 }}
            value={draft}
            maxLength={16}
            autoFocus
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setDraft(account.username)
                setRenaming(false)
              }
            }}
          />
        ) : (
          <span className="row__label">{account.username}</span>
        )}
        <span className="row__desc mono truncate" title={account.uuid}>
          {account.uuid}
        </span>
      </span>

      <span className="row__control">
        {account.active ? (
          <Badge tone="accent">Active</Badge>
        ) : (
          <GlassButton variant="glass" size="sm" onClick={setActive}>
            <Check size={12} /> Use
          </GlassButton>
        )}

        {isOffline && !renaming && (
          <GlassButton
            variant="quiet"
            size="sm"
            iconOnly
            aria-label={`Rename ${account.username}`}
            onClick={() => {
              setDraft(account.username)
              setRenaming(true)
            }}
          >
            <Pencil size={13} />
          </GlassButton>
        )}

        {!isOffline && (
          <GlassButton
            variant="quiet"
            size="sm"
            iconOnly
            aria-label={`Refresh the session for ${account.username}`}
            onClick={() =>
              void call('accounts:refresh', account.id)
                .then(() => {
                  void refresh()
                  toast('success', 'Session refreshed')
                })
                .catch((err) => toast('error', 'Refresh failed', String(err).replace(/^Error:\s*/, '')))
            }
          >
            <RefreshCw size={13} />
          </GlassButton>
        )}

        <GlassButton
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={`Copy the UUID for ${account.username}`}
          onClick={() => {
            void call('clipboard:write', account.uuid)
            toast('info', 'UUID copied')
          }}
        >
          <Copy size={13} />
        </GlassButton>

        <GlassButton
          variant="danger"
          size="sm"
          iconOnly
          aria-label={`Remove ${account.username}`}
          onClick={remove}
        >
          <Trash2 size={13} />
        </GlassButton>
      </span>
    </div>
  )
}

function Avatar({ account }: { account: Account }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  // Crafatar renders a head from the UUID. Offline accounts have no skin on
  // record, so they get a generated initial instead.
  const src =
    account.type === 'msa' && !failed
      ? `https://crafatar.com/avatars/${account.uuid}?size=40&overlay`
      : null

  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 'var(--r-sm)',
        flex: 'none',
        background: account.type === 'offline' ? 'var(--fill-active)' : 'var(--fill)',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        fontWeight: 700,
        fontSize: 15,
        color: 'var(--ink-3)'
      }}
      title={account.type === 'msa' ? 'Microsoft account' : 'Offline account'}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={40}
          height={40}
          style={{ imageRendering: 'pixelated' }}
          onError={() => setFailed(true)}
        />
      ) : account.type === 'offline' ? (
        <CircleUserRound size={20} />
      ) : (
        account.username.slice(0, 1).toUpperCase()
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function DeviceCodeSheet({
  prompt,
  onClose
}: {
  prompt: DeviceCodePrompt | null
  onClose(): void
}): React.JSX.Element {
  const toast = useStore((s) => s.toast)

  return (
    <Sheet
      open={prompt !== null}
      title="Sign in with Microsoft"
      onClose={onClose}
      footer={
        <GlassButton variant="quiet" onClick={onClose}>
          Done
        </GlassButton>
      }
    >
      {prompt && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 'var(--sp-4)' }}>
          <p className="panel__hint" style={{ textAlign: 'center' }}>
            Go to <strong>{prompt.verificationUri}</strong> in your browser and enter this code. This window updates
            itself once you finish.
          </p>

          <div
            className="glass glass--allow-nested"
            style={{
              padding: 'var(--sp-4) var(--sp-6)',
              borderRadius: 'var(--r-lg)',
              fontFamily: 'var(--font-mono)',
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: '0.12em'
            }}
          >
            {prompt.userCode}
          </div>

          <div className="hstack">
            <GlassButton
              variant="glass"
              onClick={() => {
                void call('clipboard:write', prompt.userCode)
                toast('info', 'Code copied')
              }}
            >
              <Copy size={14} /> Copy code
            </GlassButton>
            <GlassButton variant="prominent" onClick={() => void call('shell:openExternal', prompt.verificationUri)}>
              Open the page
            </GlassButton>
          </div>

          <p className="panel__hint" style={{ textAlign: 'center' }}>
            Prismatic never sees your password. The code expires in about {Math.round(prompt.expiresIn / 60)} minutes.
          </p>
        </div>
      )}
    </Sheet>
  )
}
