import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  OPENAI_API_KEY_STORAGE_KEY,
  PAGE_SUMMARY_JSON_SCHEMA,
  PAGE_SUMMARY_MODEL,
  PAGE_SUMMARY_SCHEMA_NAME,
  type GeneratePageSummaryRequest,
  type PageSummaryData,
  type SummaryActionType,
} from '@/lib/openai'
import './App.css'

type AppProps = {
  pageTitle: string
}

type SummaryStatus = 'idle' | 'loading' | 'ready' | 'error'

type SummaryState = {
  status: SummaryStatus
  content: PageSummaryData | null
  message: string
}

type OpenAIResponsesApiResponse = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
  error?: {
    message?: string
  }
}

const SUMMARY_REQUEST_TIMEOUT_MS = 20000

const ARTICLE_PARAGRAPH_SELECTORS = [
  '#mw-content-text .mw-parser-output > p',
  '#mw-content-text > p',
  '.mf-section-0 > p',
  '.mf-section-1 > p',
  '.mf-section-0 p',
  '.mf-section-1 p',
  '#content .pcs-edit-section-title ~ p',
  '#content .pcs-lead-paragraph',
  'main #bodyContent p',
  'main section p',
  'main p',
]

const ARTICLE_CONTAINER_SELECTORS = [
  '#mw-content-text .mw-parser-output',
  '#mw-content-text',
  '#bodyContent',
  '.mf-section-0',
  '.mf-section-1',
  '#content',
  'main',
  'article',
]

const IMAGE_SELECTORS = [
  '.infobox img',
  '.mw-file-element',
  '.thumbimage',
  '.pcs-infobox img',
  '.pcs-lead-image img',
  '.gallery img',
  'figure img',
]

const LINK_CONTAINER_SELECTORS = [
  '#bodyContent',
  '#mw-content-text',
  '#content',
  'main',
  'article',
]

const LEAD_IMAGE_SELECTORS = [
  '.pcs-lead-image img',
  '.infobox .mw-file-element',
  '.infobox img',
  '.mw-parser-output > figure img',
  '.thumb img',
]

