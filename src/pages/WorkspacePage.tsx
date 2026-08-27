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
};

type ChatRole = "user" | "assistant";
type ThemeMode = "light" | "dark";

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THEME_KEY = "ai-data-workspace-theme";

const RESPONSE_POLICY = [
  "รูปแบบการตอบที่ต้องปฏิบัติ:",
  "- เริ่มด้วยผลลัพธ์ คำตอบ หรือตัวเลขสำคัญทันที",
  "- ตอบให้กระชับ ใช้เฉพาะข้อมูลที่จำเป็นต่อคำถาม",
  "- ห้ามเกริ่นหลักการทั่วไป ห้ามสรุปวิธีคิด และห้ามอธิบายพื้นฐานที่ผู้ใช้ไม่ได้ถาม",
  "- หากข้อมูลไม่พอ ให้ถามกลับสั้น ๆ เฉพาะข้อมูลที่จำเป็นก่อนตอบ",
  "- หากเป็นการวิเคราะห์ข้อมูล ให้แสดงตัวเลข ตาราง หรือข้อค้นพบก่อนคำอธิบาย",
  "- ใช้ Markdown เท่าที่ช่วยให้อ่านผลลัพธ์ได้เร็ว เช่น ตัวหนา รายการ และตาราง",
].join("\n");

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
  const historyText = history
    .map((item) => `${item.role === "user" ? "ผู้ใช้" : "AI"}: ${item.content}`)
    .join("\n\n");

  return [
    RESPONSE_POLICY,
    historyText ? `\nประวัติการสนทนาเดิม:\n${historyText}` : "",
    `\nคำถามล่าสุด:\n${question}`,
  ]
    .filter(Boolean)
    .join("\n");
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
    if (!conversations.length || !window.confirm("ลบประวัติการสนทนาทั้งหมดหรือไม่")) return;
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
      ? conversations.map((item) => (item.id === conversation.id ? conversation : item))
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
      setErrorText(error?.message || data?.detail || data?.error || "AI request failed");
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

    saveConversations(withUser.map((item) => (item.id === completed.id ? completed : item)));
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
          <div className="theme-switch" aria-label="เลือกธีม">
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              onClick={() => setTheme("light")}
            >
              ขาว–ชมพู
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              onClick={() => setTheme("dark")}
            >
              ดำ–ชมพู
            </button>
          </div>
          <div className="workspace-user">
            <strong>{session.user.email}</strong>
            <span>{role}</span>
          </div>
          {isAdmin && (
            <button className="workspace-outline-button" type="button" onClick={onOpenAdmin}>
              Admin Console
            </button>
          )}
          <button className="workspace-outline-button" type="button" onClick={handleSignOut}>
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
                <button className="text-danger-button" type="button" onClick={handleDeleteAll}>
                  ลบทั้งหมด
                </button>
              )}
            </div>
            <button className="new-chat-button-v2" type="button" onClick={handleNewChat}>
              + แชทใหม่
            </button>
            <div className="conversation-list-v2">
              {conversations.length === 0 ? (
                <div className="compact-empty">ยังไม่มีประวัติ</div>
              ) : (
                conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`conversation-row-v2 ${activeConversationId === conversation.id ? "active" : ""}`}
                  >
                    <button type="button" onClick={() => handleOpenConversation(conversation)}>
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
                    className={selectedDatasetId === dataset.id ? "active" : ""}
                    onClick={() => setSelectedDatasetId(dataset.id)}
                  >
                    <strong>{dataset.name}</strong>
                    <span>{dataset.row_count} rows · {dataset.column_count} columns</span>
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
              <span>{selected ? `Dataset: ${selected.name}` : "ยังไม่ได้เลือก Dataset"}</span>
            </div>
          </div>

          <div className="chat-thread-v2" ref={threadRef}>
            {!activeConversation?.messages.length ? (
              <div className="chat-start-state">ถามคำถามเกี่ยวกับ Dataset ที่เลือกได้เลย</div>
            ) : (
              activeConversation.messages.map((chatMessage) => (
                <article key={chatMessage.id} className={`message-card ${chatMessage.role}`}>
                  <div className="message-meta">
                    <strong>{chatMessage.role === "user" ? "คุณ" : "AI Data Agent"}</strong>
                    <span>{formatTime(chatMessage.createdAt)}</span>
                  </div>
                  <div className="message-content">
                    {chatMessage.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{chatMessage.content}</ReactMarkdown>
                    ) : (
                      <p>{chatMessage.content}</p>
                    )}
                  </div>
                </article>
              ))
            )}

            {sending && (
              <article className="message-card assistant thinking-card">
                <div className="message-meta"><strong>AI Data Agent</strong></div>
                <div className="message-content"><p>กำลังวิเคราะห์...</p></div>
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
