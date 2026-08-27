import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AdminUserRow, Role } from "./types";

type Response = {
  ok?: boolean;
  users?: AdminUserRow[];
  message?: string;
  error?: string;
};

export default function UsersPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  async function load() {
    const { data, error } = await supabase.functions.invoke<Response>("admin-users", {
      body: { action: "list" },
    });

    if (error || !data?.ok) {
      setErrorText(error?.message || data?.error || "โหลดผู้ใช้ไม่สำเร็จ");
      return;
    }
    setUsers(data.users ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function action(user: AdminUserRow, actionName: "set_role" | "ban" | "unban" | "delete", role?: Role) {
    if (actionName === "delete" && !window.confirm(`ลบบัญชี ${user.email || user.id} ถาวร?`)) return;

    setBusyId(user.id);
    setMessage("");
    setErrorText("");

    const { data, error } = await supabase.functions.invoke<Response>("admin-users", {
      body: { action: actionName, user_id: user.id, role },
    });

    if (error || !data?.ok) setErrorText(error?.message || data?.error || "ดำเนินการไม่สำเร็จ");
    else setMessage(data.message || "บันทึกแล้ว");

    setBusyId(null);
    await load();
  }

  return (
    <div className="admin-section">
      <div className="section-heading">
        <div>
          <h2>Users & Access</h2>
          <p className="muted">กำหนด Role, ระงับ, เปิดใช้งาน และลบบัญชี</p>
        </div>
      </div>

      {errorText && <div className="error-box">{errorText}</div>}
      {message && <div className="success-box">{message}</div>}

      <div className="admin-list">
        {users.length === 0 ? <div className="empty-state">ไม่พบผู้ใช้</div> : users.map((user) => (
          <div className="admin-row" key={user.id}>
            <div>
              <strong>{user.email || user.full_name || user.id}</strong>
              <div className="muted">{user.full_name || "ไม่มีชื่อ"}</div>
              <small>{user.role} · {user.banned_until ? "SUSPENDED" : "ACTIVE"}</small>
            </div>
            <div className="row-actions">
              <select
                value={user.role}
                disabled={busyId !== null}
                onChange={(e) => void action(user, "set_role", e.target.value as Role)}
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              </select>

              {user.banned_until ? (
                <button className="secondary-button" type="button" disabled={busyId !== null} onClick={() => void action(user, "unban")}>เปิดใช้งาน</button>
              ) : (
                <button className="secondary-button" type="button" disabled={busyId !== null} onClick={() => void action(user, "ban")}>ระงับ</button>
              )}

              <button className="danger-button" type="button" disabled={busyId !== null} onClick={() => void action(user, "delete")}>ลบบัญชี</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
