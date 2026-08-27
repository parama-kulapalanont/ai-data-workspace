import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import LoginPage from "./pages/LoginPage";
import WorkspacePage from "./pages/WorkspacePage";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

    return () => {
      active = false;
      listener.subscription.unsubscribe();
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

  return <WorkspacePage session={session} />;
}
