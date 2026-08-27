import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { AgentConfigRow, AgentPromptRow, AgentPromptVersionRow } from "./types";

type Props = {
  session: Session;
  canEdit: boolean;
};

export default function AgentConfigPanel({ session, canEdit }: Props) {
  const [agent, setAgent] = useState<AgentConfigRow | null>(null);
  const [prompt, setPrompt] = useState<AgentPromptRow | null>(null);
  const [versions, setVersions] = useState<AgentPromptVersionRow[]>([]);
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

    const { data: versionRows, error: versionError } = await supabase
      .from("agent_prompt_versions")
      .select("id,prompt_id,version,prompt_text,created_at")
      .eq("prompt_id", promptRow.id)
      .order("version", { ascending: false });

    if (versionError) {
      setErrorText(versionError.message);
      return;
    }

    const list = (versionRows ?? []) as AgentPromptVersionRow[];
    setVersions(list);
    const active = list.find((item) => item.version === promptRow.active_version) ?? list[0];
    setPromptText(active?.prompt_text ?? "");
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

    const nextVersion = Math.max(0, ...versions.map((item) => item.version)) + 1;
    const { error: insertError } = await supabase
      .from("agent_prompt_versions")
      .insert({
        prompt_id: prompt.id,
        version: nextVersion,
        prompt_text: promptText.trim(),
        created_by: session.user.id,
      });

    if (insertError) {
      setErrorText(insertError.message);
      setBusy(false);
      return;
    }

    const { error: activateError } = await supabase
      .from("agent_prompts")
      .update({
        active_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prompt.id);

    if (activateError) setErrorText(activateError.message);
    else setMessage(`สร้างและเปิดใช้ System Prompt version ${nextVersion} แล้ว`);

    setBusy(false);
    await load();
  }

  async function activateVersion(version: number) {
    if (!prompt || !canEdit) return;
    setBusy(true);
    const { error } = await supabase
      .from("agent_prompts")
      .update({ active_version: version, updated_at: new Date().toISOString() })
      .eq("id", prompt.id);

    if (error) setErrorText(error.message);
    else setMessage(`เปิดใช้ Prompt version ${version} แล้ว`);

    setBusy(false);
    await load();
  }

  return (
    <div className="admin-section">
      <div className="section-heading">
        <div>
          <h2>Agent Configuration</h2>
          <p className="muted">จัดการ Model และ System Prompt แบบมี Version</p>
        </div>
      </div>

      {!canEdit && <div className="warning-box">ADMIN ดูได้ แต่แก้ Agent configuration ได้เฉพาะ SUPER_ADMIN</div>}
      {errorText && <div className="error-box">{errorText}</div>}
      {message && <div className="success-box">{message}</div>}

      <form className="admin-form" onSubmit={saveConfig}>
        <div className="field-grid">
          <label>
            Model
            <input disabled={!canEdit} value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
          <label>
            Temperature
            <input disabled={!canEdit} inputMode="decimal" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={!canEdit || busy}>บันทึก Model</button>
      </form>

      <div className="admin-form">
        <label>
          System Prompt
          <textarea
            rows={18}
            disabled={!canEdit}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
        </label>
        <button type="button" disabled={!canEdit || busy} onClick={() => void savePrompt()}>
          บันทึกเป็น Version ใหม่และเปิดใช้
        </button>
      </div>

      <div className="admin-list">
        <h3>Prompt Versions</h3>
        {versions.map((item) => (
          <div className="admin-row" key={item.id}>
            <div>
              <strong>Version {item.version}</strong>
              <small>{item.version === prompt?.active_version ? "ACTIVE" : new Date(item.created_at).toLocaleString()}</small>
            </div>
            {item.version !== prompt?.active_version && (
              <button className="secondary-button" type="button" disabled={!canEdit || busy} onClick={() => void activateVersion(item.version)}>
                เปิดใช้ Version นี้
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
