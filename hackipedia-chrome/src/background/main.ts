import {
  GENERATE_PAGE_SUMMARY_MESSAGE,
  type GeneratePageSummaryRequest,
  type GeneratePageSummaryResponse,
} from "@/lib/openai"

console.info(
  "[Hackipedia][background] Service worker ready. Wikipedia summary generation now runs in the content React app.",
)

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (
    typeof message === "object"
    && message !== null
    && "type" in message
    && message.type === GENERATE_PAGE_SUMMARY_MESSAGE
  ) {
    console.warn(
      "[Hackipedia][background] Legacy summary message received. The active Gemini flow is in App.tsx/useEffect, not in the background worker.",
      message as GeneratePageSummaryRequest,
    )

    sendResponse({
      ok: false,
      error: "Legacy background summary route is disabled. The active Gemini request runs directly in App.tsx.",
    } satisfies GeneratePageSummaryResponse)

    return true
  }

  return undefined
})
