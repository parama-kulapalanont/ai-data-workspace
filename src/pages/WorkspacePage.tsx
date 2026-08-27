import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Props = {
  session: Session;
};

type RoleRow = {
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
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

export default function WorkspacePage({ session }: Props) {
  const [role, setRole] = useState<string>("กำลังโหลด...");
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

    loadRole();
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
            ยังไม่ได้เชื่อม Dataset ใน Starter V1
          </p>
          <div className="empty-state">
            ขั้นถัดไปจะเชื่อมตาราง datasets และระบบเลือกชุดข้อมูล
          </div>

          {(role === "ADMIN" || role === "SUPER_ADMIN") && (
            <div className="admin-note">
              <strong>Admin access detected</strong>
              <span>
                เมนูหลังบ้านจะเพิ่มในขั้นถัดไป
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