function getTextFromSelectors(selectors: string[]): string[] {
  return Array.from(document.querySelectorAll(selectors.join(', ')))
    .map(node => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(text => text.length > 0)
}

function getArticleText(): string {
  const paragraphs = getTextFromSelectors(ARTICLE_PARAGRAPH_SELECTORS)

  if (paragraphs.length > 0) {
    return paragraphs.join('\n\n').replace(/\s+/g, ' ').trim().slice(0, 12000)
  }

  const fallbackContainer = ARTICLE_CONTAINER_SELECTORS
    .map(selector => document.querySelector(selector))
    .find((node): node is HTMLElement => node instanceof HTMLElement)

  const articleText = fallbackContainer?.innerText.replace(/\s+/g, ' ').trim() ?? ''

  return articleText.slice(0, 12000)
}

function normalizeUrl(value: string | null | undefined): string {
  if (typeof value === 'string') {
    const trimmedValue = value.trim()

    if (trimmedValue.length === 0) {
      return ''
    }

    try {
      return new URL(trimmedValue, window.location.origin).href
    }
    catch {
      return ''
    }
  }

  return ''
}

function getImageCandidates(): GeneratePageSummaryRequest['payload']['imageCandidates'] {
  const candidates = Array.from(
    document.querySelectorAll(IMAGE_SELECTORS.join(', ')),
  )
    .map((node) => {
      if (node instanceof HTMLImageElement === false) {
        return null
      }

      const url = normalizeUrl(node.currentSrc || node.src)

      if (url.length === 0) {
        return null
      }

      return {
        alt: node.alt.trim(),
        url,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const unique = new Map<string, GeneratePageSummaryRequest['payload']['imageCandidates'][number]>()

  candidates.forEach((item) => {
    if (unique.has(item.url) === false) {
      unique.set(item.url, item)
    }
  })

  return Array.from(unique.values()).slice(0, 12)
}

function getLinkCandidates(): GeneratePageSummaryRequest['payload']['linkCandidates'] {
  const linkContainer = LINK_CONTAINER_SELECTORS
    .map(selector => document.querySelector(selector))
    .find((node): node is HTMLElement => node instanceof HTMLElement)

  const candidates = Array.from(linkContainer?.querySelectorAll('a') ?? [])
    .map((node) => {
      if (node instanceof HTMLAnchorElement === false) {
        return null
      }

      const label = node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const href = node.getAttribute('href') ?? ''
      const url = normalizeUrl(href)
      const isWikiHref = href.startsWith('/wiki/')
      const isSpecialPage = href.includes(':') || href.includes('#')

      if (label.length < 2 || url.length === 0) {
        return null
      }

      if (isWikiHref === false || isSpecialPage) {
        return null
      }

      return { label, url }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const unique = new Map<string, GeneratePageSummaryRequest['payload']['linkCandidates'][number]>()

  candidates.forEach((item) => {
    if (unique.has(item.url) === false) {
      unique.set(item.url, item)
    }
  })

  return Array.from(unique.values()).slice(0, 120)
}

function getStoredApiKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([OPENAI_API_KEY_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error('Impossible de lire la cle API OpenAI.'))
        return
      }

      const apiKey = typeof result[OPENAI_API_KEY_STORAGE_KEY] === 'string'
        ? result[OPENAI_API_KEY_STORAGE_KEY].trim()
        : ''

      resolve(apiKey)
    })
  })
}

function extractOutputText(response: OpenAIResponsesApiResponse): string {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const content = response.output
    ?.flatMap(item => item.content ?? [])
    .filter(item => item.type === 'output_text' && typeof item.text === 'string')
    .map(item => item.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')

  return content?.trim() ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value === Object(value)
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeActionType(value: unknown): SummaryActionType {
  if (value === 'open_chat' || value === 'open_wikipedia' || value === 'explore_links') {
    return value
  }

  return 'open_chat'
}

function normalizeSummary(
  raw: unknown,
  payload: GeneratePageSummaryRequest['payload'],
): PageSummaryData | null {
  if (isRecord(raw) === false) {
    return null
  }

  const quickFactsRaw = Array.isArray(raw.quickFacts) ? raw.quickFacts : []
  const quickFacts = quickFactsRaw
    .slice(0, 3)
    .map((item, index) => {
      const defaultLabels = ['Domaine', 'Periode', 'Pays']

      if (isRecord(item) === false) {
        return { label: defaultLabels[index] ?? 'Info', value: '' }
      }

      return {
        label: getString(item.label, defaultLabels[index] ?? 'Info'),
        value: getString(item.value),
      }
    })
    .filter(item => item.value)

  while (quickFacts.length < 3) {
    quickFacts.push({
      label: ['Domaine', 'Periode', 'Pays'][quickFacts.length] ?? 'Info',
      value: '',
    })
  }

  const explorationRaw = Array.isArray(raw.explorationItems) ? raw.explorationItems : []
  const explorationItems = explorationRaw
    .slice(0, 3)
    .map((item, index) => {
      if (isRecord(item) === false) {
        return {
          label: ['Moment cle', 'Anecdote', 'A approfondir'][index] ?? 'Explorer',
          detail: '',
        }
      }

      return {
        label: getString(item.label, ['Moment cle', 'Anecdote', 'A approfondir'][index] ?? 'Explorer'),
        detail: getString(item.detail),
      }
    })
    .filter(item => item.detail)

  while (explorationItems.length < 3) {
    explorationItems.push({
      label: ['Moment cle', 'Anecdote', 'A approfondir'][explorationItems.length] ?? 'Explorer',
      detail: '',
    })
  }

  const keyPointsRaw = Array.isArray(raw.keyPoints) ? raw.keyPoints : []
  const linkCandidateMap = new Map(payload.linkCandidates.map(item => [item.url, item]))
  const keyPoints = keyPointsRaw
    .map((item) => {
      if (isRecord(item) === false) {
        return null
      }

      const label = getString(item.label)
      const url = getString(item.url)

      if (label.length === 0) {
        return null
      }

      if (url.startsWith('http://') || url.startsWith('https://')) {
        return { label, url }
      }

      const fallbackCandidate = payload.linkCandidates.find(candidate => candidate.label === label)

      return {
        label,
        url: fallbackCandidate?.url ?? '',
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter(item => item.url.length === 0 || linkCandidateMap.has(item.url))
    .slice(0, 6)

  const engagementRaw = isRecord(raw.engagement) ? raw.engagement : {}
  const fallbackImage = payload.imageCandidates[0]?.url ?? ''
  const fallbackPrompt = `Je voudrais discuter de ${getString(raw.fullName, payload.pageTitle)}.`

  return {
    fullName: getString(raw.fullName, payload.pageTitle),
    title: getString(raw.title, 'Personnage historique'),
    mainImageUrl: getString(raw.mainImageUrl, fallbackImage),
    avatarImageUrl: getString(raw.avatarImageUrl, getString(raw.mainImageUrl, fallbackImage)),
    quickFacts: [quickFacts[0], quickFacts[1], quickFacts[2]],
    shortBio: getString(raw.shortBio, 'Resume indisponible pour le moment.'),
    explorationItems: [explorationItems[0], explorationItems[1], explorationItems[2]],
    keyPoints,
    engagement: {
      question: getString(engagementRaw.question, 'Tu aimerais lui poser une question ?'),
      ctaLabel: getString(engagementRaw.ctaLabel, 'Ouvrir le chat'),
      actionType: normalizeActionType(engagementRaw.actionType),
      actionPrompt: getString(engagementRaw.actionPrompt, fallbackPrompt),
    },
  }
}

async function requestPageSummary(pageTitle: string): Promise<PageSummaryData> {
  const pageContent = getArticleText()

  if (pageContent.length === 0) {
    return Promise.reject(new Error('Cette page ne contient pas assez de texte a resumer.'))
  }

  const payload: GeneratePageSummaryRequest['payload'] = {
    pageTitle,
    pageUrl: window.location.href,
    pageContent,
    imageCandidates: getImageCandidates(),
    linkCandidates: getLinkCandidates(),
  }

  const apiKey = await getStoredApiKey()

  if (apiKey.length === 0) {
    throw new Error('Configure une cle API OpenAI dans les parametres de l extension.')
  }

  const response = await Promise.race([
    fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: PAGE_SUMMARY_MODEL,
        text: {
          format: {
            type: 'json_schema',
            name: PAGE_SUMMARY_SCHEMA_NAME,
            schema: PAGE_SUMMARY_JSON_SCHEMA,
            strict: true,
          },
        },
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: [
                  'You turn Wikipedia-like articles into a compact, factual mobile card in French.',
                  'Only use the provided content and candidates.',
                  'Do not invent unsupported facts, titles, or links.',
                  'For quickFacts, always return exactly three concise items: main domain, historical period, nationality or country.',
                  'For explorationItems, return exactly three short curiosity-driven items inspired by key events, anecdotes, or turning points.',
                  'For keyPoints, return 3 to 6 major related topics. Use only URLs present in linkCandidates when possible. If no safe URL exists, return an empty string.',
                  'Prefer image URLs from imageCandidates. If only one relevant portrait exists, reuse it for both mainImageUrl and avatarImageUrl.',
                  'Keep shortBio to 2 or 3 concise lines in French.',
                  'The engagement block must sound natural in French and invite the user to continue exploring.',
                ].join(' '),
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify(payload),
              },
            ],
          },
        ],
      }),
    }),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error('La generation prend trop de temps. Reessayez dans un instant.'))
      }, SUMMARY_REQUEST_TIMEOUT_MS)
    }),
  ]) as Response

  const data = await response.json() as OpenAIResponsesApiResponse

  if (response.ok === false) {
    throw new Error(data.error?.message ?? 'OpenAI n a pas pu generer la fiche.')
  }

  const outputText = extractOutputText(data)

  if (outputText.length === 0) {
    throw new Error('OpenAI a retourne une reponse vide.')
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(outputText)
  }
  catch {
    throw new Error('OpenAI a retourne un JSON invalide.')
  }

  const summary = normalizeSummary(parsed, payload)

  if (summary === null) {
    throw new Error('OpenAI a retourne une fiche incomplete.')
  }

  return summary
}

