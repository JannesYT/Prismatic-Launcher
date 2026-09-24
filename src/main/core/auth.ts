import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { paths } from './paths'
import { getSettings, MSA_CLIENT_ID } from './settings'
import { USER_AGENT } from './net'
import type { Account, DeviceCodePrompt } from '../../shared/types'

/**
 * Microsoft account login via the OAuth 2.0 device code flow, then the
 * Xbox Live -> XSTS -> Minecraft Services token chain.
 *
 * Device code is used instead of an embedded webview because it avoids shipping
 * a browser window that handles the user's Microsoft password.
 *
 * You must register your own Azure application ("Mobile and desktop", public
 * client, with "Allow public client flows" enabled) and put its Application
 * (client) ID in Settings -> Integrations. Microsoft requires each launcher to
 * use its own ID; there is no shared one.
 */
const OAUTH_BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE = 'XboxLive.signin offline_access'

interface StoredAccount extends Account {
  msRefreshToken?: string
  mcAccessToken?: string
  xuid?: string
}

interface AccountsFile {
  accounts: StoredAccount[]
}

function load(): AccountsFile {
  if (!existsSync(paths.accounts)) return { accounts: [] }
  try {
    return JSON.parse(readFileSync(paths.accounts, 'utf8')) as AccountsFile
  } catch {
    return { accounts: [] }
  }
}

function save(file: AccountsFile): void {
  writeFileSync(paths.accounts, JSON.stringify(file, null, 2), 'utf8')
}

/** Public view — never leaks tokens to the renderer. */
function publicView(a: StoredAccount): Account {
  const { msRefreshToken: _r, mcAccessToken: _t, xuid: _x, ...rest } = a
  return rest
}

export function listAccounts(): Account[] {
  return load().accounts.map(publicView)
}

export function getActiveAccount(): StoredAccount | null {
  const file = load()
  return file.accounts.find((a) => a.active) ?? file.accounts[0] ?? null
}

export function setActiveAccount(id: string): Account[] {
  const file = load()
  for (const a of file.accounts) a.active = a.id === id
  save(file)
  return file.accounts.map(publicView)
}

export function removeAccount(id: string): Account[] {
  const file = load()
  file.accounts = file.accounts.filter((a) => a.id !== id)
  if (file.accounts.length && !file.accounts.some((a) => a.active)) file.accounts[0].active = true
  save(file)
  return file.accounts.map(publicView)
}

function upsert(account: StoredAccount): Account {
  const file = load()
  const idx = file.accounts.findIndex((a) => a.uuid === account.uuid)
  if (idx >= 0) {
    file.accounts[idx] = { ...file.accounts[idx], ...account }
  } else {
    if (file.accounts.length === 0) account.active = true
    file.accounts.push(account)
  }
  save(file)
  return publicView(account)
}

// --- Offline accounts -------------------------------------------------------

/** Deterministic offline UUID, matching the scheme vanilla servers use. */
export function offlineUuid(username: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${username}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x30 // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80 // variant
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function addOfflineAccount(username: string): Account {
  const clean = username.trim()
  if (!/^[A-Za-z0-9_]{1,16}$/.test(clean)) {
    throw new Error('Offline usernames must be 1–16 characters: letters, digits or underscore.')
  }
  return upsert({
    id: randomUUID(),
    type: 'offline',
    username: clean,
    uuid: offlineUuid(clean),
    active: false
  })
}

// --- Microsoft device code flow --------------------------------------------

function clientId(): string {
  // Settings win when set, so a fork can use its own registration. Falling
  // back to the built-in ID also covers configs written before there was one:
  // a stored empty string would otherwise override the new default, because
  // stored values are merged over defaults.
  const configured = getSettings().integrations.msaClientId.trim()
  const id = configured || MSA_CLIENT_ID
  if (!id) {
    throw new Error(
      'No Microsoft client ID configured. Register a free Azure app (Mobile & desktop, public client, ' +
        'personal accounts), get it approved at https://aka.ms/mce-reviewappid, then paste its ' +
        'Application ID into Settings -> Integrations.'
    )
  }
  return id
}

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams(body).toString()
  })
  const json = (await res.json()) as T & { error?: string; error_description?: string }
  if (!res.ok && !json.error) throw new Error(`POST ${url} -> ${res.status}`)
  return json
}

