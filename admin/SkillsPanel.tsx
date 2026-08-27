import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { SkillRow } from "./types";

type Props = { session: Session; canEdit: boolean };

const EMPTY = { id: "", name: "", description: "", instructions: "", is_enabled: true };

export default function SkillsPanel({ session, canEdit }: Props) {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("agent_skills")
      .select("id,name,description,instructions,is_enabled,created_at")
      .order("created_at", { ascending: true });
    if (error) setErrorText(error.message);
    else setSkills((data ?? []) as SkillRow[]);
  }

  useEffect(() => { void load(); }, []);

  function edit(skill: SkillRow) {
    setForm({
      id: skill.id,
      name: skill.name,
      description: skill.description ?? "",
      instructions: skill.instructions ?? "",
      is_enabled: skill.is_enabled,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setMessage("");
    setErrorText("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      instructions: form.instructions.trim() || null,
      is_enabled: form.is_enabled,
    };

    const result = form.id
      ? await supabase.from("agent_skills").update(payload).eq("id", form.id)
      : await supabase.from("agent_skills").insert({ ...payload, created_by: session.user.id });

    if (result.error) setErrorText(result.error.message);
    else {
      setMessage(form.id ? "แก้ไข Skill แล้ว" : "เพิ่ม Skill แล้ว");
      setForm(EMPTY);
      await load();
    }
    setBusy(false);
  }

  async function toggle(skill: SkillRow) {
    if (!canEdit) return;
    setBusy(true);
    const { error } = await supabase
      .from("agent_skills")
      .update({ is_enabled: !skill.is_enabled })
      .eq("id", skill.id);

    if (error) setErrorText(error.message);
    await load();
    setBusy(false);
  }

  async function remove(skill: SkillRow) {
    if (!canEdit || !window.confirm(`ลบ Skill "${skill.name}" ?`)) return;
    setBusy(true);
    const { error } = await supabase.from("agent_skills").delete().eq("id", skill.id);
    if (error) setErrorText(error.message);
    else setMessage("ลบ Skill แล้ว");
    await load();
    setBusy(false);
  }

  return (
    <div className="admin-section">
      <div className="section-heading">
        <div>
          <h2>Skills</h2>
          <p className="muted">เพิ่ม แก้ไข เปิด/ปิด และลบความสามารถของ AI Data Agent</p>
        </div>
      </div>

      {!canEdit && <div className="warning-box">แก้ Skills ได้เฉพาะ SUPER_ADMIN</div>}
      {errorText && <div className="error-box">{errorText}</div>}
      {message && <div className="success-box">{message}</div>}

      <form className="admin-form" onSubmit={save}>
        <label>
          ชื่อ Skill
          <input required disabled={!canEdit} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          คำอธิบาย
          <input disabled={!canEdit} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label>
          Instructions
          <textarea rows={8} disabled={!canEdit} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </label>
        <label className="check-line">
          <input type="checkbox" disabled={!canEdit} checked={form.is_enabled} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} />
          Enabled
        </label>
        <div className="row-actions">
          <button type="submit" disabled={!canEdit || busy}>{form.id ? "บันทึกการแก้ไข" : "เพิ่ม Skill"}</button>
          {form.id && <button className="secondary-button" type="button" onClick={() => setForm(EMPTY)}>ยกเลิก</button>}
        </div>
      </form>

      <div className="admin-list">
        {skills.length === 0 ? <div className="empty-state">ยังไม่มี Skill</div> : skills.map((skill) => (
          <div className="admin-row" key={skill.id}>
            <div>
              <strong>{skill.name}</strong>
              <div className="muted">{skill.description || "ไม่มีคำอธิบาย"}</div>
              <small>{skill.is_enabled ? "ENABLED" : "DISABLED"}</small>
            </div>
            <div className="row-actions">
              <button className="secondary-button" type="button" disabled={!canEdit || busy} onClick={() => edit(skill)}>แก้ไข</button>
              <button className="secondary-button" type="button" disabled={!canEdit || busy} onClick={() => void toggle(skill)}>
                {skill.is_enabled ? "ปิด" : "เปิด"}
              </button>
              <button className="danger-button" type="button" disabled={!canEdit || busy} onClick={() => void remove(skill)}>ลบ</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
