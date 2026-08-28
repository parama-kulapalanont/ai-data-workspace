import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { AgentConfigRow, AgentPromptRow } from "./types";

type Props = {
  session: Session;
  canEdit: boolean;
};

export default function AgentConfigPanel({ session: _session, canEdit }: Props) {
  const [agent, setAgent] = useState<AgentConfigRow | null>(null);
  const [prompt, setPrompt] = useState<AgentPromptRow | null>(null);
  const [promptText, setPromptText] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("0.2");
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setErrorText("");

    const { data: agents, error: agentError } = await supabase
      .from("agent_configs")
      .select("id,name,provider,model,temperature,is_active")
      .eq("is_active", true)
      .limit(1);

    if (agentError || !agents?.[0]) {
      setErrorText(agentError?.message || "ไม่พบ Active Agent");
      return;
    }

    const activeAgent = agents[0] as AgentConfigRow;
    setAgent(activeAgent);
    setModel(activeAgent.model);
    setTemperature(String(activeAgent.temperature));

    const { data: prompts, error: promptError } = await supabase
      .from("agent_prompts")
      .select("id,agent_id,name,active_version")
      .eq("agent_id", activeAgent.id)
      .limit(1);

    if (promptError || !prompts?.[0]) {
      setErrorText(promptError?.message || "ไม่พบ System Prompt");
      return;
    }

    const promptRow = prompts[0] as AgentPromptRow;
    setPrompt(promptRow);

    const { data: activeVersion, error: versionError } = await supabase
      .from("agent_prompt_versions")
      .select("prompt_text")
      .eq("prompt_id", promptRow.id)
      .eq("version", promptRow.active_version)
      .single<{ prompt_text: string }>();

    if (versionError || !activeVersion) {
      setErrorText(versionError?.message || "ไม่พบ Prompt ปัจจุบัน");
      setPromptText("");
      return;
    }

    setPromptText(activeVersion.prompt_text ?? "");
  }

  useEffect(() => { void load(); }, []);

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    if (!agent || !canEdit) return;

    setBusy(true);
    setMessage("");
    setErrorText("");

    const parsedTemperature = Number(temperature);
    const { error } = await supabase
      .from("agent_configs")
      .update({
        model: model.trim(),
        temperature: Number.isFinite(parsedTemperature) ? parsedTemperature : 0.2,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    if (error) setErrorText(error.message);
    else setMessage("บันทึก Model configuration แล้ว");

    setBusy(false);
    await load();
  }

  async function savePrompt() {
    if (!prompt || !canEdit || !promptText.trim()) return;

    setBusy(true);
    setMessage("");
    setErrorText("");

    const { error } = await supabase
      .from("agent_prompt_versions")
      .update({
        prompt_text: promptText.trim(),
      })
      .eq("prompt_id", prompt.id)
      .eq("version", prompt.active_version);

    if (error) {
      setErrorText(error.message);
    } else {
      setMessage("บันทึก System Prompt ปัจจุบันแล้ว");
    }

    setBusy(false);
    await load();
  }

  return (
    <div className="admin-section">
      <div className="section-heading">
        <div>
          <h2>Agent Configuration</h2>
          <p className="muted">จัดการ Model และ System Prompt ปัจจุบัน</p>
        </div>
      </div>

      {!canEdit && (
        <div className="warning-box">
          ADMIN ดูได้ แต่แก้ Agent configuration ได้เฉพาะ SUPER_ADMIN
        </div>
      )}

      {errorText && <div className="error-box">{errorText}</div>}
      {message && <div className="success-box">{message}</div>}

      <form className="admin-form" onSubmit={saveConfig}>
        <div className="field-grid">
          <label>
            Model
            <input
              disabled={!canEdit}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>

          <label>
            Temperature
            <input
              disabled={!canEdit}
              inputMode="decimal"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" disabled={!canEdit || busy}>
          บันทึก Model
        </button>
      </form>

      <div className="admin-form">
        <label>
          System Prompt ปัจจุบัน
          <textarea
            rows={18}
            disabled={!canEdit}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
        </label>

        <button
          type="button"
          disabled={!canEdit || busy || !promptText.trim()}
          onClick={() => void savePrompt()}
        >
          {busy ? "กำลังบันทึก..." : "บันทึก Prompt ปัจจุบัน"}
        </button>

        <p className="muted" style={{ marginBottom: 0 }}>
          ระบบเก็บเฉพาะ Prompt ที่ใช้งานอยู่ ไม่สร้าง Version ใหม่ทุกครั้งที่แก้ไข
        </p>
      </div>
    </div>
  );
}
