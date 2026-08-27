import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Props = {
  session: Session;
  onBack: () => void;
};

type RoleRow = {
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
};

type DatasetRow = {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  status: string;
  row_count: number;
  column_count: number;
};

const ALLOWED_EXTENSIONS = new Set(["csv", "xlsx", "xls"]);

function getExtension(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

export default function AdminPage({ session, onBack }: Props) {
  const [role, setRole] = useState<RoleRow["role"] | "UNKNOWN" | "LOADING">(
    "LOADING",
  );
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [datasetsError, setDatasetsError] = useState("");

  const [datasetName, setDatasetName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

  async function loadDatasets() {
    setDatasetsLoading(true);
    setDatasetsError("");

    const { data, error } = await supabase
      .from("datasets")
      .select(
        "id, name, description, source_type, status, row_count, column_count",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setDatasets([]);
      setDatasetsError(error.message);
      setDatasetsLoading(false);
      return;
    }

    setDatasets((data ?? []) as DatasetRow[]);
    setDatasetsLoading(false);
  }

  useEffect(() => {
    async function initializeAdmin() {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single<RoleRow>();

      if (error || !data) {
        setRole("UNKNOWN");
        setDatasetsLoading(false);
        return;
      }

      setRole(data.role);

      if (data.role === "ADMIN" || data.role === "SUPER_ADMIN") {
        await loadDatasets();
      } else {
        setDatasetsLoading(false);
      }
    }

    void initializeAdmin();
  }, [session.user.id]);

  async function rollbackUpload(datasetId: string, storagePath?: string) {
    if (storagePath) {
      await supabase.storage.from("datasets").remove([storagePath]);
    }

    await supabase
      .from("datasets")
      .delete()
      .eq("id", datasetId);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdmin || uploading) return;

    setUploadError("");
    setUploadSuccess("");

    if (!file) {
      setUploadError("กรุณาเลือกไฟล์ CSV หรือ Excel");
      return;
    }

    const extension = getExtension(file.name);

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      setUploadError("รองรับเฉพาะไฟล์ .csv, .xlsx และ .xls");
      return;
    }

    const cleanName =
      datasetName.trim() || file.name.replace(/\.[^/.]+$/, "");

    setUploading(true);

    const { data: dataset, error: datasetError } = await supabase
      .from("datasets")
      .insert({
        name: cleanName,
        description: description.trim() || null,
        source_type: "UPLOAD",
        status: "PROCESSING",
        created_by: session.user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (datasetError || !dataset) {
      setUploadError(datasetError?.message || "ไม่สามารถสร้าง Dataset ได้");
      setUploading(false);
      return;
    }

    const storagePath =
      `${dataset.id}/${crypto.randomUUID()}.${extension}`;

    const { error: storageError } = await supabase.storage
      .from("datasets")
      .upload(storagePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (storageError) {
      await rollbackUpload(dataset.id);
      setUploadError(storageError.message);
      setUploading(false);
      return;
    }

    const { error: fileMetaError } = await supabase
      .from("uploaded_files")
      .insert({
        dataset_id: dataset.id,
        original_filename: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        file_size: file.size,
        uploaded_by: session.user.id,
      });

    if (fileMetaError) {
      await rollbackUpload(dataset.id, storagePath);
      setUploadError(fileMetaError.message);
      setUploading(false);
      return;
    }

    const { error: versionError } = await supabase
      .from("dataset_versions")
      .insert({
        dataset_id: dataset.id,
        version_number: 1,
        change_type: "UPLOAD",
        row_count: 0,
        notes: "Initial upload",
        created_by: session.user.id,
      });

    if (versionError) {
      await rollbackUpload(dataset.id, storagePath);
      setUploadError(versionError.message);
      setUploading(false);
      return;
    }

    setDatasetName("");
    setDescription("");
    setFile(null);
    setUploadSuccess(
      "อัปโหลดสำเร็จ Dataset อยู่ในสถานะ PROCESSING รอขั้นตอนอ่านโครงสร้างข้อมูล",
    );
    setUploading(false);
    await loadDatasets();
  }

  if (role === "LOADING") {
    return (
      <main className="center-screen">
        <div className="status-card">กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="center-screen">
        <div className="status-card">
          <h2>ไม่มีสิทธิ์เข้าถึง Admin Console</h2>
          <p className="muted">
            หน้านี้อนุญาตเฉพาะ ADMIN และ SUPER_ADMIN
          </p>
          <button type="button" onClick={onBack}>
            กลับ Workspace
          </button>
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
          <p className="muted">
            จัดการข้อมูล การเชื่อมต่อ Agent และสิทธิ์การใช้งาน
          </p>
        </div>

        <div className="user-area">
          <div>
            <div>{session.user.email}</div>
            <small>Role: {role}</small>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={onBack}
          >
            กลับ Workspace
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="sidebar-card">
          <h2>Administration</h2>

          <div className="admin-note">
            <strong>Data Management</strong>
            <span>Upload และตรวจสอบ Dataset</span>
          </div>

          <div className="admin-note">
            <strong>Connections</strong>
            <span>REST API / Database / Google Sheet / Other</span>
          </div>

          <div className="admin-note">
            <strong>Agent Configuration</strong>
            <span>Model / System Prompt / Skills</span>
          </div>

          <div className="admin-note">
            <strong>Users & Access</strong>
            <span>Role และสิทธิ์ผู้ใช้งาน</span>
          </div>

          <div className="admin-note">
            <strong>Audit Logs</strong>
            <span>ประวัติการดำเนินการของระบบ</span>
          </div>
        </aside>

        <section className="chat-card">
          <div className="chat-header">
            <div>
              <h2>Data Management</h2>
              <p className="muted">
                เพิ่ม Dataset ใหม่เข้าสู่ Private Storage และลงทะเบียน Metadata
              </p>
            </div>
          </div>

          <div className="answer-area">
            <form className="form-stack" onSubmit={handleUpload}>
              <label>
                ชื่อ Dataset
                <input
                  value={datasetName}
                  onChange={(event) => setDatasetName(event.target.value)}
                  placeholder="เว้นว่างได้ ระบบจะใช้ชื่อไฟล์"
                />
              </label>

              <label>
                คำอธิบาย
                <textarea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="อธิบายชุดข้อมูลโดยย่อ"
                />
              </label>

              <label>
                ไฟล์ข้อมูล
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                  }}
                />
              </label>

              {uploadError && (
                <div className="error-box">{uploadError}</div>
              )}

              {uploadSuccess && (
                <div className="empty-state">{uploadSuccess}</div>
              )}

              <button type="submit" disabled={uploading}>
                {uploading ? "กำลังอัปโหลด..." : "Upload Dataset"}
              </button>
            </form>

            <div style={{ marginTop: 28 }}>
              <h2>Datasets</h2>

              {datasetsLoading ? (
                <div className="empty-state">กำลังโหลด Dataset...</div>
              ) : datasetsError ? (
                <div className="error-box">{datasetsError}</div>
              ) : datasets.length === 0 ? (
                <div className="empty-state">ยังไม่มี Dataset ในระบบ</div>
              ) : (
                datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className="empty-state"
                    style={{ marginBottom: 12 }}
                  >
                    <strong>{dataset.name}</strong>
                    <div className="muted">
                      {dataset.description || "ไม่มีคำอธิบาย"}
                    </div>
                    <small>
                      {dataset.source_type} · {dataset.status} · {dataset.row_count} rows · {dataset.column_count} columns
                    </small>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
