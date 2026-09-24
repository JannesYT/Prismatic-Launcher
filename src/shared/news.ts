/** A single news item, whatever it came from. */
export interface NewsPost {
  id: string
  title: string
  /** One-line teaser shown in the list. */
  summary: string
  /** Markdown. Rendered to React elements, never to raw HTML. */
  body: string
  /** ISO date, e.g. 2026-09-23. */
  date: string
  /** Free-text label: "Update", "Heads up", "Release"… */
  tag: string
  /** Absolute URL or a prismatic-file path. */
  image: string | null
  /** Opens externally instead of showing the body, when set. */
  link: string | null
  pinned: boolean
  source: NewsSourceKind
  /** Which feed it came from, for the badge on the card. */
  sourceName: string
  /** Local posts only: the file it lives in, so it can be edited or deleted. */
  file?: string
}

export type NewsSourceKind = 'local' | 'remote' | 'mojang'

export interface NewsFeed {
  id: string
  name: string
  url: string
  enabled: boolean
}

/** What a hand-written post looks like on disk, for the docs and the composer. */
export const EXAMPLE_POST = `---
title: Prismatic 0.2 is out
date: 2026-09-23
tag: Release
pinned: true
---

The **big one**: custom themes, four layouts and a news tab.

- Pick a theme in Settings
- Drop your own instance icons in
- Write posts like this one

`
