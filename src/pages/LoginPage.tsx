import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText("");
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorText(error.message);
    }

    setSubmitting(false);
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="eyebrow">AI DATA WORKSPACE</div>
        <h1>เข้าสู่ระบบ</h1>
        <p className="muted">
          ใช้บัญชีที่ได้รับสิทธิ์ในระบบเพื่อเข้าถึง AI Data Agent
        </p>

        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            <span>อีเมล</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <label>
            <span>รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>

          {errorText && (
            <div className="error-box">{errorText}</div>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </section>

      <aside className="login-aside">
        <div>
          <div className="eyebrow">SECURE DATA + AI</div>
          <h2>วิเคราะห์ข้อมูลผ่าน Agent เดียว</h2>
          <p>
            ระบบนี้ใช้ Supabase Auth สำหรับการเข้าสู่ระบบ,
            RLS สำหรับควบคุมสิทธิ์ และเรียก OpenAI ผ่าน
            Supabase Edge Function เท่านั้น
          </p>
        </div>
      </aside>
    </main>
  );
}
