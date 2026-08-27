import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AuditLogRow } from "./types";

export default function AuditPanel() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [errorText, setErrorText] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id,user_id,action,entity_type,entity_id,details,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) setErrorText(error.message);
    else setLogs((data ?? []) as AuditLogRow[]);
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="admin-section">
      <div className="section-heading">
        <div>
          <h2>Audit Logs</h2>
          <p className="muted">200 รายการล่าสุด</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void load()}>Refresh</button>
      </div>

      {errorText && <div className="error-box">{errorText}</div>}

      <div className="admin-list">
        {logs.length === 0 ? <div className="empty-state">ยังไม่มี Audit Log</div> : logs.map((log) => (
          <div className="admin-row" key={log.id}>
            <div>
              <strong>{log.action}</strong>
              <div className="muted">{log.entity_type || "-"} {log.entity_id || ""}</div>
              <small>{new Date(log.created_at).toLocaleString()} · user {log.user_id || "system"}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
