import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "../lib/supabase";
import type { DatasetRow, Role } from "../admin/types";
import "./WorkspacePage.css";

type Props = {
  session: Session;
  onOpenAdmin: () => void;
};

type AiResponse = {
  ok?: boolean;
  answer?: string;
  error?: string;
  detail?: string;
  selected_skills?: string[];
};

type ChatRole = "user" | "assistant";
type ThemeMode = "light" | "dark";
type AnswerViewMode = "text" | "dashboard";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

type ChatConversation = {
  id: string;
  title: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type KeyMetric = {
  label: string;
  value: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THEME_KEY = "ai-data-workspace-theme";
const ANSWER_VIEW_KEY = "ai-data-workspace-answer-view";
const MAX_HISTORY_MESSAGES = 6;

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeConversationTitle(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length <= 38 ? clean : `${clean.slice(0, 38)}…`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildAiMessage(question: string, history: ChatMessage[]) {
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const historyText = recentHistory
    .map((item) => `${item.role === "user" ? "ผู้ใช้" : "AI"}: ${item.content}`)
    .join("\n\n");

  return [
    historyText ? `ประวัติการสนทนาเดิม:\n${historyText}` : "",
    `คำถามล่าสุด:\n${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeyMetrics(content: string): KeyMetric[] {
  const metrics: KeyMetric[] = [];
  const seen = new Set<string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("|")) continue;

    const boldValue =
      line.match(/\*\*([+-]?\d[\d,]*(?:\.\d+)?\s*%)\*\*/) ??
      line.match(/\*\*([+-]?\d[\d,]*(?:\.\d+)?)\*\*/);

    const fallbackValue =
      line.match(/([+-]?\d[\d,]*(?:\.\d+)?\s*%)/) ??
      null;

    const match = boldValue ?? fallbackValue;
    if (!match) continue;

    const value = match[1].replace(/\s+/g, "");
    if (seen.has(value)) continue;

    const index = line.indexOf(match[0]);
    let label = plainText(line.slice(0, index))
      .replace(/^[\s:–—\-•]+|[\s:–—\-•]+$/g, "")
      .trim();

    if (!label) {
      label = plainText(line.replace(match[0], ""))
        .replace(/^[\s:–—\-•]+|[\s:–—\-•]+$/g, "")
        .trim();
    }

    if (!label || label.length > 80) continue;

    seen.add(value);
    metrics.push({
      label: label.length > 52 ? `${label.slice(0, 52)}…` : label,
      value,
    });

    if (metrics.length >= 4) break;
  }

  return metrics;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 15.4A8.3 8.3 0 0 1 8.6 3.5 8.8 8.8 0 1 0 20.5 15.4Z" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4M9 11h6M9 15h6M9 19h4" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="8" height="7" rx="1.5" />
      <rect x="13" y="3" width="8" height="4" rx="1.5" />
      <rect x="13" y="9" width="8" height="12" rx="1.5" />
      <rect x="3" y="12" width="8" height="9" rx="1.5" />
    </svg>
  );
}

function AssistantAnswer({
  content,
  mode,
}: {
  content: string;
  mode: AnswerViewMode;
}) {
  if (mode === "text") {
    return (
      <div className="message-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  const metrics = extractKeyMetrics(content);

  return (
    <div className="answer-dashboard">
      {metrics.length > 0 && (
        <section className="dashboard-kpi-section">
          <div className="dashboard-section-label">ตัวเลขสำคัญ</div>
          <div className="dashboard-kpi-grid">
            {metrics.map((metric, index) => (
              <div className="dashboard-kpi-card" key={`${metric.label}-${index}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-report-card">
        <div className="dashboard-section-label">สรุปผลการวิเคราะห์</div>
        <div className="message-content dashboard-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </section>
    </div>
  );
}

export default function WorkspacePage({ session, onOpenAdmin }: Props) {
  const [role, setRole] = useState<Role | "UNKNOWN" | "LOADING">("LOADING");
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [errorText, setErrorText] = useState("");
  const [sending, setSending] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light",
  );
  const [answerView, setAnswerView] = useState<AnswerViewMode>(() =>
    localStorage.getItem(ANSWER_VIEW_KEY) === "dashboard" ? "dashboard" : "text",
  );
  const threadRef = useRef<HTMLDivElement | null>(null);

  const storageKey = useMemo(
    () => `ai-data-workspace-chat:${session.user.id}`,
    [session.user.id],
  );

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const selected = datasets.find((item) => item.id === selectedDatasetId);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

  function saveConversations(next: ChatConversation[]) {
    const sorted = [...next].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    setConversations(sorted);
    localStorage.setItem(storageKey, JSON.stringify(sorted));
  }

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(ANSWER_VIEW_KEY, answerView);
  }, [answerView]);

  useEffect(() => {
    async function load() {
      const [roleResult, datasetResult] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .single<{ role: Role }>(),
        supabase
          .from("datasets")
          .select("id,name,description,source_type,status,row_count,column_count,created_at")
          .eq("status", "READY")
          .order("created_at", { ascending: false }),
      ]);

      setRole(roleResult.error || !roleResult.data ? "UNKNOWN" : roleResult.data.role);

      const list = (datasetResult.data ?? []) as DatasetRow[];
      setDatasets(list);
      if (list.length) setSelectedDatasetId((current) => current || list[0].id);
    }

    void load();
  }, [session.user.id]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;

      const parsed = JSON.parse(saved) as ChatConversation[];
      const now = Date.now();
      const valid = parsed.filter((item) => {
        const updated = new Date(item.updatedAt).getTime();
        return !Number.isNaN(updated) && now - updated < ONE_DAY_MS;
      });

      const sorted = [...valid].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      setConversations(sorted);
      localStorage.setItem(storageKey, JSON.stringify(sorted));
    } catch {
      localStorage.removeItem(storageKey);
      setConversations([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (activeConversation?.datasetId) {
      setSelectedDatasetId(activeConversation.datasetId);
    }
  }, [activeConversationId, activeConversation]);

  useEffect(() => {
    const element = threadRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [activeConversation?.messages.length, sending]);

  function handleNewChat() {
    setActiveConversationId("");
    setMessage("");
    setErrorText("");
  }

  function handleOpenConversation(conversation: ChatConversation) {
    setActiveConversationId(conversation.id);
    if (conversation.datasetId) setSelectedDatasetId(conversation.datasetId);
    setErrorText("");
  }

  function handleDeleteConversation(id: string) {
    if (!window.confirm("ลบประวัติการสนทนานี้หรือไม่")) return;
    saveConversations(conversations.filter((item) => item.id !== id));
    if (activeConversationId === id) handleNewChat();
  }

  function handleDeleteAll() {
    if (
      !conversations.length ||
      !window.confirm("ลบประวัติการสนทนาทั้งหมดหรือไม่")
    ) {
      return;
    }

    localStorage.removeItem(storageKey);
    setConversations([]);
    handleNewChat();
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanMessage = message.trim();
    if (!cleanMessage || sending) return;

    setSending(true);
    setErrorText("");
    setMessage("");

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: cleanMessage,
      createdAt: now,
    };

    const previousMessages = activeConversation?.messages ?? [];
    const conversation: ChatConversation = activeConversation
      ? {
          ...activeConversation,
          datasetId: selectedDatasetId,
          updatedAt: now,
          messages: [...previousMessages, userMessage],
        }
      : {
          id: createId(),
          title: makeConversationTitle(cleanMessage),
          datasetId: selectedDatasetId,
          createdAt: now,
          updatedAt: now,
          messages: [userMessage],
        };

    const withUser = activeConversation
      ? conversations.map((item) =>
          item.id === conversation.id ? conversation : item,
        )
      : [conversation, ...conversations];

    saveConversations(withUser);
    setActiveConversationId(conversation.id);

    const { data, error } = await supabase.functions.invoke<AiResponse>("ai-chat", {
      body: {
        message: buildAiMessage(cleanMessage, previousMessages),
        dataset_id: selectedDatasetId || null,
      },
    });

    if (error || !data?.ok) {
      setErrorText(
        error?.message || data?.detail || data?.error || "AI request failed",
      );
      setSending(false);
      return;
    }

    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: data.answer || "AI ไม่ได้ส่งข้อความกลับมา",
      createdAt: new Date().toISOString(),
    };

    const completed: ChatConversation = {
      ...conversation,
      updatedAt: assistantMessage.createdAt,
      messages: [...conversation.messages, assistantMessage],
    };

    saveConversations(
      withUser.map((item) => (item.id === completed.id ? completed : item)),
    );
    setSending(false);
  }

  async function handleSignOut() {
    localStorage.removeItem(storageKey);
    setConversations([]);
    setActiveConversationId("");
    await supabase.auth.signOut();
  }

  return (
    <main className={`workspace-v2 theme-${theme}`}>
      <header className="workspace-v2-header">
        <div className="workspace-v2-title">
          <span>AI DATA WORKSPACE</span>
          <h1>AI Data Agent</h1>
        </div>

        <div className="workspace-v2-actions">
          <div className="icon-switch" aria-label="เลือกธีม">
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              onClick={() => setTheme("light")}
              aria-label="ธีมสว่าง"
              aria-pressed={theme === "light"}
              title="ธีมสว่าง"
            >
              <SunIcon />
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              onClick={() => setTheme("dark")}
              aria-label="ธีมมืด"
              aria-pressed={theme === "dark"}
              title="ธีมมืด"
            >
              <MoonIcon />
            </button>
          </div>

          <div className="workspace-user">
            <strong>{session.user.email}</strong>
            <span>{role}</span>
          </div>

          {isAdmin && (
            <button
              className="workspace-outline-button"
              type="button"
              onClick={onOpenAdmin}
            >
              Admin Console
            </button>
          )}

          <button
            className="workspace-outline-button"
            type="button"
            onClick={handleSignOut}
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <section className="workspace-v2-grid">
        <aside className="workspace-sidebar">
          <section className="sidebar-section history-section">
            <div className="section-title-row">
              <h2>ประวัติแชท</h2>
              {conversations.length > 0 && (
                <button
                  className="text-danger-button"
                  type="button"
                  onClick={handleDeleteAll}
                >
                  ลบทั้งหมด
                </button>
              )}
            </div>

            <button
              className="new-chat-button-v2"
              type="button"
              onClick={handleNewChat}
            >
              + แชทใหม่
            </button>

            <div className="conversation-list-v2">
              {conversations.length === 0 ? (
                <div className="compact-empty">ยังไม่มีประวัติ</div>
              ) : (
                conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`conversation-row-v2 ${
                      activeConversationId === conversation.id ? "active" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenConversation(conversation)}
                    >
                      <strong>{conversation.title}</strong>
                      <span>{formatTime(conversation.updatedAt)}</span>
                    </button>
                    <button
                      className="delete-chat-button"
                      type="button"
                      title="ลบแชท"
                      onClick={() => handleDeleteConversation(conversation.id)}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="sidebar-section dataset-section-v2">
            <h2>Data Library</h2>
            <div className="dataset-list-v2">
              {datasets.length === 0 ? (
                <div className="compact-empty">ยังไม่มี Dataset สถานะ READY</div>
              ) : (
                datasets.map((dataset) => (
                  <button
                    type="button"
                    key={dataset.id}
                    className={
                      selectedDatasetId === dataset.id ? "active" : ""
                    }
                    onClick={() => setSelectedDatasetId(dataset.id)}
                  >
                    <strong>{dataset.name}</strong>
                    <span>
                      {dataset.row_count.toLocaleString()} rows ·{" "}
                      {dataset.column_count} columns
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="workspace-chat-panel">
          <div className="chat-panel-header-v2">
            <div>
              <h2>{activeConversation?.title || "คุยกับ AI Data Agent"}</h2>
              <span>
                {selected
                  ? `Dataset: ${selected.name}`
                  : "ยังไม่ได้เลือก Dataset"}
              </span>
            </div>

            <div className="answer-view-switch" aria-label="รูปแบบการแสดงคำตอบ">
              <button
                type="button"
                className={answerView === "text" ? "active" : ""}
                onClick={() => setAnswerView("text")}
                aria-label="มุมมองข้อความ"
                aria-pressed={answerView === "text"}
                title="มุมมองข้อความ"
              >
                <DocumentIcon />
              </button>
              <button
                type="button"
                className={answerView === "dashboard" ? "active" : ""}
                onClick={() => setAnswerView("dashboard")}
                aria-label="มุมมองแดชบอร์ด"
                aria-pressed={answerView === "dashboard"}
                title="มุมมองแดชบอร์ด"
              >
                <DashboardIcon />
              </button>
            </div>
          </div>

          <div className="chat-thread-v2" ref={threadRef}>
            {!activeConversation?.messages.length ? (
              <div className="chat-start-state">
                ถามคำถามเกี่ยวกับ Dataset ที่เลือกได้เลย
              </div>
            ) : (
              activeConversation.messages.map((chatMessage) => (
                <article
                  key={chatMessage.id}
                  className={`message-card ${chatMessage.role} ${
                    chatMessage.role === "assistant" &&
                    answerView === "dashboard"
                      ? "dashboard-mode"
                      : ""
                  }`}
                >
                  <div className="message-meta">
                    <strong>
                      {chatMessage.role === "user" ? "คุณ" : "AI Data Agent"}
                    </strong>
                    <span>{formatTime(chatMessage.createdAt)}</span>
                  </div>

                  {chatMessage.role === "assistant" ? (
                    <AssistantAnswer
                      content={chatMessage.content}
                      mode={answerView}
                    />
                  ) : (
                    <div className="message-content">
                      <p>{chatMessage.content}</p>
                    </div>
                  )}
                </article>
              ))
            )}

            {sending && (
              <article className="message-card assistant thinking-card">
                <div className="message-meta">
                  <strong>AI Data Agent</strong>
                </div>
                <div className="message-content">
                  <p>กำลังวิเคราะห์...</p>
                </div>
              </article>
            )}
          </div>

          {errorText && <div className="workspace-error">{errorText}</div>}

          <form className="chat-form-v2" onSubmit={handleAsk}>
            <textarea
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="ถามเกี่ยวกับข้อมูล..."
            />
            <button type="submit" disabled={sending || !message.trim()}>
              {sending ? "กำลังวิเคราะห์..." : "ส่ง"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
