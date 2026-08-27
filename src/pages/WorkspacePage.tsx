import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { supabase } from "../lib/supabase";
import type { DatasetRow, Role } from "../admin/types";

type Props = {
  session: Session;
  onOpenAdmin: () => void;
};

type AiResponse = {
  ok?: boolean;
  answer?: string;
  error?: string;
  detail?: string;
  agent?: {
    name?: string;
    model?: string;
    prompt_version?: number;
    config_source?: string;
  };
};

type ChatRole = "user" | "assistant";

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

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeConversationTitle(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();

  if (clean.length <= 42) return clean;

  return `${clean.slice(0, 42)}…`;
}

function formatConversationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WorkspacePage({
  session,
  onOpenAdmin,
}: Props) {
  const [role, setRole] = useState<
    Role | "UNKNOWN" | "LOADING"
  >("LOADING");

  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] =
    useState<string>("");

  const [message, setMessage] = useState("");

  const [conversations, setConversations] = useState<
    ChatConversation[]
  >([]);

  const [activeConversationId, setActiveConversationId] =
    useState<string>("");

  const [errorText, setErrorText] = useState("");
  const [sending, setSending] = useState(false);

  const answerAreaRef = useRef<HTMLDivElement | null>(null);

  const storageKey = useMemo(
    () => `ai-data-workspace-chat:${session.user.id}`,
    [session.user.id],
  );

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (item) => item.id === activeConversationId,
      ) ?? null,
    [conversations, activeConversationId],
  );

  const selected = datasets.find(
    (item) => item.id === selectedDatasetId,
  );

  const isAdmin =
    role === "ADMIN" || role === "SUPER_ADMIN";

  function saveConversations(next: ChatConversation[]) {
    const sorted = [...next].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() -
        new Date(a.updatedAt).getTime(),
    );

    setConversations(sorted);

    localStorage.setItem(
      storageKey,
      JSON.stringify(sorted),
    );
  }

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
          .select(
            "id,name,description,source_type,status,row_count,column_count,created_at",
          )
          .eq("status", "READY")
          .order("created_at", {
            ascending: false,
          }),
      ]);

      setRole(
        roleResult.error || !roleResult.data
          ? "UNKNOWN"
          : roleResult.data.role,
      );

      const list =
        (datasetResult.data ?? []) as DatasetRow[];

      setDatasets(list);

      if (list.length) {
        setSelectedDatasetId((current) =>
          current || list[0].id,
        );
      }
    }

    void load();
  }, [session.user.id]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);

      if (!saved) {
        setConversations([]);
        return;
      }

      const parsed =
        JSON.parse(saved) as ChatConversation[];

      const now = Date.now();

      const valid = parsed.filter((conversation) => {
        const updated =
          new Date(conversation.updatedAt).getTime();

        if (Number.isNaN(updated)) return false;

        return now - updated < ONE_DAY_MS;
      });

      const sorted = [...valid].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() -
          new Date(a.updatedAt).getTime(),
      );

      setConversations(sorted);

      localStorage.setItem(
        storageKey,
        JSON.stringify(sorted),
      );
    } catch {
      localStorage.removeItem(storageKey);
      setConversations([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!activeConversation) return;

    if (activeConversation.datasetId) {
      setSelectedDatasetId(
        activeConversation.datasetId,
      );
    }
  }, [activeConversationId]);

  useEffect(() => {
    const element = answerAreaRef.current;

    if (!element) return;

    element.scrollTo({
      top: element.scrollHeight,
      behavior: "smooth",
    });
  }, [
    activeConversation?.messages.length,
    sending,
  ]);

  function handleNewChat() {
    setActiveConversationId("");
    setMessage("");
    setErrorText("");
  }

  function handleOpenConversation(
    conversation: ChatConversation,
  ) {
    setActiveConversationId(conversation.id);

    if (conversation.datasetId) {
      setSelectedDatasetId(
        conversation.datasetId,
      );
    }

    setErrorText("");
  }

  function handleDatasetSelect(datasetId: string) {
    setSelectedDatasetId(datasetId);

    if (!activeConversationId) return;

    const now = new Date().toISOString();

    const next = conversations.map((conversation) =>
      conversation.id === activeConversationId
        ? {
            ...conversation,
            datasetId,
            updatedAt: now,
          }
        : conversation,
    );

    saveConversations(next);
  }

  function handleDeleteConversation(
    conversationId: string,
  ) {
    const confirmed = window.confirm(
      "ต้องการลบประวัติการสนทนานี้หรือไม่",
    );

    if (!confirmed) return;

    const next = conversations.filter(
      (conversation) =>
        conversation.id !== conversationId,
    );

    saveConversations(next);

    if (
      activeConversationId === conversationId
    ) {
      setActiveConversationId("");
      setMessage("");
      setErrorText("");
    }
  }

  function handleDeleteAllConversations() {
    if (!conversations.length) return;

    const confirmed = window.confirm(
      "ต้องการลบประวัติการสนทนาทั้งหมดหรือไม่",
    );

    if (!confirmed) return;

    localStorage.removeItem(storageKey);

    setConversations([]);
    setActiveConversationId("");
    setMessage("");
    setErrorText("");
  }

  async function handleAsk(
    event: FormEvent<HTMLFormElement>,
  ) {
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

    let conversation: ChatConversation;

    if (activeConversation) {
      conversation = {
        ...activeConversation,
        datasetId: selectedDatasetId,
        updatedAt: now,
        messages: [
          ...activeConversation.messages,
          userMessage,
        ],
      };
    } else {
      conversation = {
        id: createId(),
        title: makeConversationTitle(
          cleanMessage,
        ),
        datasetId: selectedDatasetId,
        createdAt: now,
        updatedAt: now,
        messages: [userMessage],
      };
    }

    const conversationsWithUser =
      activeConversation
        ? conversations.map((item) =>
            item.id === conversation.id
              ? conversation
              : item,
          )
        : [conversation, ...conversations];

    saveConversations(
      conversationsWithUser,
    );

    setActiveConversationId(
      conversation.id,
    );

    const historyText =
      conversation.messages
        .map((item) => {
          const speaker =
            item.role === "user"
              ? "ผู้ใช้"
              : "AI";

          return `${speaker}:\n${item.content}`;
        })
        .join("\n\n");

    const messageForAi =
      conversation.messages.length > 1
        ? [
            "ต่อไปนี้คือประวัติการสนทนาเดิมในแชทเดียวกัน",
            "ให้ใช้บริบทจากข้อความก่อนหน้าเมื่อผู้ใช้ถามต่อเนื่อง",
            "",
            historyText,
            "",
            "โปรดตอบคำถามล่าสุดของผู้ใช้",
          ].join("\n")
        : cleanMessage;

    const { data, error } =
      await supabase.functions.invoke<AiResponse>(
        "ai-chat",
        {
          body: {
            message: messageForAi,
            dataset_id:
              selectedDatasetId || null,
          },
        },
      );

    if (error) {
      setErrorText(error.message);
      setSending(false);
      return;
    }

    if (!data?.ok) {
      setErrorText(
        data?.detail ||
          data?.error ||
          "AI request failed",
      );

      setSending(false);
      return;
    }

    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content:
        data.answer ||
        "AI ไม่ได้ส่งข้อความกลับมา",
      createdAt: new Date().toISOString(),
    };

    const completedConversation: ChatConversation =
      {
        ...conversation,
        updatedAt:
          assistantMessage.createdAt,
        messages: [
          ...conversation.messages,
          assistantMessage,
        ],
      };

    const completedList =
      conversationsWithUser.map((item) =>
        item.id === completedConversation.id
          ? completedConversation
          : item,
      );

    saveConversations(completedList);

    setSending(false);
  }

  async function handleSignOut() {
    localStorage.removeItem(storageKey);

    setConversations([]);
    setActiveConversationId("");

    await supabase.auth.signOut();
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">
            AI DATA WORKSPACE
          </div>

          <h1>AI Data Agent</h1>
        </div>

        <div className="user-area">
          <div>
            <div>{session.user.email}</div>
            <small>Role: {role}</small>
          </div>

          {isAdmin && (
            <button
              className="secondary-button"
              type="button"
              onClick={onOpenAdmin}
            >
              Admin Console
            </button>
          )}

          <button
            className="secondary-button"
            type="button"
            onClick={handleSignOut}
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="sidebar-card">
          <section>
            <div className="chat-sidebar-heading">
              <div>
                <h2>ประวัติแชท</h2>
                <p className="muted">
                  ประวัติจะถูกลบเมื่อออกจากระบบ
                  หรือเมื่อไม่มีการใช้งานเกิน 24
                  ชั่วโมง
                </p>
              </div>
            </div>

            <button
              type="button"
              className="new-chat-button"
              onClick={handleNewChat}
            >
              + แชทใหม่
            </button>

            {conversations.length > 0 && (
              <button
                type="button"
                className="clear-history-button"
                onClick={
                  handleDeleteAllConversations
                }
              >
                ลบประวัติทั้งหมด
              </button>
            )}

            <div className="conversation-list">
              {conversations.length === 0 ? (
                <div className="conversation-empty">
                  ยังไม่มีประวัติการสนทนา
                </div>
              ) : (
                conversations.map(
                  (conversation) => (
                    <div
                      key={conversation.id}
                      className={`conversation-item ${
                        activeConversationId ===
                        conversation.id
                          ? "active"
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="conversation-open-button"
                        onClick={() =>
                          handleOpenConversation(
                            conversation,
                          )
                        }
                      >
                        <strong>
                          {conversation.title}
                        </strong>

                        <span>
                          {formatConversationTime(
                            conversation.updatedAt,
                          )}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="conversation-delete-button"
                        title="ลบประวัตินี้"
                        onClick={() =>
                          handleDeleteConversation(
                            conversation.id,
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ),
                )
              )}
            </div>
          </section>

          <section className="dataset-library-section">
            <h2>Data Library</h2>

            <p className="muted">
              เลือก Dataset
              ที่จะใช้เป็นบริบทของ AI
            </p>

            {datasets.length === 0 ? (
              <div className="empty-state">
                ยังไม่มี Dataset สถานะ READY
              </div>
            ) : (
              <div className="dataset-select-list">
                {datasets.map((dataset) => (
                  <button
                    type="button"
                    key={dataset.id}
                    className={`dataset-select-item ${
                      selectedDatasetId ===
                      dataset.id
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      handleDatasetSelect(
                        dataset.id,
                      )
                    }
                  >
                    <strong>
                      {dataset.name}
                    </strong>

                    <span>
                      {dataset.row_count} rows ·{" "}
                      {dataset.column_count}{" "}
                      columns
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="admin-note">
                <strong>
                  Selected Dataset
                </strong>

                <span>{selected.name}</span>

                <small>
                  {selected.description ||
                    "ไม่มีคำอธิบาย"}
                </small>
              </div>
            )}
          </section>
        </aside>

        <section className="chat-card">
          <div className="chat-header">
            <div>
              <h2>
                {activeConversation
                  ? activeConversation.title
                  : "คุยกับ AI Data Agent"}
              </h2>

              <p className="muted">
                {selected
                  ? `กำลังใช้ Dataset: ${selected.name}`
                  : "ยังไม่ได้เลือก Dataset"}
              </p>
            </div>
          </div>

          <div
            className="answer-area chat-thread"
            ref={answerAreaRef}
          >
            {!activeConversation ||
            activeConversation.messages
              .length === 0 ? (
              <div className="empty-answer">
                เลือก Dataset
                แล้วถามคำถามเกี่ยวกับข้อมูลได้
              </div>
            ) : (
              activeConversation.messages.map(
                (chatMessage) => (
                  <div
                    key={chatMessage.id}
                    className={`chat-message-row ${chatMessage.role}`}
                  >
                    <div
                      className={`chat-message-bubble ${chatMessage.role}`}
                    >
                      {chatMessage.role ===
                      "assistant" ? (
                        <div className="assistant-answer markdown-answer">
                          <ReactMarkdown
                            remarkPlugins={[
                              remarkGfm,
                            ]}
                          >
                            {
                              chatMessage.content
                            }
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="user-message-text">
                          {
                            chatMessage.content
                          }
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )
            )}

            {sending && (
              <div className="chat-message-row assistant">
                <div className="chat-message-bubble assistant ai-thinking">
                  กำลังวิเคราะห์...
                </div>
              </div>
            )}
          </div>

          {errorText && (
            <div className="error-box">
              {errorText}
            </div>
          )}

          <form
            onSubmit={handleAsk}
            className="chat-form"
          >
            <textarea
              rows={4}
              value={message}
              onChange={(e) =>
                setMessage(e.target.value)
              }
              placeholder="เช่น สรุปข้อมูลนี้ และชี้ประเด็นที่ควรตรวจสอบ"
            />

            <button
              type="submit"
              disabled={
                sending || !message.trim()
              }
            >
              {sending
                ? "กำลังวิเคราะห์..."
                : "ส่งให้ AI"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}