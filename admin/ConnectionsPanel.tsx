import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { DataSourceRow } from "./types";

type ApiResponse = {
  ok?: boolean;
  data_source?: DataSourceRow;
  sources?: DataSourceRow[];
  message?: string;
  error?: string;
};

const EMPTY = {
  id: "",
  name: "",
  source_type: "API" as DataSourceRow["source_type"],
  description: "",
  endpoint: "",
  host: "",
  port: "",
  database_name: "",
  secret: "",
};

export default function ConnectionsPanel() {
  const [sources, setSources] = useState<DataSourceRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  async function load() {
    const { data, error } = await supabase.functions.invoke<ApiResponse>("admin-connections", {
      body: { action: "list" },
    });
    if (error || !data?.ok) {
      setErrorText(error?.message || data?.error || "โหลด Connections ไม่สำเร็จ");
      return;
    }
    setSources(data.sources ?? []);
  }

  useEffect(() => { void load(); }, []);

  function edit(source: DataSourceRow) {
    setForm({
      id: source.id,
      name: source.name,
      source_type: source.source_type,
      description: source.description ?? "",
      endpoint: source.endpoint ?? "",
      host: source.host ?? "",
      port: source.port ? String(source.port) : "",
      database_name: source.database_name ?? "",
      secret: "",
    });
    setMessage("");
    setErrorText("");
  }

  async function submit(action: "save" | "test", event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setMessage("");
    setErrorText("");

    const { data, error } = await supabase.functions.invoke<ApiResponse>("admin-connections", {
      body: {
        action,
        connection: {
          id: form.id || null,
          name: form.name.trim(),
          source_type: form.source_type,
          description: form.description.trim() || null,
          endpoint: form.endpoint.trim() || null,
          host: form.host.trim() || null,
          port: form.port ? Number(form.port) : null,
          database_name: form.database_name.trim() || null,
          secret: form.secret || null,
        },
      },
    });

    if (error || !data?.ok) {
      setErrorText(error?.message || data?.error || "ดำเนินการไม่สำเร็จ");
      setBusy(false);
      return;
    }

    setMessage(data.message || (action === "test" ? "ทดสอบสำเร็จ" : "บันทึกแล้ว"));
    if (action === "save") {
      setForm(EMPTY);
      await load();
    }
    setBusy(false);
  }

  async function remove(source: DataSourceRow) {
    if (!window.confirm(`ลบ Connection "${source.name}" ?`)) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<ApiResponse>("admin-connections", {
      body: { action: "delete", connection: { id: source.id } },
    });
    if (error || !data?.ok) {
      setErrorText(error?.message || data?.error || "ลบไม่สำเร็จ");
    } else {
      setMessage("ลบ Connection แล้ว");
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="admin-section">
      <div className="section-heading">
        <div>
          <h2>Connections</h2>
          <p className="muted">REST API, PostgreSQL Database, Google Sheet และแหล่งข้อมูลอื่น</p>
        </div>
      </div>

      {errorText && <div className="error-box">{errorText}</div>}
      {message && <div className="success-box">{message}</div>}

      <form className="admin-form" onSubmit={(e) => void submit("save", e)}>
        <div className="field-grid">
          <label>
            ชื่อ Connection
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            ประเภท
            <select value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value as DataSourceRow["source_type"] })}>
              <option value="API">REST API</option>
              <option value="DATABASE">PostgreSQL Database</option>
              <option value="GOOGLE_SHEET">Google Sheet</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
        </div>

        <label>
          คำอธิบาย
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>

        {(form.source_type === "API" || form.source_type === "GOOGLE_SHEET") && (
          <label>
            Endpoint / URL
            <input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://..." />
          </label>
        )}

        {form.source_type === "DATABASE" && (
          <div className="field-grid">
            <label>
              Host
              <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
            </label>
            <label>
              Port
              <input inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="5432" />
            </label>
            <label>
              Database
              <input value={form.database_name} onChange={(e) => setForm({ ...form, database_name: e.target.value })} />
            </label>
          </div>
        )}

        <label>
          Secret / Token / Connection String
          <input
            type="password"
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            placeholder={form.id ? "เว้นว่างเพื่อใช้ Secret เดิม" : "ข้อมูลนี้จะถูกเก็บใน Supabase Vault"}
          />
        </label>

        <div className="row-actions">
          <button type="submit" disabled={busy}>{form.id ? "บันทึกการแก้ไข" : "เพิ่ม Connection"}</button>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void submit("test")}>Test Connection</button>
          {form.id && (
            <button className="secondary-button" type="button" onClick={() => setForm(EMPTY)}>ยกเลิก</button>
          )}
        </div>
      </form>

      <div className="admin-list">
        <h3>Saved Connections</h3>
        {sources.length === 0 ? <div className="empty-state">ยังไม่มี Connection</div> : sources.map((source) => (
          <div className="admin-row" key={source.id}>
            <div>
              <strong>{source.name}</strong>
              <div className="muted">{source.source_type} · {source.status}</div>
              <small>{source.endpoint || source.host || "ไม่ระบุปลายทาง"}</small>
            </div>
            <div className="row-actions">
              <button className="secondary-button" type="button" onClick={() => edit(source)}>แก้ไข</button>
              <button className="danger-button" type="button" disabled={busy} onClick={() => void remove(source)}>ลบ</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
