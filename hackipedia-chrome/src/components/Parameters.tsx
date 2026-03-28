import { useEffect, useState } from 'react'
import {
  ELEVENLABS_API_KEY_STORAGE_KEY,
  MISTRAL_API_KEY_STORAGE_KEY,
} from '@/lib/openai'

export default function Parameters() {
  const [mistralApiKey, setMistralApiKey] = useState('')
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let isMounted = true

    chrome.storage.local.get([MISTRAL_API_KEY_STORAGE_KEY, ELEVENLABS_API_KEY_STORAGE_KEY], (result) => {
      if (!isMounted) {
        return
      }

      if (chrome.runtime.lastError) {
        setStatus('Unable to load the API key.')
        setIsLoading(false)
        return
      }

      setMistralApiKey(typeof result[MISTRAL_API_KEY_STORAGE_KEY] === 'string' ? result[MISTRAL_API_KEY_STORAGE_KEY] : '')
      setElevenlabsApiKey(typeof result[ELEVENLABS_API_KEY_STORAGE_KEY] === 'string' ? result[ELEVENLABS_API_KEY_STORAGE_KEY] : '')
      setIsLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const saveApiKeys = () => {
    setIsSaving(true)
    setStatus('')

    chrome.storage.local.set({
      [MISTRAL_API_KEY_STORAGE_KEY]: mistralApiKey.trim(),
      [ELEVENLABS_API_KEY_STORAGE_KEY]: elevenlabsApiKey.trim(),
    }, () => {
      if (chrome.runtime.lastError) {
        setStatus('Unable to save the API keys.')
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
        <p className="parameters-copy">Configure the Mistral and ElevenLabs API keys used by the extension.</p>
      </div>

      <label className="parameters-field" htmlFor="mistral-api-key">
        <span>Mistral API key</span>
        <input
          id="mistral-api-key"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="..."
          value={mistralApiKey}
          onChange={event => setMistralApiKey(event.target.value)}
          disabled={isLoading || isSaving}
        />
      </label>

      <label className="parameters-field" htmlFor="elevenlabs-api-key">
        <span>ElevenLabs API key</span>
        <input
          id="elevenlabs-api-key"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="sk_..."
          value={elevenlabsApiKey}
          onChange={event => setElevenlabsApiKey(event.target.value)}
          disabled={isLoading || isSaving}
        />
      </label>

      <div className="parameters-actions">
        <button
          type="button"
          className="parameters-save"
          onClick={saveApiKeys}
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
