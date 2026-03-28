import {
  GENERATE_PAGE_SUMMARY_MESSAGE,
  OPENAI_API_KEY_STORAGE_KEY,
  PAGE_SUMMARY_JSON_SCHEMA,
  PAGE_SUMMARY_MODEL,
  PAGE_SUMMARY_SCHEMA_NAME,
  type GeneratePageSummaryRequest,
  type GeneratePageSummaryResponse,
  type PageSummaryData,
  type SummaryActionType,
} from "@/lib/openai"

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
        reject(new Error("Unable to read the OpenAI API key."))
        return
      }

      const apiKey = typeof result[OPENAI_API_KEY_STORAGE_KEY] === "string"
        ? result[OPENAI_API_KEY_STORAGE_KEY].trim()
        : ""

      resolve(apiKey)
    })
  })
}

function extractOutputText(response: OpenAIResponsesApiResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const content = response.output
    ?.flatMap(item => item.content ?? [])
    .filter(item => item.type === "output_text" && typeof item.text === "string")
    .map(item => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")

  return content?.trim() ?? ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value === Object(value)
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback
}

function normalizeActionType(value: unknown): SummaryActionType {
  if (value === "open_chat" || value === "open_wikipedia" || value === "explore_links") {
    return value
  }

  return "open_chat"
}

function normalizeSummary(
  raw: unknown,
  payload: GeneratePageSummaryRequest["payload"],
): PageSummaryData | null {
  if (isRecord(raw) === false) {
    return null
  }

  const quickFactsRaw = Array.isArray(raw.quickFacts) ? raw.quickFacts : []
  const quickFacts = quickFactsRaw
    .slice(0, 3)
    .map((item, index) => {
      const defaultLabels = ["Domaine", "Periode", "Pays"]

      if (isRecord(item) === false) {
        return { label: defaultLabels[index] ?? "Info", value: "" }
      }

      return {
        label: getString(item.label, defaultLabels[index] ?? "Info"),
        value: getString(item.value),
      }
    })
    .filter(item => item.value)

  while (quickFacts.length < 3) {
    quickFacts.push({
      label: ["Domaine", "Periode", "Pays"][quickFacts.length] ?? "Info",
      value: "",
    })
  }

  const explorationRaw = Array.isArray(raw.explorationItems) ? raw.explorationItems : []
  const explorationItems = explorationRaw
    .slice(0, 3)
    .map((item, index) => {
      if (isRecord(item) === false) {
        return {
          label: ["Moment cle", "Anecdote", "A approfondir"][index] ?? "Explorer",
          detail: "",
        }
      }

      return {
        label: getString(item.label, ["Moment cle", "Anecdote", "A approfondir"][index] ?? "Explorer"),
        detail: getString(item.detail),
      }
    })
    .filter(item => item.detail)

  while (explorationItems.length < 3) {
    explorationItems.push({
      label: ["Moment cle", "Anecdote", "A approfondir"][explorationItems.length] ?? "Explorer",
      detail: "",
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

      if (url.startsWith("http://") || url.startsWith("https://")) {
        return { label, url }
      }

      const fallbackCandidate = payload.linkCandidates.find(candidate => candidate.label === label)

      return {
        label,
        url: fallbackCandidate?.url ?? "",
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter(item => item.url.length === 0 || linkCandidateMap.has(item.url))
    .slice(0, 6)

  const engagementRaw = isRecord(raw.engagement) ? raw.engagement : {}
  const fallbackImage = payload.imageCandidates[0]?.url ?? ""
  const fallbackPrompt = "Je voudrais discuter de " + getString(raw.fullName, payload.pageTitle) + "."

  return {
    fullName: getString(raw.fullName, payload.pageTitle),
    title: getString(raw.title, "Personnage historique"),
    mainImageUrl: getString(raw.mainImageUrl, fallbackImage),
    avatarImageUrl: getString(raw.avatarImageUrl, getString(raw.mainImageUrl, fallbackImage)),
    quickFacts: [quickFacts[0], quickFacts[1], quickFacts[2]],
    shortBio: getString(raw.shortBio, "Resume indisponible pour le moment."),
    explorationItems: [explorationItems[0], explorationItems[1], explorationItems[2]],
    keyPoints,
    engagement: {
      question: getString(engagementRaw.question, "Tu aimerais lui poser une question ?"),
      ctaLabel: getString(engagementRaw.ctaLabel, "Ouvrir le chat"),
      actionType: normalizeActionType(engagementRaw.actionType),
      actionPrompt: getString(engagementRaw.actionPrompt, fallbackPrompt),
    },
  }
}

async function generatePageSummary(
  payload: GeneratePageSummaryRequest["payload"],
): Promise<GeneratePageSummaryResponse> {
  const apiKey = await getStoredApiKey()

  if (apiKey.length === 0) {
    return {
      ok: false,
      error: "Configure an OpenAI API key in the extension parameters first.",
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: PAGE_SUMMARY_MODEL,
      text: {
        format: {
          type: "json_schema",
          name: PAGE_SUMMARY_SCHEMA_NAME,
          schema: PAGE_SUMMARY_JSON_SCHEMA,
          strict: true,
        },
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You turn Wikipedia-like articles into a compact, factual mobile card in French.",
                "Only use the provided content and candidates.",
                "Do not invent unsupported facts, titles, or links.",
                "For quickFacts, always return exactly three concise items: main domain, historical period, nationality or country.",
                "For explorationItems, return exactly three short curiosity-driven items inspired by key events, anecdotes, or turning points.",
                "For keyPoints, return 3 to 6 major related topics. Use only URLs present in linkCandidates when possible. If no safe URL exists, return an empty string.",
                "Prefer image URLs from imageCandidates. If only one relevant portrait exists, reuse it for both mainImageUrl and avatarImageUrl.",
                "Keep shortBio to 2 or 3 concise lines in French.",
                "The engagement block must sound natural in French and invite the user to continue exploring.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                pageTitle: payload.pageTitle,
                pageUrl: payload.pageUrl,
                pageContent: payload.pageContent,
                imageCandidates: payload.imageCandidates,
                linkCandidates: payload.linkCandidates,
              }),
            },
          ],
        },
      ],
    }),
  })

  const data = await response.json() as OpenAIResponsesApiResponse

  if (response.ok === false) {
    return {
      ok: false,
      error: data.error?.message ?? "OpenAI could not generate a summary for this page.",
    }
  }

  const outputText = extractOutputText(data)

  if (outputText.length === 0) {
    return {
      ok: false,
      error: "OpenAI returned an empty summary.",
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(outputText)
  }
  catch {
    return {
      ok: false,
      error: "OpenAI returned an invalid JSON payload.",
    }
  }

  const summary = normalizeSummary(parsed, payload)

  if (summary === null) {
    return {
      ok: false,
      error: "OpenAI returned an incomplete profile.",
    }
  }

  return {
    ok: true,
    summary,
  }
}

chrome.runtime.onMessage.addListener((message: GeneratePageSummaryRequest, _sender, sendResponse) => {
  if (message.type === GENERATE_PAGE_SUMMARY_MESSAGE) {
    void generatePageSummary(message.payload)
      .then(sendResponse)
      .catch((error: unknown) => {
        const messageText = error instanceof Error
          ? error.message
          : "OpenAI could not generate a summary for this page."

        sendResponse({ ok: false, error: messageText } satisfies GeneratePageSummaryResponse)
      })

    return true
  }

  return undefined
})
