export const OPENAI_API_KEY_STORAGE_KEY = 'openaiApiKey'

export const GENERATE_PAGE_SUMMARY_MESSAGE = 'hackipedia:generate-page-summary'

export const PAGE_SUMMARY_MODEL = 'gpt-5.4-nano'
export const PAGE_SUMMARY_SCHEMA_NAME = 'hackipedia_wikipedia_profile'

export type SummaryActionType = 'open_chat' | 'open_wikipedia' | 'explore_links'

export type PageSummaryTag = {
  label: string
  value: string
}

export type PageSummaryExploreItem = {
  label: string
  detail: string
}

export type PageSummaryKeyPoint = {
  label: string
  url: string
}

export type PageSummaryEngagement = {
  question: string
  ctaLabel: string
  actionType: SummaryActionType
  actionPrompt: string
}

export type PageSummaryData = {
  fullName: string
  title: string
  mainImageUrl: string
  avatarImageUrl: string
  quickFacts: [PageSummaryTag, PageSummaryTag, PageSummaryTag]
  shortBio: string
  explorationItems: [PageSummaryExploreItem, PageSummaryExploreItem, PageSummaryExploreItem]
  keyPoints: PageSummaryKeyPoint[]
  engagement: PageSummaryEngagement
}

export const PAGE_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'fullName',
    'title',
    'mainImageUrl',
    'avatarImageUrl',
    'quickFacts',
    'shortBio',
    'explorationItems',
    'keyPoints',
    'engagement',
  ],
  properties: {
    fullName: { type: 'string' },
    title: { type: 'string' },
    mainImageUrl: { type: 'string' },
    avatarImageUrl: { type: 'string' },
    quickFacts: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'value'],
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
      },
    },
    shortBio: { type: 'string' },
    explorationItems: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'detail'],
        properties: {
          label: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    keyPoints: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'url'],
        properties: {
          label: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
    engagement: {
      type: 'object',
      additionalProperties: false,
      required: ['question', 'ctaLabel', 'actionType', 'actionPrompt'],
      properties: {
        question: { type: 'string' },
        ctaLabel: { type: 'string' },
        actionType: {
          type: 'string',
          enum: ['open_chat', 'open_wikipedia', 'explore_links'],
        },
        actionPrompt: { type: 'string' },
      },
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