function getPageLeadImage(): string | null {
  for (const selector of LEAD_IMAGE_SELECTORS) {
    const node = document.querySelector(selector)

    if (node instanceof HTMLImageElement) {
      const url = normalizeUrl(node.currentSrc || node.src)

      if (url.length > 0) {
        return url
      }
    }
  }

  const imageCandidates = getImageCandidates()

  if (imageCandidates.length > 0) {
    return imageCandidates[0].url
  }

  const ogImage = document.querySelector('meta[property="og:image"]')

  if (ogImage instanceof HTMLMetaElement) {
    const url = normalizeUrl(ogImage.content)
    return url || null
  }

  return null
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map(part => part[0]?.toUpperCase() ?? '').join('') || 'H'
}

function getQuickFactIcon(label: string, value: string): string {
  const source = `${label} ${value}`.toLowerCase()

  if (source.includes('france') || source.includes('franc')) {
    return '🇫🇷'
  }

  if (source.includes('siecle') || source.includes('siècle') || source.includes('periode') || source.includes('époque')) {
    return '🗓️'
  }

  if (source.includes('milit') || source.includes('guerre') || source.includes('empereur') || source.includes('revolution')) {
    return '⚡'
  }

  if (source.includes('art') || source.includes('peint')) {
    return '🎨'
  }

  if (source.includes('science') || source.includes('phys')) {
    return '🔬'
  }

  return '•'
}

