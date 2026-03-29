import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { BookOpen, Download, Phone, PhoneOff } from "lucide-react";
import mapIcon from "@/assets/map.svg";
import {
  ELEVENLABS_API_KEY_STORAGE_KEY,
  MISTRAL_API_KEY_STORAGE_KEY,
  PAGE_SUMMARY_JSON_SCHEMA,
  type PageSummaryData,
} from "@/lib/openai";
import { ElevenLabsWaveform } from "./ElevenLabsWaveform";
import "./App.css";

type AppProps = {
  pageTitle: string;
};

type SheetView = "call" | "recap" | "quiz" | "travel";
type SummaryStatus = "idle" | "loading" | "ready" | "error";
const ELEVENLABS_AGENT_ID = "agent_0001kmtn91fefa4bht50meknjmq4";

const LEAD_IMAGE_SELECTORS = [
  ".pcs-lead-image img",
  ".infobox .mw-file-element",
  ".infobox img",
  ".mw-parser-output > figure img",
  ".thumb img",
];

type OpenAIResponsesApiResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            text?: string;
            type?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function normalizeUrl(value: string | null | undefined): string {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (trimmedValue.length === 0) {
      return "";
    }

    try {
      return new URL(trimmedValue, window.location.origin).href;
    } catch {
      return "";
    }
  }

  return "";
}

function getPageLeadImage(): string | null {
  for (const selector of LEAD_IMAGE_SELECTORS) {
    const node = document.querySelector(selector);

    if (node instanceof HTMLImageElement) {
      const url = normalizeUrl(node.currentSrc || node.src);

      if (url.length > 0) {
        return url;
      }
    }
  }

  const ogImage = document.querySelector('meta[property="og:image"]');

  if (ogImage instanceof HTMLMetaElement) {
    const url = normalizeUrl(ogImage.content);
    return url || null;
  }

  return null;
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "H";
}

function cleanPageTitle(pageTitle: string): string {
  return pageTitle
    .replace(/\s*[—–-]\s*Wikip(?:e|é)dia.*$/i, "")
    .replace(/\s*\|\s*Wikip(?:e|é)dia.*$/i, "")
    .trim();
}

