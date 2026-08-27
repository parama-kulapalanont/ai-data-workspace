import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import DataManagementPanel from "../admin/DataManagementPanel";
import ConnectionsPanel from "../admin/ConnectionsPanel";
import AgentConfigPanel from "../admin/AgentConfigPanel";
import SkillsPanel from "../admin/SkillsPanel";
import UsersPanel from "../admin/UsersPanel";
import AuditPanel from "../admin/AuditPanel";
import type { Role } from "../admin/types";

type Props = {
  session: Session;
  onBack: () => void;
};

type Tab = "data" | "connections" | "agent" | "skills" | "users" | "audit";

const NAV: Array<{ id: Tab; title: string; description: string }> = [
  { id: "data", title: "Data Management", description: "Upload / Process / Delete" },
  { id: "connections", title: "Connections", description: "API / Database / Sheet" },
  { id: "agent", title: "Agent Configuration", description: "Model / System Prompt" },
  { id: "skills", title: "Skills", description: "Add / Edit / Enable / Delete" },
  { id: "users", title: "Users & Access", description: "Role / Suspend / Delete" },
  { id: "audit", title: "Audit Logs", description: "Admin activity" },
];

export default function AdminPage({ session, onBack }: Props) {
  const [role, setRole] = useState<Role | "LOADING" | "UNKNOWN">("LOADING");
  const [tab, setTab] = useState<Tab>("data");

  useEffect(() => {
    async function loadRole() {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single<{ role: Role }>();

      setRole(error || !data ? "UNKNOWN" : data.role);
    }
    void loadRole();
  }, [session.user.id]);

  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isSuperAdmin = role === "SUPER_ADMIN";

  if (role === "LOADING") {
    return <main className="center-screen"><div className="status-card">กำลังตรวจสอบสิทธิ์...</div></main>;
  }

  if (!isAdmin) {
    return (
      <main className="center-screen">
        <div className="status-card">
          <h2>ไม่มีสิทธิ์เข้าถึง Admin Console</h2>
          <button type="button" onClick={onBack}>กลับ Workspace</button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">AI DATA WORKSPACE</div>
          <h1>Admin Console</h1>
          <p className="muted">ระบบหลังบ้านสำหรับ Data, Connection, Agent และ Access Control</p>
        </div>
        <div className="user-area">
          <div>
            <div>{session.user.email}</div>
            <small>Role: {role}</small>
          </div>
          <button className="secondary-button" type="button" onClick={onBack}>กลับ Workspace</button>
        </div>
      </header>

      <section className="admin-layout">
        <aside className="admin-nav">
          <h2>Administration</h2>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-nav-item ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </aside>

        <section className="admin-content">
          {tab === "data" && <DataManagementPanel session={session} />}
          {tab === "connections" && <ConnectionsPanel />}
          {tab === "agent" && <AgentConfigPanel session={session} canEdit={isSuperAdmin} />}
          {tab === "skills" && <SkillsPanel session={session} canEdit={isSuperAdmin} />}
          {tab === "users" && (isSuperAdmin ? <UsersPanel /> : <div className="warning-box">Users & Access ใช้ได้เฉพาะ SUPER_ADMIN</div>)}
          {tab === "audit" && <AuditPanel />}
        </section>
      </section>
    </main>
  );
}