async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`POST ${url} -> ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export async function startDeviceCode(): Promise<DeviceCodePrompt & { deviceCode: string; interval: number }> {
  const res = await postForm<{
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
    message: string
    error?: string
    error_description?: string
  }>(`${OAUTH_BASE}/devicecode`, { client_id: clientId(), scope: SCOPE })

  if (res.error) throw new Error(res.error_description ?? res.error)
  return {
    userCode: res.user_code,
    verificationUri: res.verification_uri,
    expiresIn: res.expires_in,
    message: res.message,
    deviceCode: res.device_code,
    interval: res.interval || 5
  }
}

interface MsTokens {
  access_token: string
  refresh_token: string
  expires_in: number
}

/** Poll until the user finishes signing in, or the code expires. */
export async function pollDeviceCode(
  deviceCode: string,
  intervalSeconds: number,
  signal?: AbortSignal
): Promise<MsTokens> {
  let wait = Math.max(1, intervalSeconds) * 1000
  const deadline = Date.now() + 15 * 60 * 1000

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Sign-in cancelled')
    await new Promise((r) => setTimeout(r, wait))

    const res = await postForm<MsTokens & { error?: string; error_description?: string }>(`${OAUTH_BASE}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId(),
      device_code: deviceCode
    })

    if (!res.error) return res
    if (res.error === 'authorization_pending') continue
    if (res.error === 'slow_down') {
      wait += 5000
      continue
    }
    if (res.error === 'expired_token') throw new Error('The sign-in code expired. Please try again.')
    if (res.error === 'authorization_declined') throw new Error('Sign-in was declined.')
    throw new Error(res.error_description ?? res.error)
  }
  throw new Error('Sign-in timed out.')
}

async function refreshMsTokens(refreshToken: string): Promise<MsTokens> {
  const res = await postForm<MsTokens & { error?: string; error_description?: string }>(`${OAUTH_BASE}/token`, {
    grant_type: 'refresh_token',
    client_id: clientId(),
    refresh_token: refreshToken,
    scope: SCOPE
  })
  if (res.error) throw new Error(res.error_description ?? res.error)
  return res
}

/** Microsoft access token -> Minecraft access token + profile. */
interface MinecraftSession {
  mcAccessToken: string
  expiresIn: number
  uuid: string
  username: string
  xuid: string
  skinUrl?: string
  capes: { id: string; name: string; url: string; active: boolean }[]
}