function collectPagePayload(pageTitle: string) {
  const articleRoot =
    document.querySelector("#mw-content-text .mw-parser-output") ??
    document.querySelector("#bodyContent") ??
    document.body;

  const pageContent = (articleRoot.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16000);

  const imageCandidates = Array.from(articleRoot.querySelectorAll("img"))
    .filter(
      (node): node is HTMLImageElement => node instanceof HTMLImageElement,
    )
    .map((image) => ({
      alt: (image.alt || "").trim(),
      url: normalizeUrl(image.currentSrc || image.src),
    }))
    .filter((item) => item.url.length > 0)
    .slice(0, 12);

  const seenLinks = new Set<string>();
  const linkCandidates = Array.from(articleRoot.querySelectorAll("a[href]"))
    .filter(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement,
    )
    .map((anchor) => {
      const label = (anchor.textContent || "").replace(/\s+/g, " ").trim();
      const url = normalizeUrl(anchor.href);

      return { label, url };
    })
    .filter((item) => item.label.length > 1 && item.url.includes("/wiki/"))
    .filter((item) => {
      const wikiPath = item.url.split("/wiki/")[1] ?? "";
      return wikiPath.length > 0 && wikiPath.includes(":") === false;
    })
    .filter((item) => item.url !== window.location.href)
    .filter((item) => {
      if (seenLinks.has(item.url)) {
        return false;
      }

      seenLinks.add(item.url);
      return true;
    })
    .slice(0, 80);

  return {
    pageTitle,
    pageUrl: window.location.href,
    pageContent,
    imageCandidates,
    linkCandidates,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value === Object(value);
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeSummaryData(
  raw: unknown,
  payload: ReturnType<typeof collectPagePayload>,
): PageSummaryData | null {
  if (isRecord(raw) === false) {
    return null;
  }

  const candidateMap = new Map(
    payload.linkCandidates.map((item) => [item.url, item]),
  );
  const keyTakeawaysRaw = Array.isArray(raw.keyTakeaways)
    ? raw.keyTakeaways
    : [];
  const keyTakeaways = keyTakeawaysRaw
    .slice(0, 3)
    .map((item) => getString(item))
    .filter(Boolean);

  while (keyTakeaways.length < 3) {
    keyTakeaways.push("Information à retenir");
  }

  const relatedLinksRaw = Array.isArray(raw.relatedLinks)
    ? raw.relatedLinks
    : [];
  const relatedLinks = relatedLinksRaw
    .map((item) => {
      if (isRecord(item) === false) {
        return null;
      }

      const url = getString(item.url);
      const matchedCandidate = candidateMap.get(url);

      if (!matchedCandidate) {
        return null;
      }

      return {
        label: getString(item.label, matchedCandidate.label),
        url: matchedCandidate.url,
        detail: getString(item.detail, "Personnage cité dans la page."),
      };
    })
    .filter((item): item is PageSummaryData["relatedLinks"][number] =>
      Boolean(item),
    )
    .slice(0, 3);

  while (
    relatedLinks.length < 3 &&
    payload.linkCandidates[relatedLinks.length]
  ) {
    const fallbackCandidate = payload.linkCandidates[relatedLinks.length];
    relatedLinks.push({
      label: fallbackCandidate.label,
      url: fallbackCandidate.url,
      detail: "Personnage cité dans la page.",
    });
  }

  const quizQuestionsRaw = Array.isArray(raw.quizQuestions)
    ? raw.quizQuestions
    : [];
  const quizQuestions = quizQuestionsRaw
    .map((item) => {
      if (isRecord(item) === false) {
        return null;
      }

      const optionsRaw = Array.isArray(item.options) ? item.options : [];
      const options = optionsRaw
        .slice(0, 3)
        .map((option) => getString(option))
        .filter(Boolean);

      if (options.length !== 3) {
        return null;
      }

      const correctIndex =
        typeof item.correctIndex === "number"
          ? Math.max(0, Math.min(2, Math.floor(item.correctIndex)))
          : 0;

      return {
        question: getString(item.question),
        options: [options[0], options[1], options[2]] as [
          string,
          string,
          string,
        ],
        correctIndex,
      };
    })
    .filter((item): item is PageSummaryData["quizQuestions"][number] =>
      Boolean(item),
    )
    .slice(0, 3);

  while (quizQuestions.length < 3) {
    quizQuestions.push({
      question: "Quel élément est central dans cette page ?",
      options: ["Une exploration", "Un traité", "Une élection"],
      correctIndex: 0,
    });
  }

  return {
    fullName: getString(raw.fullName, payload.pageTitle),
    title: getString(raw.title, "Personnage historique"),
    mainImageUrl: getString(
      raw.mainImageUrl,
      payload.imageCandidates[0]?.url ?? "",
    ),
    avatarImageUrl: getString(
      raw.avatarImageUrl,
      getString(raw.mainImageUrl, payload.imageCandidates[0]?.url ?? ""),
    ),
    synthesis: getString(raw.synthesis, "Synthèse indisponible."),
    keyTakeaways: [keyTakeaways[0], keyTakeaways[1], keyTakeaways[2]],
    relatedLinks: [relatedLinks[0], relatedLinks[1], relatedLinks[2]],
    quizQuestions: [quizQuestions[0], quizQuestions[1], quizQuestions[2]],
    gender: (raw.gender === "female" ? "female" : "male") as "male" | "female",
  };
}

function getStoredApiKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([MISTRAL_API_KEY_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Impossible de lire la clé API Mistral."));
        return;
      }

      const apiKey =
        typeof result[MISTRAL_API_KEY_STORAGE_KEY] === "string"
          ? result[MISTRAL_API_KEY_STORAGE_KEY].trim()
          : "";

      resolve(apiKey);
    });
  });
}

function getStoredElevenLabsApiKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([ELEVENLABS_API_KEY_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Impossible de lire la clé API ElevenLabs."));
        return;
      }

      const apiKey =
        typeof result[ELEVENLABS_API_KEY_STORAGE_KEY] === "string"
          ? result[ELEVENLABS_API_KEY_STORAGE_KEY].trim()
          : "";

      resolve(apiKey);
    });
  });
}

