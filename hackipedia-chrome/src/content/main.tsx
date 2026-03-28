import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './views/App.tsx'

const isWikipediaArticlePage = () => {
  return window.location.hostname.endsWith('.wikipedia.org')
    && window.location.pathname.startsWith('/wiki/')
}

const mountTarget = document.querySelector('#content, main') ?? document.body

if (isWikipediaArticlePage() && mountTarget && !document.getElementById('hackipedia-wikipedia-summary')) {
  console.info('[Hackipedia] Mounting content app.', {
    title: document.title,
    url: window.location.href,
  })

  const container = document.createElement('div')
  container.id = 'hackipedia-wikipedia-summary'
  mountTarget.prepend(container)

  createRoot(container).render(
    <StrictMode>
      <App pageTitle={document.title.replace(/\s*[—–-]\s*Wikip(?:e|é)dia.*$/i, '').trim()} />
    </StrictMode>,
  )
} else {
  console.info('[Hackipedia] Content app not mounted.', {
    isWikipediaArticlePage: isWikipediaArticlePage(),
    hasMountTarget: Boolean(mountTarget),
    alreadyMounted: Boolean(document.getElementById('hackipedia-wikipedia-summary')),
    url: window.location.href,
  })
}
