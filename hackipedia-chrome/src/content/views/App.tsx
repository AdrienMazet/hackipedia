import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  GENERATE_PAGE_SUMMARY_MESSAGE,
  type GeneratePageSummaryResponse,
} from '@/lib/openai'
import './App.css'

type AppProps = {
  pageTitle: string
}

type SummaryState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  content: string
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

function requestPageSummary(pageTitle: string): Promise<string> {
  const pageContent = getArticleText()

  if (!pageContent) {
    return Promise.reject(new Error('This page does not contain enough text to summarize.'))
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: GENERATE_PAGE_SUMMARY_MESSAGE,
        payload: {
          pageTitle,
          pageUrl: window.location.href,
          pageContent,
        },
      },
      (response?: GeneratePageSummaryResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        if (!response) {
          reject(new Error('The extension did not return a summary.'))
          return
        }

        if (!response.ok) {
          reject(new Error(response.error))
          return
        }

        resolve(response.summary)
      },
    )
  })
}

function App({ pageTitle }: AppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [summary, setSummary] = useState<SummaryState>({
    status: 'idle',
    content: '',
  })

  const summaryHeading = useMemo(() => {
    return pageTitle || 'cette page Wikipédia'
  }, [pageTitle])

  const openModal = async () => {
    setIsOpen(true)

    if (summary.status !== 'idle') {
      return
    }

    setSummary({ status: 'loading', content: '' })

    try {
      const content = await requestPageSummary(summaryHeading)
      setSummary({ status: 'ready', content })
    }
    catch (error) {
      setSummary({
        status: 'error',
        content: error instanceof Error
          ? error.message
          : 'Le résumé est indisponible pour le moment.',
      })
    }
  }

  return (
    <>
      <section className="hackipedia-summary-entry" aria-label="Résumé Hackipedia">
        <button type="button" className="hackipedia-summary-button" onClick={openModal}>
          résumé
        </button>
      </section>

      {isOpen && createPortal(
        <div className="hackipedia-summary-modal-root" role="presentation">
          <button
            type="button"
            className="hackipedia-summary-backdrop"
            aria-label="Fermer le résumé"
            onClick={() => setIsOpen(false)}
          />

          <section
            className="hackipedia-summary-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hackipedia-summary-title"
          >
            <div className="hackipedia-summary-modal-header">
              <div>
                <p className="hackipedia-summary-kicker">Hackipedia</p>
                <h2 id="hackipedia-summary-title">Résumé de {summaryHeading}</h2>
              </div>
              <button
                type="button"
                className="hackipedia-summary-close"
                aria-label="Fermer"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="hackipedia-summary-body">
              {summary.status === 'loading' && (
                <p>Génération du résumé en cours...</p>
              )}

              {summary.status === 'ready' && (
                <p>{summary.content}</p>
              )}

              {summary.status === 'error' && (
                <p>{summary.content}</p>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}

export default App
