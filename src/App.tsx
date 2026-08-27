import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import LoginPage from "./pages/LoginPage";
import WorkspacePage from "./pages/WorkspacePage";
import AdminPage from "./pages/AdminPage";

type AppView = "workspace" | "admin";

function getViewFromHash(): AppView {
  return window.location.hash === "#admin" ? "admin" : "workspace";
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>(getViewFromHash);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setLoading(false);
      },
    );

    const handleHashChange = () => {
      setView(getViewFromHash());
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  if (loading) {
    return (
      <main className="center-screen">
        <div className="status-card">กำลังตรวจสอบสถานะการเข้าสู่ระบบ...</div>
      </main>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  if (view === "admin") {
    return (
      <AdminPage
        session={session}
        onBack={() => {
          window.location.hash = "";
        }}
      />
    );
  }

  return (
    <WorkspacePage
      session={session}
      onOpenAdmin={() => {
        window.location.hash = "admin";
      }}
    />
  );
}
