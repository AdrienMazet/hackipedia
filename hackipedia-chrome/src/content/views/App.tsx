import { useMemo, useState } from 'react'
import './App.css'

type AppProps = {
  pageTitle: string
}

type SummaryState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  content: string
}

async function fetchPageSummary(): Promise<string> {
  // TODO: Replace this scaffold with a real backend request.
  return Promise.resolve(
    'Résumé généré par le backend à venir. Cette fenêtre modale est un scaffold pour l’intégration future.',
  )
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
      const content = await fetchPageSummary()
      setSummary({ status: 'ready', content })
    }
    catch {
      setSummary({
        status: 'error',
        content: 'Le résumé est indisponible pour le moment.',
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

      {isOpen && (
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
        </div>
      )}
    </>
  )
}

export default App
