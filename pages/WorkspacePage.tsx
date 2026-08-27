import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
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

export default function WorkspacePage({ session, onOpenAdmin }: Props) {
  const [role, setRole] = useState<Role | "UNKNOWN" | "LOADING">("LOADING");
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [errorText, setErrorText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      const [roleResult, datasetResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", session.user.id).single<{ role: Role }>(),
        supabase
          .from("datasets")
          .select("id,name,description,source_type,status,row_count,column_count,created_at")
          .eq("status", "READY")
          .order("created_at", { ascending: false }),
      ]);

      setRole(roleResult.error || !roleResult.data ? "UNKNOWN" : roleResult.data.role);
      const list = (datasetResult.data ?? []) as DatasetRow[];
      setDatasets(list);
      if (list.length && !selectedDatasetId) setSelectedDatasetId(list[0].id);
    }
    void load();
  }, [session.user.id]);

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage || sending) return;

    setSending(true);
    setErrorText("");
    setAnswer("");

    const { data, error } = await supabase.functions.invoke<AiResponse>("ai-chat", {
      body: {
        message: cleanMessage,
        dataset_id: selectedDatasetId || null,
      },
    });

    if (error) setErrorText(error.message);
    else if (!data?.ok) setErrorText(data?.detail || data?.error || "AI request failed");
    else setAnswer(data.answer || "AI ไม่ได้ส่งข้อความกลับมา");

    setSending(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const selected = datasets.find((item) => item.id === selectedDatasetId);

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
          {isAdmin && <button className="secondary-button" type="button" onClick={onOpenAdmin}>Admin Console</button>}
          <button className="secondary-button" type="button" onClick={handleSignOut}>ออกจากระบบ</button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="sidebar-card">
          <h2>Data Library</h2>
          <p className="muted">เลือก Dataset ที่จะใช้เป็นบริบทของ AI</p>

          {datasets.length === 0 ? (
            <div className="empty-state">ยังไม่มี Dataset สถานะ READY</div>
          ) : (
            <div className="dataset-select-list">
              {datasets.map((dataset) => (
                <button
                  type="button"
                  key={dataset.id}
                  className={`dataset-select-item ${selectedDatasetId === dataset.id ? "active" : ""}`}
                  onClick={() => setSelectedDatasetId(dataset.id)}
                >
                  <strong>{dataset.name}</strong>
                  <span>{dataset.row_count} rows · {dataset.column_count} columns</span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="admin-note">
              <strong>Selected Dataset</strong>
              <span>{selected.name}</span>
              <small>{selected.description || "ไม่มีคำอธิบาย"}</small>
            </div>
          )}
        </aside>

        <section className="chat-card">
          <div className="chat-header">
            <div>
              <h2>คุยกับ AI Data Agent</h2>
              <p className="muted">
                {selected ? `กำลังใช้ Dataset: ${selected.name}` : "ยังไม่ได้เลือก Dataset"}
              </p>
            </div>
          </div>

          <div className="answer-area">
            {answer ? <div className="assistant-answer">{answer}</div> : (
              <div className="empty-answer">เลือก Dataset แล้วถามคำถามเกี่ยวกับข้อมูลได้</div>
            )}
          </div>

          {errorText && <div className="error-box">{errorText}</div>}

          <form onSubmit={handleAsk} className="chat-form">
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="เช่น สรุปข้อมูลนี้ และชี้ประเด็นที่ควรตรวจสอบ"
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
