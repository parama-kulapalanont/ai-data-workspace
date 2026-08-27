import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Props = {
  session: Session;
  onOpenAdmin: () => void;
};

type RoleRow = {
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
};

type DatasetRow = {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  status: string;
  row_count: number;
  column_count: number;
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

export default function WorkspacePage({ session, onOpenAdmin }: Props) {
  const [role, setRole] = useState<string>("กำลังโหลด...");
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [datasetsError, setDatasetsError] = useState("");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [errorText, setErrorText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function loadRole() {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single<RoleRow>();

      if (error || !data) {
        setRole("UNKNOWN");
        return;
      }

      setRole(data.role);
    }

    async function loadDatasets() {
      setDatasetsLoading(true);
      setDatasetsError("");

      const { data, error } = await supabase
        .from("datasets")
        .select(
          "id, name, description, source_type, status, row_count, column_count",
        )
        .order("created_at", { ascending: false });

      if (error) {
        setDatasets([]);
        setDatasetsError(error.message);
        setDatasetsLoading(false);
        return;
      }

      setDatasets((data ?? []) as DatasetRow[]);
      setDatasetsLoading(false);
    }

    void loadRole();
    void loadDatasets();
  }, [session.user.id]);

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanMessage = message.trim();
    if (!cleanMessage || sending) return;

    setSending(true);
    setErrorText("");
    setAnswer("");

    const { data, error } = await supabase.functions.invoke<AiResponse>(
      "ai-chat",
      {
        body: {
          message: cleanMessage,
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

    setAnswer(data.answer || "AI ไม่ได้ส่งข้อความกลับมา");
    setSending(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">AI DATA WORKSPACE</div>
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
          <h2>Data Library</h2>
          <p className="muted">
            ชุดข้อมูลที่ผู้ใช้บัญชีนี้มีสิทธิ์เห็น
          </p>

          {datasetsLoading ? (
            <div className="empty-state">กำลังโหลด Dataset...</div>
          ) : datasetsError ? (
            <div className="error-box">{datasetsError}</div>
          ) : datasets.length === 0 ? (
            <div className="empty-state">ยังไม่มี Dataset ในระบบ</div>
          ) : (
            <div>
              {datasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className="empty-state"
                  style={{ marginBottom: 12 }}
                >
                  <strong>{dataset.name}</strong>
                  <div className="muted">
                    {dataset.description || "ไม่มีคำอธิบาย"}
                  </div>
                  <small>
                    {dataset.source_type} · {dataset.status} · {dataset.row_count} rows · {dataset.column_count} columns
                  </small>
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="admin-note">
              <strong>Administrator</strong>
              <span>
                จัดการข้อมูล การเชื่อมต่อ Agent และผู้ใช้ได้จาก Admin Console
              </span>
            </div>
          )}
        </aside>

        <section className="chat-card">
          <div className="chat-header">
            <div>
              <h2>คุยกับ AI Data Agent</h2>
              <p className="muted">
                คำขอจะถูกส่งผ่าน Supabase Edge Function:
                ai-chat
              </p>
            </div>
          </div>

          <div className="answer-area">
            {answer ? (
              <div className="assistant-answer">
                {answer}
              </div>
            ) : (
              <div className="empty-answer">
                พิมพ์คำถามเพื่อทดสอบว่า User Session
                สามารถเรียก AI ได้จริง
              </div>
            )}
          </div>

          {errorText && (
            <div className="error-box">{errorText}</div>
          )}

          <form onSubmit={handleAsk} className="chat-form">
            <textarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="เช่น อธิบายหน้าที่ของ AI Data Agent แบบสั้น ๆ"
            />
            <button type="submit" disabled={sending}>
              {sending ? "กำลังวิเคราะห์..." : "ส่งให้ AI"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
