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

const NAV: Array<{
  id: Tab;
  title: string;
  thaiTitle: string;
  description: string;
}> = [
  { id: "data", title: "Data Management", thaiTitle: "จัดการข้อมูล", description: "Upload · Process · Delete" },
  { id: "connections", title: "Connections", thaiTitle: "เชื่อมต่อแหล่งข้อมูล", description: "API · Database · Sheet" },
  { id: "agent", title: "Agent Configuration", thaiTitle: "ตั้งค่า AI Agent", description: "Model · System Prompt" },
  { id: "skills", title: "Skills", thaiTitle: "ความสามารถของ Agent", description: "Import · Add · Edit · Delete" },
  { id: "users", title: "Users & Access", thaiTitle: "ผู้ใช้และสิทธิ์", description: "Role · Suspend · Delete" },
  { id: "audit", title: "Audit Logs", thaiTitle: "ประวัติการใช้งาน", description: "Admin activity" },
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
  const activeNav = NAV.find((item) => item.id === tab) ?? NAV[0];

  if (role === "LOADING") {
    return (
      <main className="center-screen">
        <div className="status-card">กำลังตรวจสอบสิทธิ์...</div>
      </main>
    );
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
      <header className="app-header admin-header">
        <div>
          <div className="eyebrow">AI DATA WORKSPACE · ADMINISTRATION</div>
          <h1>Admin Console</h1>
          <p className="muted admin-header-copy">
            จัดการข้อมูล การเชื่อมต่อ Agent Skills ผู้ใช้งาน และประวัติการดำเนินงานจากจุดเดียว
          </p>
        </div>

        <div className="user-area admin-user-area">
          <div className="admin-user-badge">
            <div>{session.user.email}</div>
            <small>{role}</small>
          </div>
          <button className="secondary-button" type="button" onClick={onBack}>
            กลับ Workspace
          </button>
        </div>
      </header>

      <section className="workspace-grid admin-workspace-grid">
        <aside className="sidebar-card admin-sidebar">
          <div className="admin-sidebar-heading">
            <div>
              <div className="eyebrow">ADMIN MENU</div>
              <h2>Administration</h2>
            </div>
            <span className="role-pill">{role}</span>
          </div>

          <nav className="admin-menu-list" aria-label="Admin menu">
            {NAV.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`admin-menu-card ${tab === item.id ? "active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <span className="admin-menu-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="admin-menu-copy">
                  <strong>{item.thaiTitle}</strong>
                  <span>{item.title}</span>
                  <small>{item.description}</small>
                </span>
                <span className="admin-menu-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="chat-card admin-main-card">
          <div className="admin-current-section">
            <div>
              <div className="eyebrow">CURRENT SECTION</div>
              <strong>{activeNav.thaiTitle}</strong>
              <span>{activeNav.title}</span>
            </div>
          </div>

          <div className="answer-area admin-panel-area">
            {tab === "data" && <DataManagementPanel session={session} />}
            {tab === "connections" && <ConnectionsPanel />}
            {tab === "agent" && <AgentConfigPanel session={session} canEdit={isSuperAdmin} />}
            {tab === "skills" && <SkillsPanel session={session} canEdit={isSuperAdmin} />}
            {tab === "users" && (
              isSuperAdmin
                ? <UsersPanel />
                : <div className="warning-box">Users & Access ใช้ได้เฉพาะ SUPER_ADMIN</div>
            )}
            {tab === "audit" && <AuditPanel />}
          </div>
        </section>
      </section>
    </main>
  );
}