async function msaToMinecraft(msAccessToken: string): Promise<MinecraftSession> {
  // 1. Xbox Live
  const xbl = await postJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    }
  )

  // 2. XSTS
  let xsts: { Token: string; DisplayClaims: { xui: { uhs: string; xid?: string }[] } }
  try {
    xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  } catch (err) {
    const msg = String(err)
    // Microsoft's well-known XSTS error codes, translated into something actionable.
    if (msg.includes('2148916233')) throw new Error('This Microsoft account has no Xbox profile. Create one at xbox.com, then sign in again.')
    if (msg.includes('2148916235')) throw new Error('Xbox Live is not available in this account’s region.')
    if (msg.includes('2148916238')) throw new Error('This is a child account. It must be added to a Microsoft Family before it can sign in.')
    throw err
  }

  const uhs = xsts.DisplayClaims.xui[0].uhs
  const xuid = xsts.DisplayClaims.xui[0].xid ?? ''

  // 3. Minecraft Services
  let mc: { access_token: string; expires_in: number }
  try {
    mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
      identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
    })
  } catch (err) {
    const message = String(err)
    // Mojang allowlists every new Azure app ID by hand (a 2023 anti-phishing
    // measure). An unapproved ID fails here, after Xbox Live has already
    // succeeded, so the raw error looks like a token problem rather than a
    // registration one. Say what it actually is.
    if (message.includes('Invalid app registration') || message.includes('403')) {
      throw new Error(
        'Microsoft accepted the sign-in, but Minecraft rejected this launcher’s app registration.\n\n' +
          'Mojang manually approves every new Azure application before it may use the Java game service ' +
          'API. Apply at https://aka.ms/mce-reviewappid and sign in again once the approval arrives.\n\n' +
          'Check the registration too: "Allow public client flows" must be Yes, and supported account ' +
          'types must include personal Microsoft accounts.\n\n' +
          'Offline accounts work in the meantime for singleplayer and LAN.'
      )
    }
    throw err
  }

  // 4. Profile (also proves game ownership — a 404 here means no entitlement)
  const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}`, 'User-Agent': USER_AGENT }
  })
  if (profileRes.status === 404) {
    throw new Error('This account does not own Minecraft: Java Edition.')
  }
  if (!profileRes.ok) throw new Error(`Profile lookup failed: ${profileRes.status}`)

  const profile = (await profileRes.json()) as {
    id: string
    name: string
    skins?: { id: string; url: string; state: string }[]
    capes?: { id: string; url: string; alias?: string; state: string }[]
  }

  const id = profile.id
  const uuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`

  return {
    mcAccessToken: mc.access_token,
    expiresIn: mc.expires_in,
    uuid,
    username: profile.name,
    xuid,
    skinUrl: profile.skins?.find((s) => s.state === 'ACTIVE')?.url,
    capes: (profile.capes ?? []).map((c) => ({
      id: c.id,
      name: c.alias ?? 'Cape',
      url: c.url,
      active: c.state === 'ACTIVE'
    }))
  }
}

export async function finishMicrosoftLogin(tokens: MsTokens): Promise<Account> {
  const mc = await msaToMinecraft(tokens.access_token)
  return upsert({
    id: randomUUID(),
    type: 'msa',
    username: mc.username,
    uuid: mc.uuid,
    expiresAt: Date.now() + mc.expiresIn * 1000,
    skinUrl: mc.skinUrl,
    capes: mc.capes,
    active: false,
    msRefreshToken: tokens.refresh_token,
    mcAccessToken: mc.mcAccessToken,
    xuid: mc.xuid
  })
}

/** Returns a usable Minecraft access token, refreshing silently when stale. */
export async function ensureToken(accountId?: string): Promise<{
  username: string
  uuid: string
  accessToken: string
  type: 'msa' | 'offline'
  xuid: string
}> {
  const file = load()
  const account = accountId
    ? file.accounts.find((a) => a.id === accountId)
    : file.accounts.find((a) => a.active) ?? file.accounts[0]
  if (!account) throw new Error('No account selected. Add one in the Accounts tab.')

  if (account.type === 'offline') {
    return { username: account.username, uuid: account.uuid, accessToken: '0', type: 'offline', xuid: '' }
  }

  const stillValid = account.expiresAt && account.expiresAt - Date.now() > 60_000
  if (stillValid && account.mcAccessToken) {
    return {
      username: account.username,
      uuid: account.uuid,
      accessToken: account.mcAccessToken,
      type: 'msa',
      xuid: account.xuid ?? ''
    }
  }

  if (!account.msRefreshToken) throw new Error(`Session for ${account.username} expired. Please sign in again.`)
  const refreshed = await refreshMsTokens(account.msRefreshToken)
  const mc = await msaToMinecraft(refreshed.access_token)

  account.msRefreshToken = refreshed.refresh_token
  account.mcAccessToken = mc.mcAccessToken
  account.expiresAt = Date.now() + mc.expiresIn * 1000
  account.username = mc.username
  account.skinUrl = mc.skinUrl
  account.capes = mc.capes
  account.xuid = mc.xuid
  save(file)

  return { username: mc.username, uuid: mc.uuid, accessToken: mc.mcAccessToken, type: 'msa', xuid: mc.xuid }
}