function extractOutputText(response: OpenAIResponsesApiResponse): string {
  const firstMessage = response.choices?.[0]?.message?.content;

  if (typeof firstMessage === "string") {
    return firstMessage.trim();
  }

  if (Array.isArray(firstMessage)) {
    return firstMessage
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  return "";
}

function getRelatedLinkEmoji(label: string, detail: string): string {
  const source = `${label} ${detail}`.toLowerCase();

  if (
    source.includes("roi") ||
    source.includes("reine") ||
    source.includes("empereur")
  ) {
    return "👑";
  }

  if (
    source.includes("explor") ||
    source.includes("voyage") ||
    source.includes("navig")
  ) {
    return "🧭";
  }

  if (source.includes("christophe colomb") || source.includes("colomb")) {
    return "⛵";
  }

  if (source.includes("marco polo") || source.includes("magellan")) {
    return "🌍";
  }

  if (
    source.includes("napoléon") ||
    source.includes("césar") ||
    source.includes("alexandre")
  ) {
    return "⚔️";
  }

  if (
    source.includes("léonard") ||
    source.includes("michel-ange") ||
    source.includes("raphaël")
  ) {
    return "🎨";
  }

  if (
    source.includes("galilée") ||
    source.includes("newton") ||
    source.includes("einstein")
  ) {
    return "🔭";
  }

  if (
    source.includes("philos") ||
    source.includes("platon") ||
    source.includes("aristote")
  ) {
    return "📚";
  }

  if (
    source.includes("saint") ||
    source.includes("pape") ||
    source.includes("relig")
  ) {
    return "⛪";
  }

  if (
    source.includes("guerre") ||
    source.includes("bataille") ||
    source.includes("général")
  ) {
    return "🛡️";
  }

  return "✨";
}

function CallSheet({
  pageTitle,
  leadImageUrl,
  isSpeaking,
  isCallConnecting,
  isCallAvailable,
  callError,
  onToggleSpeaking,
}: {
  pageTitle: string;
  leadImageUrl: string | null;
  isSpeaking: boolean;
  isCallConnecting: boolean;
  isCallAvailable: boolean;
  callError: string;
  onToggleSpeaking: () => void;
}) {
  return (
    <div className="hackipedia-sheet-content hackipedia-sheet-content-compact">
      <section className="hackipedia-choice-header">
        <div className="hackipedia-choice-avatar">
          {leadImageUrl ? (
            <img
              src={leadImageUrl}
              alt={pageTitle}
              className="hackipedia-choice-avatar-image"
            />
          ) : (
            <div className="hackipedia-choice-avatar-image hackipedia-sheet-cover-fallback">
              <span>{getInitials(pageTitle)}</span>
            </div>
          )}
        </div>
        <h2 id="hackipedia-summary-title">{pageTitle}</h2>
      </section>

      <section
        className="hackipedia-choice-grid"
        aria-label="Choix d'expérience"
      >
        <button
          type="button"
          className={`hackipedia-choice-card hackipedia-choice-card-explore${isSpeaking ? " is-active" : ""}`}
          onClick={onToggleSpeaking}
          disabled={isCallAvailable === false}
        >
          <span className="hackipedia-choice-card-inline">
            {isSpeaking || isCallConnecting ? <PhoneOff /> : <Phone />}
            <strong>
              {isCallConnecting
                ? "Connexion..."
                : isSpeaking
                  ? "Raccrocher"
                  : "Appeler"}
            </strong>
          </span>
        </button>
        {isCallAvailable === false ? (
          <p className="hackipedia-call-error" role="alert">
            Micro indisponible sur cette page.
          </p>
        ) : null}
        {callError ? (
          <p className="hackipedia-call-error" role="alert">
            {callError}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function RecapSheet({
  pageTitle,
  summary,
  status,
  error,
  onOpenQuiz,
}: {
  pageTitle: string;
  summary: PageSummaryData | null;
  status: SummaryStatus;
  error: string;
  onOpenQuiz: () => void;
}) {
  const relatedLinks = summary?.relatedLinks ?? [];
  const takeaways = summary?.keyTakeaways ?? [];

  return (
    <div className="hackipedia-sheet-content hackipedia-recap-sheet">
      <h2 className="hackipedia-recap-section-title">Votre conversation</h2>

      <section className="hackipedia-recap-card hackipedia-recap-card-summary">
        <h3 id="hackipedia-summary-title">Synthèse</h3>
        <p>
          {status === "loading"
            ? "La synthèse est en cours de préparation..."
            : status === "error"
              ? error
              : summary?.synthesis ||
                `${pageTitle} : synthèse indisponible pour le moment.`}
        </p>
      </section>

      <section className="hackipedia-recap-card">
        <h3>À retenir</h3>
        <ul>
          {(status === "ready"
            ? takeaways
            : [
                "Chargement des points importants...",
                "Chargement des points importants...",
                "Chargement des points importants...",
              ]
          ).map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="hackipedia-recap-card">
        <h3>Poursuivre sur ...</h3>
        <ul className="hackipedia-recap-links">
          {(status === "ready" ? relatedLinks : []).map((item) => (
            <li key={item.url}>
              <a href={item.url} className="hackipedia-recap-link">
                <strong>
                  <span
                    className="hackipedia-recap-link-emoji"
                    aria-hidden="true"
                  >
                    {getRelatedLinkEmoji(item.label, item.detail)}
                  </span>
                  <span style={{ color: "#36c" }}>{item.label}</span>
                </strong>
                <span>{item.detail}</span>
              </a>
            </li>
          ))}
          {status !== "ready" && (
            <li>
              <span className="hackipedia-recap-link">
                <strong>Chargement des pistes associées...</strong>
                <span>Les liens cités dans la page arrivent.</span>
              </span>
            </li>
          )}
        </ul>
      </section>

      <div className="hackipedia-recap-actions">
        <button
          type="button"
          className="hackipedia-recap-primary"
          onClick={onOpenQuiz}
          disabled={status !== "ready"}
        >
          <BookOpen />
          <span>Tester mes connaissances</span>
        </button>
        <button type="button" className="hackipedia-recap-secondary">
          <Download />
          <span>Fiche de révision</span>
        </button>
      </div>
    </div>
  );
}


function TravelMapSheet({
  status,
  avatarUrl,
  onContinue,
}: {
  pageTitle: string;
  summary: PageSummaryData | null;
  status: SummaryStatus;
  avatarUrl: string | null;
  onContinue: () => void;
}) {
  console.log(avatarUrl);
  const travelSteps =
    // status === "ready" && summary
    //   ? [
    //       {
    //         label: summary.fullName,
    //         detail:
    //           summary.title ||
    //           summary.keyTakeaways[0] ||
    //           "Debut de l'exploration",
    //       },
    //       ...summary.relatedLinks.map((item) => ({
    //         label: item.label,
    //         detail: item.detail,
    //       })),
    //     ]
    //   : 
    [
          {
            label: "Albert Einstein",
            detail: "Physicien et prix Nobel",
            avatarUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Albert_Einstein_Head_cleaned.jpg/120px-Albert_Einstein_Head_cleaned.jpg",
          },
          {
            label: "Pierre Curie",
            detail: "Physicien et prix Nobel",
            avatarUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Pierre_Curie_by_Dujardin_c1906.jpg/500px-Pierre_Curie_by_Dujardin_c1906.jpg",
          },
          {
            label: "Irène Joliot-Curie",
            detail: "Chimiste, Physicienne et prix Nobel",
            avatarUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Frederic_and_Irene_Joliot-Curie.jpg/250px-Frederic_and_Irene_Joliot-Curie.jpg",
          },
          {
            label: "Marie Curie",
            detail: "Chimiste et physicienne, prix Nobel",
            avatarUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Marie_Curie_c1920.jpg/500px-Marie_Curie_c1920.jpg",
          },
        ];

  const linkCountLabel = `${travelSteps.length} liens`;
  const subtitle =
    status === "ready"
      ? `Tu as exploré ${travelSteps.length} sujets différents en 18min`
      : "Tu explores des sujets reliés en ce moment";

  return (
    <div className="hackipedia-travel-sheet">
      <div className="hackipedia-travel-card">
        <header className="hackipedia-travel-header">
          <div className="hackipedia-travel-title-row">
            <span className="hackipedia-travel-title-icon" aria-hidden="true">
              <img src={mapIcon} alt="" />
            </span>
            <h2 id="hackipedia-summary-title">Mon voyage</h2>
          </div>
          <p className="hackipedia-travel-subtitle">{subtitle}</p>
          <span className="hackipedia-travel-badge">{linkCountLabel}</span>
        </header>

        <div className="hackipedia-travel-timeline" aria-label="Parcours explore">
          {travelSteps.map((step, index) => (
            <article className="hackipedia-travel-stop" key={`${step.label}-${index}`}>
              <div className="hackipedia-travel-rail" aria-hidden="true">
                <span className="hackipedia-travel-node" />
                {index === travelSteps.length - 1 ? (
                  <span className="hackipedia-travel-arrow">
                    <span />
                    <span />
                  </span>
                ) : (
                  <span className="hackipedia-travel-segment" />
                )}
              </div>

              <div className="hackipedia-travel-stop-body">
                <span className="hackipedia-travel-avatar-wrap">
                  <span className="hackipedia-travel-step-index">{index + 1}</span>
                  <span className="hackipedia-travel-avatar">
                    {step.avatarUrl ? <img src={step.avatarUrl} alt="" /> : <span>{getInitials(step.label)}</span>}
                  </span>
                </span>

                <div className="hackipedia-travel-copy">
                  <h3>{step.label}</h3>
                  <p>+ {step.detail}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="hackipedia-travel-after">Et apres ?</p>

        <div className="hackipedia-travel-actions">
          <button
            type="button"
            className="hackipedia-travel-primary"
            onClick={onContinue}
          >
            Poursuivre l'aventure
          </button>
        </div>
      </div>
    </div>
  );
}

function QuizSheet({
  summary,
  quizIndex,
  quizScore,
  isQuizComplete,
  onAnswer,
}: {
  summary: PageSummaryData | null;
  quizIndex: number;
  quizScore: number;
  isQuizComplete: boolean;
  onAnswer: (answerIndex: number) => void;
}) {
  const currentQuestion = summary?.quizQuestions[quizIndex];
  const totalQuestions = summary?.quizQuestions.length ?? 0;
  const successThreshold = Math.max(1, Math.ceil((totalQuestions || 3) * 0.67));
  const resultMessage =
    quizScore >= successThreshold
      ? "Bravo, tu as bien retenu l'essentiel."
      : "Poursuis tes efforts, tu es sur la bonne voie.";

  return (
    <div className="hackipedia-sheet-content hackipedia-recap-sheet">
      {!isQuizComplete && currentQuestion ? (
        <section className="hackipedia-recap-card hackipedia-quiz-card">
          <div className="hackipedia-quiz-meta">
            <span>
              Question {quizIndex + 1} / {totalQuestions}
            </span>
            <span>Score {quizScore}</span>
          </div>
          <h3 id="hackipedia-summary-title">{currentQuestion.question}</h3>
          <div className="hackipedia-quiz-options">
            {currentQuestion.options.map((option, optionIndex) => (
              <button
                key={option}
                type="button"
                className="hackipedia-quiz-option"
                onClick={() => onAnswer(optionIndex)}
              >
                {option}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="hackipedia-recap-card hackipedia-quiz-card hackipedia-quiz-result-card">
          <p className="hackipedia-quiz-result-score">
            {quizScore} / {totalQuestions || 3}
          </p>
          <p
            id="hackipedia-summary-title"
            className="hackipedia-quiz-result-message"
          >
            {quizScore >= successThreshold ? "🎉" : "💪"} {resultMessage}
          </p>
        </section>
      )}
    </div>
  );
}

function AppContent({ pageTitle }: AppProps) {
  const [sheetView, setSheetView] = useState<SheetView | null>(null);
  const [mobileHeaderSlot, setMobileHeaderSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [isQuizComplete, setIsQuizComplete] = useState(false);
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("idle");
  const [summaryError, setSummaryError] = useState("");
  const [summaryData, setSummaryData] = useState<PageSummaryData | null>(null);
  const [callError, setCallError] = useState("");

  // Refs to track manual hangup and reconnect attempts
  const wasManualHangup = useRef(false);
  const reconnectAttempts = useRef(0);

  const { startSession, endSession, status, isSpeaking } =
    useConversation({
      onConnect: (metadata: any) => {
        console.info(
          "[Hackipedia] ElevenLabs conversation connected.",
          metadata,
        );
        reconnectAttempts.current = 0;
        wasManualHangup.current = false;
        setCallError("");
      },
      onDisconnect: () => {
        console.info("[Hackipedia] ElevenLabs conversation disconnected.");

        if (wasManualHangup.current) {
          // User intentionally hung up — go to recap
          wasManualHangup.current = false;
          setSheetView("recap");
        } else if (reconnectAttempts.current < 1) {
          // Unexpected drop — try once to reconnect
          reconnectAttempts.current += 1;
          console.info(
            "[Hackipedia] Unexpected disconnect — attempting reconnect in 1.5s...",
          );
          setTimeout(() => {
            toggleSpeaking();
          }, 1500);
        } else {
          // Reconnect also failed — give up and go to recap
          console.warn("[Hackipedia] Reconnect failed — redirecting to recap.");
          reconnectAttempts.current = 0;
          setSheetView("recap");
        }
      },
      onError: (err: any) => {
        console.error("[Hackipedia] ElevenLabs conversation error.", err);
        const msg =
          typeof err === "string"
            ? err
            : err?.message?.trim() || "Erreur lors de l'appel.";
        setCallError(msg);
      },
    });

  const summaryHeading = useMemo(() => {
    const cleanedTitle = cleanPageTitle(pageTitle);
    return cleanedTitle || "cette page Wikipédia";
  }, [pageTitle]);

  const leadImageUrl = useMemo(() => getPageLeadImage(), []);
  const avatarLabel = useMemo(
    () => getInitials(summaryHeading),
    [summaryHeading],
  );
  const isCallAvailable = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.isSecureContext &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
    [],
  );
  const isCallConnecting = status === "connecting";
  const isCallOngoing = status === "connected" || status === "connecting";

  const displayName = summaryData?.fullName || summaryHeading;
  const displayAvatarUrl = leadImageUrl;

  useEffect(() => {
    console.info("[Hackipedia] App mounted.", {
      pageTitle,
      summaryHeading,
      pageUrl: window.location.href,
    });
  }, [pageTitle, summaryHeading]);

  useEffect(() => {
    console.info("[Hackipedia] Summary state changed.", {
      summaryStatus,
      summaryError,
      hasSummaryData: summaryData !== null,
    });
  }, [summaryStatus, summaryError, summaryData]);

  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  useEffect(() => {
    const searchButton = document.querySelector(".minerva-search-form");

    if (!(searchButton instanceof HTMLElement)) {
      setMobileHeaderSlot(null);
      return;
    }

    const searchButtonParent = searchButton.parentElement;

    if (!(searchButtonParent instanceof HTMLElement)) {
      setMobileHeaderSlot(null);
      return;
    }

    const slot = document.createElement("div");
    slot.className = "hackipedia-sitemap-button-slot";
    searchButtonParent.insertBefore(slot, searchButton.nextSibling);
    setMobileHeaderSlot(slot);

    return () => {
      slot.remove();
      setMobileHeaderSlot(null);
    };
  }, []);

  useEffect(() => {
    setSummaryStatus("loading");
    setSummaryError("");
    console.info("[Hackipedia] Summary generation started.", {
      pageTitle: summaryHeading,
      pageUrl: window.location.href,
    });
    const abortController = new AbortController();

    void (async () => {
      try {
        console.info(
          "[Hackipedia] Reading Mistral API key from chrome.storage.local...",
        );
        const apiKey = await getStoredApiKey();
        console.info("[Hackipedia] Mistral API key loaded.", {
          hasKey: apiKey.length > 0,
          keyPrefix: apiKey.slice(0, 4),
        });

        if (apiKey.length === 0) {
          throw new Error(
            "Configure une clé API Mistral dans les paramètres de l'extension.",
          );
        }

        const payload = collectPagePayload(summaryHeading);
        console.info("[Hackipedia] Payload collected.", {
          contentLength: payload.pageContent.length,
          imageCandidates: payload.imageCandidates.length,
          linkCandidates: payload.linkCandidates.length,
        });

        const endpoint = "https://api.mistral.ai/v1/chat/completions";
        console.info("[Hackipedia] Sending Mistral request.", {
          endpoint,
          method: "POST",
        });

        const response = await fetch(endpoint, {
          method: "POST",
          signal: abortController.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
          body: JSON.stringify({
            model: "mistral-small-latest",
            response_format: {
              type: "json_object",
            },
            messages: [
              {
                role: "system",
                content: [
                  "You extract a French revision recap from a Wikipedia article about a historical figure.",
                  "Use only the provided page content, image candidates, and link candidates.",
                  "Do not invent unsupported facts.",
                  "Return one very short synthesis in French, maximum 2 short sentences.",
                  "Return exactly three keyTakeaways in French.",
                  "Each key takeaway must be ultra condensed: ideally 4 to 8 words, no long sentence.",
                  "Return exactly three relatedLinks that correspond to people or closely related named entities cited in the page.",
                  "Use only URLs that already exist in linkCandidates.",
                  "For each related link, provide a short French detail line.",
                  "Return exactly three quizQuestions in French.",
                  "Each quiz question must have exactly three answer options and exactly one correct answer.",
                  "Prefer portrait-like image URLs from imageCandidates for mainImageUrl and avatarImageUrl.",
                  "Return exactly one gender field: 'male' or 'female' based on the person.",
                  "Return valid JSON only.",
                  `Follow this JSON schema exactly: ${JSON.stringify(PAGE_SUMMARY_JSON_SCHEMA)}`,
                ].join(" "),
              },
              {
                role: "user",
                content: JSON.stringify(payload),
              },
            ],
            temperature: 0.2,
          }),
        });
        console.info("[Hackipedia] Mistral response received.", {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
        });

        const data = (await response.json()) as OpenAIResponsesApiResponse;
        console.info("[Hackipedia] Mistral response body parsed.", data);

        if (!response.ok) {
          throw new Error(
            data.error?.message ||
              "Mistral n'a pas pu générer le récapitulatif.",
          );
        }

        const outputText = extractOutputText(data);

        if (outputText.length === 0) {
          throw new Error("Mistral a renvoyé une réponse vide.");
        }

        const parsed = JSON.parse(outputText) as unknown;
        const normalizedSummary = normalizeSummaryData(parsed, payload);

        if (!normalizedSummary) {
          throw new Error("Mistral a renvoyé un résumé invalide.");
        }

        setSummaryData(normalizedSummary);
        setSummaryStatus("ready");
        console.info(
          "[Hackipedia] Summary generation completed.",
          normalizedSummary,
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          console.info("[Hackipedia] Summary generation aborted.");
          return;
        }

        console.error("[Hackipedia] Summary generation failed.", error);
        setSummaryStatus("error");
        setSummaryError(
          error instanceof Error
            ? error.message
            : "La génération du résumé a échoué.",
        );
      }
    })();

    return () => {
      console.info(
        "[Hackipedia] Summary effect cleanup: aborting pending Mistral request.",
      );
      abortController.abort();
    };
  }, [summaryHeading]);

  const openCallSheet = () => {
    setSheetView("call");
  };

  const closeSheet = () => {
    setSheetView(null);
  };

  const openQuizSheet = () => {
    setQuizIndex(0);
    setQuizScore(0);
    setIsQuizComplete(false);
    setSheetView("quiz");
  };

  const toggleSpeaking = () => {
    if (isCallAvailable === false) {
      console.error(
        "[Hackipedia] ElevenLabs conversation blocked: microphone unavailable.",
      );
      return;
    }

    if (isCallOngoing) {
      console.info("[Hackipedia] Ending ElevenLabs conversation.");
      wasManualHangup.current = true; // mark as intentional hangup
      endSession();
      return;
    }

    setCallError("");
    console.info("[Hackipedia] Starting ElevenLabs conversation.", {
      agentId: ELEVENLABS_AGENT_ID,
    });

    void (async () => {
      try {
        const dynamicVariables = summaryData
          ? {
              page_title: summaryData.fullName,
              page_synthesis: summaryData.synthesis,
              key_takeaway_1: summaryData.keyTakeaways[0] || "",
              key_takeaway_2: summaryData.keyTakeaways[1] || "",
              key_takeaway_3: summaryData.keyTakeaways[2] || "",
            }
          : undefined;

        const elevenlabsApiKey = await getStoredElevenLabsApiKey();

        if (elevenlabsApiKey.length > 0) {
          console.info("[Hackipedia] ElevenLabs API key loaded.", {
            hasKey: true,
            keyPrefix: elevenlabsApiKey.slice(0, 4),
          });

          const signedUrlResponse = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(ELEVENLABS_AGENT_ID)}`,
            {
              method: "GET",
              headers: {
                "xi-api-key": elevenlabsApiKey,
              },
            },
          );

          const signedUrlPayload = await signedUrlResponse
            .json()
            .catch(() => ({}));
          console.info(
            "[Hackipedia] ElevenLabs signed URL response received.",
            {
              ok: signedUrlResponse.ok,
              status: signedUrlResponse.status,
            },
          );

          if (!signedUrlResponse.ok) {
            throw new Error(
              typeof signedUrlPayload?.detail?.message === "string"
                ? signedUrlPayload.detail.message
                : typeof signedUrlPayload?.message === "string"
                  ? signedUrlPayload.message
                  : "Impossible de récupérer l'URL signée ElevenLabs.",
            );
          }

          if (
            typeof signedUrlPayload?.signed_url !== "string" ||
            signedUrlPayload.signed_url.length === 0
          ) {
            throw new Error("ElevenLabs n'a pas renvoyé d'URL signée valide.");
          }

          startSession({
            signedUrl: signedUrlPayload.signed_url,
            dynamicVariables,
          });
          return;
        }

        console.info(
          "[Hackipedia] No ElevenLabs API key configured. Falling back to direct agent connection.",
        );

        startSession({
          agentId: ELEVENLABS_AGENT_ID,
          dynamicVariables,
        });
      } catch (error) {
        console.error(
          "[Hackipedia] ElevenLabs conversation bootstrap failed.",
          error,
        );
        setCallError(
          error instanceof Error
            ? error.message
            : "Impossible de démarrer l'appel.",
        );
      }
    })();
  };

  const answerQuiz = (answerIndex: number) => {
    const currentQuestion = summaryData?.quizQuestions[quizIndex];

    if (!currentQuestion || isQuizComplete) {
      return;
    }

    if (answerIndex === currentQuestion.correctIndex) {
      setQuizScore((currentScore) => currentScore + 1);
    }

    if (quizIndex === (summaryData?.quizQuestions.length ?? 3) - 1) {
      setIsQuizComplete(true);
      return;
    }

    setQuizIndex((currentIndex) => currentIndex + 1);
  };

  return (
    <>
      <section
        className="hackipedia-summary-entry"
        aria-label="Résumé Hackipedia"
      >
        <div
          className={`hackipedia-summary-button${isCallOngoing ? " is-exploring" : ""}`}
        >
          <button
            type="button"
            className="hackipedia-summary-button-main"
            aria-label={`Parle-moi de ${displayName}`}
            onClick={openCallSheet}
          >
            <span className="hackipedia-summary-avatar" aria-hidden="true">
              {displayAvatarUrl ? (
                <img src={displayAvatarUrl} alt="" />
              ) : (
                <span>{avatarLabel}</span>
              )}
            </span>
            <span className="hackipedia-summary-button-copy">
              <span className="hackipedia-summary-button-name">
                {displayName}
              </span>
              <span className="hackipedia-summary-button-status">
                {isCallOngoing ? (
                  <>
                    <span
                      className="hackipedia-summary-button-status-phone"
                      aria-hidden="true"
                    >
                      <Phone />
                    </span>
                    <ElevenLabsWaveform
                      className="hackipedia-summary-button-waveform"
                      height={19}
                      barWidth={1.35}
                      barGap={0.95}
                      speed={28}
                      fadeWidth={16}
                    />
                  </>
                ) : callError ? (
                  <span className="hackipedia-summary-button-status-text">
                    Appel indisponible
                  </span>
                ) : summaryStatus === "loading" ? (
                  <span className="hackipedia-summary-button-status-text">
                    Préparation...
                  </span>
                ) : (
                  <>
                    <span
                      className="hackipedia-summary-button-status-dot"
                      aria-hidden="true"
                    />
                    <span className="hackipedia-summary-button-status-text">
                      Disponible
                    </span>
                  </>
                )}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`hackipedia-summary-button-action${isCallOngoing ? " is-hangup" : ""}`}
            aria-label={isCallOngoing ? "Raccrocher" : "Appeler"}
            onClick={toggleSpeaking}
            disabled={isCallAvailable === false}
          >
            {isCallOngoing ? <PhoneOff /> : <Phone />}
          </button>
        </div>
      </section>

      {mobileHeaderSlot &&
        createPortal(
          <button
            type="button"
            id="hackipediaSitemapButton"
            className="cdx-button cdx-button--size-large cdx-button--icon-only cdx-button--weight-quiet skin-minerva-search-trigger hackipedia-sitemap-button"
            aria-label="Mon voyage"
            title="Mon voyage"
            onClick={() => {
              console.info("[Hackipedia] Travel map button clicked.");
              setSheetView("travel");
            }}
          >
            <img
              src={mapIcon}
              alt=""
              className="hackipedia-sitemap-button-icon"
              aria-hidden="true"
            />
          </button>,
          mobileHeaderSlot,
        )}

      {sheetView &&
        createPortal(
          <div
            className={`hackipedia-summary-modal-root${sheetView === "travel" ? " hackipedia-summary-modal-root-fullscreen" : ""}`}
            role="presentation"
          >
            <button
              type="button"
              className="hackipedia-summary-backdrop"
              aria-label="Fermer le résumé"
              onClick={closeSheet}
            />

            <section
              className={`hackipedia-summary-modal${
                sheetView === "call"
                  ? " hackipedia-summary-modal-compact"
                  : sheetView === "travel"
                    ? " hackipedia-summary-modal-fullscreen"
                    : " hackipedia-summary-modal-recap"
              }`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="hackipedia-summary-title"
            >
              {sheetView === "call" ? (
                <CallSheet
                  pageTitle={displayName}
                  leadImageUrl={displayAvatarUrl}
                  isSpeaking={isSpeaking}
                  isCallConnecting={isCallConnecting}
                  isCallAvailable={isCallAvailable}
                  callError={callError}
                  onToggleSpeaking={toggleSpeaking}
                />
              ) : sheetView === "recap" ? (
                <RecapSheet
                  pageTitle={displayName}
                  summary={summaryData}
                  status={summaryStatus}
                  error={summaryError}
                  onOpenQuiz={openQuizSheet}
                />
              ) : sheetView === "travel" ? (
                <TravelMapSheet
                  pageTitle={displayName}
                  summary={summaryData}
                  status={summaryStatus}
                  avatarUrl={summaryData?.avatarImageUrl || displayAvatarUrl}
                  onContinue={closeSheet}
                />
              ) : (
                <QuizSheet
                  summary={summaryData}
                  quizIndex={quizIndex}
                  quizScore={quizScore}
                  isQuizComplete={isQuizComplete}
                  onAnswer={answerQuiz}
                />
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

function App(props: AppProps) {
  return (
    <ConversationProvider agentId={ELEVENLABS_AGENT_ID}>
      <AppContent {...props} />
    </ConversationProvider>
  );
}

export default App;
