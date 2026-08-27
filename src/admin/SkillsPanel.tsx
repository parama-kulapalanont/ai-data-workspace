import { FormEvent, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { SkillRow } from "./types";

type Props = { session: Session; canEdit: boolean };

const EMPTY = {
  id: "",
  name: "",
  description: "",
  instructions: "",
  is_enabled: true,
};

function stripExtension(filename: string) {
  return filename.replace(/\.(md|txt)$/i, "");
}

function getMarkdownTitle(text: string) {
  const match = text.match(/^\s*#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function getDescription(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    if (clean.startsWith("#")) continue;
    if (clean.startsWith("---")) continue;
    if (clean.startsWith("```")) continue;

    return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
  }

  return "";
}

export default function SkillsPanel({ session, canEdit }: Props) {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [importedFilename, setImportedFilename] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("agent_skills")
      .select("id,name,description,instructions,is_enabled,created_at")
      .order("created_at", { ascending: true });

    if (error) setErrorText(error.message);
    else setSkills((data ?? []) as SkillRow[]);
  }

  useEffect(() => { void load(); }, []);

  function resetForm() {
    setForm(EMPTY);
    setImportedFilename("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function edit(skill: SkillRow) {
    setForm({
      id: skill.id,
      name: skill.name,
      description: skill.description ?? "",
      instructions: skill.instructions ?? "",
      is_enabled: skill.is_enabled,
    });
    setImportedFilename("");
    setMessage("");
    setErrorText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function importSkillFile(file: File | null) {
    if (!file || !canEdit) return;

    setMessage("");
    setErrorText("");

    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "md" && extension !== "txt") {
      setErrorText("รองรับเฉพาะไฟล์ .md และ .txt");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const text = await file.text();
      if (!text.trim()) {
        setErrorText("ไฟล์ว่าง ไม่พบเนื้อหา Skill");
        return;
      }

      const title = getMarkdownTitle(text) || stripExtension(file.name);
      const description = getDescription(text);

      setForm((current) => ({
        ...current,
        name: title || current.name,
        description: description || current.description,
        instructions: text,
      }));
      setImportedFilename(file.name);
      setMessage(
        currentModeLabel(form.id, file.name),
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "อ่านไฟล์ Skill ไม่สำเร็จ",
      );
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;

    const cleanName = form.name.trim();
    const cleanInstructions = form.instructions.trim();

    if (!cleanName) {
      setErrorText("กรุณาระบุชื่อ Skill");
      return;
    }

    if (!cleanInstructions) {
      setErrorText("กรุณาระบุ Instructions หรือ Import ไฟล์ .md/.txt");
      return;
    }

    setBusy(true);
    setMessage("");
    setErrorText("");

    const payload = {
      name: cleanName,
      description: form.description.trim() || null,
      instructions: cleanInstructions,
      is_enabled: form.is_enabled,
    };

    const result = form.id
      ? await supabase.from("agent_skills").update(payload).eq("id", form.id)
      : await supabase.from("agent_skills").insert({
          ...payload,
          created_by: session.user.id,
        });

    if (result.error) {
      setErrorText(result.error.message);
    } else {
      setMessage(form.id ? "แก้ไข Skill เรียบร้อยแล้ว" : "เพิ่ม Skill เรียบร้อยแล้ว");
      resetForm();
      await load();
    }

    setBusy(false);
  }

  async function toggle(skill: SkillRow) {
    if (!canEdit) return;

    setBusy(true);
    setErrorText("");
    setMessage("");

    const { error } = await supabase
      .from("agent_skills")
      .update({ is_enabled: !skill.is_enabled })
      .eq("id", skill.id);

    if (error) setErrorText(error.message);
    else setMessage(`${skill.name}: ${skill.is_enabled ? "ปิดการใช้งาน" : "เปิดใช้งาน"}แล้ว`);

    await load();
    setBusy(false);
  }

  async function remove(skill: SkillRow) {
    if (!canEdit || !window.confirm(`ลบ Skill "${skill.name}" ?\n\nการลบนี้ไม่สามารถย้อนกลับได้`)) {
      return;
    }

    setBusy(true);
    setErrorText("");
    setMessage("");

    const { error } = await supabase
      .from("agent_skills")
      .delete()
      .eq("id", skill.id);

    if (error) {
      setErrorText(error.message);
    } else {
      setMessage(`ลบ Skill "${skill.name}" แล้ว`);
      if (form.id === skill.id) resetForm();
    }

    await load();
    setBusy(false);
  }

  return (
    <div className="admin-section skills-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">AGENT CAPABILITIES</div>
          <h2>Skills</h2>
          <p className="muted">
            เพิ่ม แก้ไข เปิด/ปิด ลบ หรือ Import Skill จากไฟล์ Markdown / Text
          </p>
        </div>
        <div className="section-stat">
          <strong>{skills.length}</strong>
          <span>Skills</span>
        </div>
      </div>

      {!canEdit && (
        <div className="warning-box">แก้ Skills ได้เฉพาะ SUPER_ADMIN</div>
      )}
      {errorText && <div className="error-box">{errorText}</div>}
      {message && <div className="success-box">{message}</div>}

      <div className="skill-import-card">
        <div className="skill-import-copy">
          <strong>{form.id ? "Import ไฟล์เพื่อแก้ไข Skill นี้" : "Import Skill จากไฟล์"}</strong>
          <span>
            รองรับ <b>.md</b> และ <b>.txt</b> — ระบบจะนำเนื้อหาไฟล์เข้า Instructions เพื่อให้ตรวจแก้ก่อนบันทึก
          </span>
        </div>

        <label className={`file-upload-control ${!canEdit ? "disabled" : ""}`}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            disabled={!canEdit || busy}
            onChange={(event) => void importSkillFile(event.target.files?.[0] ?? null)}
          />
          <span>{importedFilename ? "เปลี่ยนไฟล์" : "เลือกไฟล์ .md / .txt"}</span>
        </label>

        {importedFilename && (
          <div className="imported-file-pill">
            <span>ไฟล์ที่นำเข้า</span>
            <strong>{importedFilename}</strong>
          </div>
        )}
      </div>

      <form className="admin-form skill-editor-card" onSubmit={save}>
        <div className="editor-title-row">
          <div>
            <h3>{form.id ? "แก้ไข Skill" : "เพิ่ม Skill"}</h3>
            <p className="muted">
              {form.id
                ? "แก้ข้อมูลเดิม หรือ Import ไฟล์ใหม่เพื่อแทน Instructions"
                : "สร้างด้วยการกรอกเอง หรือ Import จากไฟล์ด้านบน"}
            </p>
          </div>
          {form.id && <span className="edit-mode-pill">EDIT MODE</span>}
        </div>

        <label>
          ชื่อ Skill
          <input
            required
            disabled={!canEdit}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="เช่น Data Profiling"
          />
        </label>

        <label>
          คำอธิบาย
          <input
            disabled={!canEdit}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="อธิบายหน้าที่ของ Skill แบบสั้น ๆ"
          />
        </label>

        <label>
          Instructions
          <textarea
            rows={14}
            disabled={!canEdit}
            value={form.instructions}
            onChange={(event) => setForm({ ...form, instructions: event.target.value })}
            placeholder="วาง Markdown/Text หรือ Import ไฟล์ .md/.txt"
          />
        </label>

        <div className="skill-editor-footer">
          <label className="check-line skill-enabled-control">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={form.is_enabled}
              onChange={(event) => setForm({ ...form, is_enabled: event.target.checked })}
            />
            <span>
              <strong>Enabled</strong>
              <small>ให้ AI Data Agent สามารถใช้ Skill นี้ได้</small>
            </span>
          </label>

          <div className="row-actions">
            {form.id && (
              <button className="secondary-button" type="button" onClick={resetForm}>
                ยกเลิกการแก้ไข
              </button>
            )}
            <button type="submit" disabled={!canEdit || busy}>
              {busy ? "กำลังบันทึก..." : form.id ? "บันทึกการแก้ไข" : "เพิ่ม Skill"}
            </button>
          </div>
        </div>
      </form>

      <div className="admin-list skill-list">
        <div className="list-heading-row">
          <div>
            <h3>Skill Library</h3>
            <p className="muted">รายการ Skills ที่บันทึกอยู่ในระบบ</p>
          </div>
          <span className="list-count">{skills.length}</span>
        </div>

        {skills.length === 0 ? (
          <div className="empty-state">ยังไม่มี Skill</div>
        ) : (
          skills.map((skill) => (
            <div className="admin-row skill-row" key={skill.id}>
              <div className="skill-row-main">
                <div className="skill-row-title">
                  <strong>{skill.name}</strong>
                  <span className={`status-pill ${skill.is_enabled ? "enabled" : "disabled"}`}>
                    {skill.is_enabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <div className="muted">{skill.description || "ไม่มีคำอธิบาย"}</div>
                <small className="skill-preview">
                  {skill.instructions
                    ? skill.instructions.replace(/\s+/g, " ").slice(0, 180)
                    : "ไม่มี Instructions"}
                  {skill.instructions && skill.instructions.length > 180 ? "..." : ""}
                </small>
              </div>

              <div className="row-actions skill-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => edit(skill)}
                >
                  แก้ไข
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => void toggle(skill)}
                >
                  {skill.is_enabled ? "ปิด" : "เปิด"}
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => void remove(skill)}
                >
                  ลบ
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function currentModeLabel(skillId: string, filename: string) {
  return skillId
    ? `นำเข้า ${filename} เพื่อแก้ไข Skill แล้ว — ตรวจสอบก่อนกดบันทึกการแก้ไข`
    : `นำเข้า ${filename} แล้ว — ตรวจสอบก่อนกดเพิ่ม Skill`;
}
