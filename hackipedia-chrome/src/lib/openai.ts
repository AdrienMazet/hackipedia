export const OPENAI_API_KEY_STORAGE_KEY = "openaiApiKey"
export const ELEVENLABS_API_KEY_STORAGE_KEY = "elevenlabsApiKey"
export const MISTRAL_API_KEY_STORAGE_KEY = OPENAI_API_KEY_STORAGE_KEY

export const GENERATE_PAGE_SUMMARY_MESSAGE = "hackipedia:generate-page-summary"

export const PAGE_SUMMARY_MODEL = "gpt-5.4-nano"
export const PAGE_SUMMARY_SCHEMA_NAME = "hackipedia_wikipedia_recap"

export type PageSummaryLink = {
  label: string
  url: string
  detail: string
}

export type PageSummaryQuizQuestion = {
  question: string
  options: [string, string, string]
  correctIndex: number
}

export type PageSummaryData = {
  fullName: string
  title: string
  mainImageUrl: string
  avatarImageUrl: string
  synthesis: string
  keyTakeaways: [string, string, string]
  relatedLinks: [PageSummaryLink, PageSummaryLink, PageSummaryLink]
  quizQuestions: [PageSummaryQuizQuestion, PageSummaryQuizQuestion, PageSummaryQuizQuestion]
  gender: "male" | "female"
}

export const PAGE_SUMMARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "fullName",
    "title",
    "mainImageUrl",
    "avatarImageUrl",
    "synthesis",
    "keyTakeaways",
    "relatedLinks",
    "quizQuestions",
    "gender",
  ],
  properties: {
    fullName: { type: "string" },
    title: { type: "string" },
    mainImageUrl: { type: "string" },
    avatarImageUrl: { type: "string" },
    synthesis: { type: "string" },
    keyTakeaways: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
    },
    relatedLinks: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "url", "detail"],
        properties: {
          label: { type: "string" },
          url: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    quizQuestions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "correctIndex"],
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { type: "string" },
          },
          correctIndex: {
            type: "integer",
            minimum: 0,
            maximum: 2,
          },
        },
      },
    },
    gender: {
      type: "string",
      enum: ["male", "female"],
    },
  },
} as const

export type GeneratePageSummaryRequest = {
  type: typeof GENERATE_PAGE_SUMMARY_MESSAGE
  payload: {
    pageTitle: string
    pageUrl: string
    pageContent: string
    imageCandidates: Array<{
      alt: string
      url: string
    }>
    linkCandidates: Array<{
      label: string
      url: string
    }>
  }
}

export type GeneratePageSummarySuccess = {
  ok: true
  summary: PageSummaryData
}

export type GeneratePageSummaryFailure = {
  ok: false
  error: string
}

export type GeneratePageSummaryResponse =
  | GeneratePageSummarySuccess
  | GeneratePageSummaryFailure
