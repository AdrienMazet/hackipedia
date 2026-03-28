import {
  GENERATE_PAGE_SUMMARY_MESSAGE,
  OPENAI_API_KEY_STORAGE_KEY,
  PAGE_SUMMARY_MODEL,
  type GeneratePageSummaryRequest,
  type GeneratePageSummaryResponse,
} from '@/lib/openai'

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

function getStoredApiKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([OPENAI_API_KEY_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error('Unable to read the OpenAI API key.'))
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

async function generatePageSummary(
  payload: GeneratePageSummaryRequest['payload'],
): Promise<GeneratePageSummaryResponse> {
  const apiKey = await getStoredApiKey()

  if (!apiKey) {
    return {
      ok: false,
      error: 'Configure an OpenAI API key in the extension parameters first.',
    }
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: PAGE_SUMMARY_MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You summarize encyclopedia pages. Produce a concise, factual summary in French, based only on the provided page content. If the content is insufficient, say so briefly. Do not mention the model or API.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Title: ${payload.pageTitle}\nURL: ${payload.pageUrl}\n\nPage content:\n${payload.pageContent}`,
            },
          ],
        },
      ],
    }),
  })

  const data = await response.json() as OpenAIResponsesApiResponse

  if (!response.ok) {
    return {
      ok: false,
      error: data.error?.message ?? 'OpenAI could not generate a summary for this page.',
    }
  }

  const summary = extractOutputText(data)

  if (!summary) {
    return {
      ok: false,
      error: 'OpenAI returned an empty summary.',
    }
  }

  return {
    ok: true,
    summary,
  }
}

chrome.runtime.onMessage.addListener((message: GeneratePageSummaryRequest, _sender, sendResponse) => {
  if (message.type !== GENERATE_PAGE_SUMMARY_MESSAGE) {
    return undefined
  }

  void generatePageSummary(message.payload)
    .then(sendResponse)
    .catch((error: unknown) => {
      const messageText = error instanceof Error
        ? error.message
        : 'OpenAI could not generate a summary for this page.'

      sendResponse({ ok: false, error: messageText } satisfies GeneratePageSummaryResponse)
    })

  return true
})
