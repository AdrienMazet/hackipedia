export const OPENAI_API_KEY_STORAGE_KEY = 'openaiApiKey'

export const GENERATE_PAGE_SUMMARY_MESSAGE = 'hackipedia:generate-page-summary'

export const PAGE_SUMMARY_MODEL = 'gpt-5.4-nano'

export type GeneratePageSummaryRequest = {
  type: typeof GENERATE_PAGE_SUMMARY_MESSAGE
  payload: {
    pageTitle: string
    pageUrl: string
    pageContent: string
  }
}

export type GeneratePageSummarySuccess = {
  ok: true
  summary: string
}

export type GeneratePageSummaryFailure = {
  ok: false
  error: string
}

export type GeneratePageSummaryResponse =
  | GeneratePageSummarySuccess
  | GeneratePageSummaryFailure
