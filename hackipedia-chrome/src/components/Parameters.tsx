import { useEffect, useState } from 'react'
import { OPENAI_API_KEY_STORAGE_KEY } from '@/lib/openai'

export default function Parameters() {
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let isMounted = true

    chrome.storage.local.get([OPENAI_API_KEY_STORAGE_KEY], (result) => {
      if (!isMounted) {
        return
      }

      if (chrome.runtime.lastError) {
        setStatus('Unable to load the API key.')
        setIsLoading(false)
        return
      }

      setApiKey(typeof result[OPENAI_API_KEY_STORAGE_KEY] === 'string' ? result[OPENAI_API_KEY_STORAGE_KEY] : '')
      setIsLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const saveApiKey = () => {
    setIsSaving(true)
    setStatus('')

    chrome.storage.local.set({ [OPENAI_API_KEY_STORAGE_KEY]: apiKey.trim() }, () => {
      if (chrome.runtime.lastError) {
        setStatus('Unable to save the API key.')
        setIsSaving(false)
        return
      }

      setStatus('Saved')
      setIsSaving(false)
    })
  }

  return (
    <section className="parameters-card" aria-labelledby="parameters-title">
      <div className="parameters-header">
        <p className="parameters-kicker">Hackipedia</p>
        <h1 id="parameters-title">Parameters</h1>
        <p className="parameters-copy">Configure the OpenAI API key used by the extension.</p>
      </div>

      <label className="parameters-field" htmlFor="openai-api-key">
        <span>OpenAI API key</span>
        <input
          id="openai-api-key"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="sk-..."
          value={apiKey}
          onChange={event => setApiKey(event.target.value)}
          disabled={isLoading || isSaving}
        />
      </label>

      <div className="parameters-actions">
        <button
          type="button"
          className="parameters-save"
          onClick={saveApiKey}
          disabled={isLoading || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>

        <span className="parameters-status" aria-live="polite">
          {isLoading ? 'Loading...' : status}
        </span>
      </div>
    </section>
  )
}