function getExplorationIcon(label: string, detail: string): string {
  const source = `${label} ${detail}`.toLowerCase()

  if (source.includes('code') || source.includes('loi')) {
    return '📜'
  }

  if (source.includes('ans') || source.includes('jeun') || source.includes('enfance')) {
    return '🎓'
  }

  if (source.includes('bataille') || source.includes('waterloo') || source.includes('guerre')) {
    return '⚔️'
  }

  if (source.includes('exil') || source.includes('ile') || source.includes('voyage')) {
    return '🧭'
  }

  return '✨'
}

function handleEngagementAction(summary: PageSummaryData) {
  if (summary.engagement.actionType === 'open_wikipedia') {
    window.open(window.location.href, '_blank', 'noopener,noreferrer')
    return
  }

  if (summary.engagement.actionType === 'explore_links') {
    const section = document.querySelector('.hackipedia-summary-key-points')

    if (section instanceof HTMLElement) {
      section.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }

    return
  }

  const prompt = summary.engagement.actionPrompt.length > 0
    ? summary.engagement.actionPrompt
    : `Je voudrais discuter de ${summary.fullName}.`

  const chatUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`
  window.open(chatUrl, '_blank', 'noopener,noreferrer')
}

function BrandIcon() {
  return (
    <span className="hackipedia-brand-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 4.5v15M4.5 12h15M6.9 6.9l10.2 10.2M17.1 6.9L6.9 17.1" />
      </svg>
    </span>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M7 10l5 5 5-5" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
      <path
        d="M5.25 12.25 10 7.75l4.75 4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M14 5h5v5M10 14l9-9M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

function LoadingCard() {
  return (
    <div className="hackipedia-summary-loading" aria-live="polite">
      <div className="hackipedia-skeleton hackipedia-skeleton-header" />
      <div className="hackipedia-skeleton hackipedia-skeleton-hero" />
      <div className="hackipedia-skeleton hackipedia-skeleton-line" />
      <div className="hackipedia-skeleton hackipedia-skeleton-line short" />
      <div className="hackipedia-skeleton hackipedia-skeleton-pills" />
      <p>Generation du profil en cours...</p>
    </div>
  )
}

function SummaryCard({ summary, onClose }: { summary: PageSummaryData, onClose: () => void }) {
  return (
    <>
      <div className="hackipedia-sheet-hero">
        {summary.mainImageUrl.length > 0 ? (
          <img src={summary.mainImageUrl} alt={summary.fullName} className="hackipedia-sheet-cover" />
        ) : (
          <div className="hackipedia-sheet-cover hackipedia-sheet-cover-fallback">
            <span>{getInitials(summary.fullName)}</span>
          </div>
        )}

        <div className="hackipedia-sheet-hero-scrim" />

        <div className="hackipedia-sheet-brand">
          <BrandIcon />
          <span>Hackipedia</span>
        </div>

        <button
          type="button"
          className="hackipedia-sheet-collapse"
          aria-label="Fermer le resume"
          onClick={onClose}
        >
          <ChevronIcon />
        </button>
      </div>

      <div className="hackipedia-sheet-content">
        <section className="hackipedia-identity-block">
          <div className="hackipedia-avatar-frame">
            {summary.avatarImageUrl.length > 0 ? (
              <img src={summary.avatarImageUrl} alt={summary.fullName} className="hackipedia-avatar" />
            ) : (
              <div className="hackipedia-avatar hackipedia-avatar-fallback">
                <span>{getInitials(summary.fullName)}</span>
              </div>
            )}
          </div>

          <div className="hackipedia-identity-copy">
            <h2 id="hackipedia-summary-title">{summary.fullName}</h2>
            <p>{summary.title}</p>
          </div>
        </section>

        <section className="hackipedia-quick-facts" aria-label="Metadonnees rapides">
          {summary.quickFacts.map(fact => (
            <span key={fact.label + fact.value} className="hackipedia-pill">
              <span className="hackipedia-pill-icon" aria-hidden="true">
                {getQuickFactIcon(fact.label, fact.value)}
              </span>
              <span>{fact.value}</span>
            </span>
          ))}
        </section>

        <p className="hackipedia-short-bio">{summary.shortBio}</p>

        <section className="hackipedia-section">
          <h3>Explorer</h3>
          <div className="hackipedia-chip-grid">
            {summary.explorationItems.map(item => (
              <button key={item.label + item.detail} type="button" className="hackipedia-explore-chip">
                <span className="hackipedia-explore-icon" aria-hidden="true">
                  {getExplorationIcon(item.label, item.detail)}
                </span>
                <span>{item.detail || item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="hackipedia-section hackipedia-summary-key-points">
          <div className="hackipedia-section-heading">
            <h3>Points cles sur Wikipedia</h3>
            <a
              href={window.location.href}
              target="_blank"
              rel="noreferrer"
              className="hackipedia-icon-link"
              aria-label="Ouvrir la page Wikipedia"
            >
              <ExternalIcon />
            </a>
          </div>

          <ul>
            {summary.keyPoints.map(point => (
              <li key={point.label + point.url}>
                {point.url.length > 0 ? (
                  <a href={point.url} target="_blank" rel="noreferrer">{point.label}</a>
                ) : (
                  <span>{point.label}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="hackipedia-engagement-card">
          <p>{summary.engagement.question}</p>
          <button
            type="button"
            className="hackipedia-engagement-button"
            onClick={() => handleEngagementAction(summary)}
          >
            {summary.engagement.ctaLabel}
          </button>
        </section>
      </div>
    </>
  )
}

function App({ pageTitle }: AppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [summary, setSummary] = useState<SummaryState>({
    status: 'idle',
    content: null,
    message: '',
  })

  const summaryHeading = useMemo(() => pageTitle || 'cette page Wikipedia', [pageTitle])
  const leadImageUrl = useMemo(() => getPageLeadImage(), [])
  const avatarLabel = useMemo(() => getInitials(summaryHeading), [summaryHeading])
  const isPrefetching = summary.status === 'idle' || summary.status === 'loading'

  const loadSummary = () => {
    setSummary({ status: 'loading', content: null, message: '' })

    requestPageSummary(summaryHeading)
      .then((content) => {
        setSummary({ status: 'ready', content, message: '' })
      })
      .catch((error) => {
        setSummary({
          status: 'error',
          content: null,
          message: error instanceof Error ? error.message : 'La fiche est indisponible pour le moment.',
        })
      })
  }

  const retrySummary = () => {
    setIsOpen(true)
    loadSummary()
  }

  useEffect(() => {
    if (summary.status !== 'idle') {
      return undefined
    }

    loadSummary()

    return undefined
  }, [summary.status, summaryHeading])

  const openSheet = () => {
    if (summary.status === 'error') {
      setIsOpen(true)
      return
    }

    if (isPrefetching || summary.status !== 'ready') {
      return
    }

    setIsOpen(true)
  }

  return (
    <>
      <section className="hackipedia-summary-entry" aria-label="Resume Hackipedia">
        <button
          type="button"
          className={`hackipedia-summary-button${isPrefetching ? ' is-loading' : ''}`}
          aria-label={`Parle-moi de ${summaryHeading}`}
          aria-busy={isPrefetching}
          disabled={isPrefetching}
          onClick={openSheet}
        >
          <span className="hackipedia-summary-avatar" aria-hidden="true">
            {leadImageUrl ? <img src={leadImageUrl} alt="" /> : <span>{avatarLabel}</span>}
          </span>
          <span className="hackipedia-summary-button-copy">JE TE RACONTE ?</span>
          <span className="hackipedia-summary-button-icon" aria-hidden="true">
            <ChevronUpIcon />
          </span>
        </button>
      </section>

      {isOpen && createPortal(
        <div className="hackipedia-summary-modal-root" role="presentation">
          <button
            type="button"
            className="hackipedia-summary-backdrop"
            aria-label="Fermer le resume"
            onClick={() => setIsOpen(false)}
          />

          <section
            className="hackipedia-summary-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hackipedia-summary-title"
          >
            {summary.status === 'loading' && <LoadingCard />}
            {summary.status === 'ready' && summary.content && (
              <SummaryCard
                summary={summary.content}
                onClose={() => setIsOpen(false)}
              />
            )}
            {summary.status === 'error' && (
              <div className="hackipedia-summary-error" aria-live="polite">
                <h2 id="hackipedia-summary-title">Resume de {summaryHeading}</h2>
                <p>{summary.message}</p>
                <button
                  type="button"
                  className="hackipedia-summary-retry"
                  onClick={retrySummary}
                >
                  Relancer
                </button>
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}

export default App
