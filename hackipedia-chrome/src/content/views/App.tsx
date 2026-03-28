import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  GENERATE_PAGE_SUMMARY_MESSAGE,
  type GeneratePageSummaryRequest,
  type GeneratePageSummaryResponse,
  type PageSummaryData,
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

function getArticleText(): string {
  const paragraphs = Array.from(
    document.querySelectorAll('#mw-content-text .mw-parser-output > p, #mw-content-text > p'),
  )
    .map(node => node.textContent?.trim() ?? '')
    .filter(Boolean)

  const articleText = paragraphs.join('\n\n').replace(/\s+/g, ' ').trim()

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
    document.querySelectorAll('.infobox img, .mw-file-element, .thumbimage'),
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
  const candidates = Array.from(document.querySelectorAll('#bodyContent a'))
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

function requestPageSummary(pageTitle: string): Promise<PageSummaryData> {
  const pageContent = getArticleText()

  if (pageContent.length === 0) {
    return Promise.reject(new Error('Cette page ne contient pas assez de texte a resumer.'))
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: GENERATE_PAGE_SUMMARY_MESSAGE,
        payload: {
          pageTitle,
          pageUrl: window.location.href,
          pageContent,
          imageCandidates: getImageCandidates(),
          linkCandidates: getLinkCandidates(),
        },
      },
      (response?: GeneratePageSummaryResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        if (response === undefined) {
          reject(new Error('L extension n a retourne aucune reponse.'))
          return
        }

        if (response.ok === false) {
          reject(new Error(response.error))
          return
        }

        resolve(response.summary)
      },
    )
  })
}

function getPageLeadImage(): string | null {
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

function SummaryCard({ summary }: { summary: PageSummaryData }) {
  return (
    <>
      <header className="hackipedia-sheet-topbar">
        <div className="hackipedia-sheet-brand">
          <BrandIcon />
          <span>Curiosity</span>
        </div>

        <span className="hackipedia-sheet-collapse" aria-hidden="true">
          <ChevronIcon />
        </span>
      </header>

      <div className="hackipedia-sheet-hero">
        {summary.mainImageUrl.length > 0 ? (
          <img src={summary.mainImageUrl} alt={summary.fullName} className="hackipedia-sheet-cover" />
        ) : (
          <div className="hackipedia-sheet-cover hackipedia-sheet-cover-fallback">
            <span>{getInitials(summary.fullName)}</span>
          </div>
        )}
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
              <strong>{fact.label}</strong>
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
                <small>{item.label}</small>
                <span>{item.detail}</span>
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

  const openSheet = async () => {
    setIsOpen(true)

    if (summary.status === 'loading' || summary.status === 'ready') {
      return
    }

    setSummary({ status: 'loading', content: null, message: '' })

    try {
      const content = await requestPageSummary(summaryHeading)
      setSummary({ status: 'ready', content, message: '' })
    }
    catch (error) {
      setSummary({
        status: 'error',
        content: null,
        message: error instanceof Error ? error.message : 'La fiche est indisponible pour le moment.',
      })
    }
  }

  return (
    <>
      <section className="hackipedia-summary-entry" aria-label="Resume Hackipedia">
        <button
          type="button"
          className="hackipedia-summary-button"
          aria-label={`Parle-moi de ${summaryHeading}`}
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
            {summary.status === 'ready' && summary.content && <SummaryCard summary={summary.content} />}
            {summary.status === 'error' && (
              <div className="hackipedia-summary-error" aria-live="polite">
                <h2 id="hackipedia-summary-title">Resume de {summaryHeading}</h2>
                <p>{summary.message}</p>
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
