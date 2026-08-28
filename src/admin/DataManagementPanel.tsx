import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { ingestDatasetFile } from "../lib/datasetIngestion";
import type { DatasetRow } from "./types";

type Props = { session: Session };

type ColumnRow = {
  id: string;
  column_name: string;
  data_type: string | null;
  is_nullable: boolean;
};

type FileRow = {
  id: string;
  original_filename: string;
  file_size: number | null;
  created_at: string;
  storage_path: string;
  mime_type?: string | null;
};

const ALLOWED_EXTENSIONS = new Set(["csv", "xlsx", "xls"]);

function extensionOf(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

export default function DataManagementPanel({ session }: Props) {
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progressText, setProgressText] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [selected, setSelected] = useState<DatasetRow | null>(null);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);

  async function loadDatasets() {
    setLoading(true);

    const { data, error } = await supabase
      .from("datasets")
      .select(
        "id,name,description,source_type,status,row_count,column_count,ingestion_status,ingested_row_count,ingestion_error,ingested_at,created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setErrorText(error.message);
      setDatasets([]);
    } else {
      setDatasets((data ?? []) as DatasetRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadDatasets();
  }, []);

  async function showDetails(dataset: DatasetRow) {
    setSelected(dataset);
    setErrorText("");

    const [columnResult, fileResult] = await Promise.all([
      supabase
        .from("dataset_columns")
        .select("id,column_name,data_type,is_nullable")
        .eq("dataset_id", dataset.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("uploaded_files")
        .select("id,original_filename,file_size,created_at,storage_path,mime_type")
        .eq("dataset_id", dataset.id)
        .order("created_at", { ascending: false }),
    ]);

    if (columnResult.error) setErrorText(columnResult.error.message);
    if (fileResult.error) setErrorText(fileResult.error.message);

    setColumns((columnResult.data ?? []) as ColumnRow[]);
    setFiles((fileResult.data ?? []) as FileRow[]);
  }

  async function runIngestion(datasetId: string, sourceFile: File) {
    setBusyId(datasetId);
    setProgressText("กำลังเตรียมนำเข้าข้อมูล");
    setErrorText("");

    try {
      const result = await ingestDatasetFile(
        datasetId,
        sourceFile,
        (text) => setProgressText(text),
      );

      setMessage(
        `พร้อมใช้งาน: นำเข้าข้อมูลจริง ${result.rowCount.toLocaleString()} แถว · ${result.columnCount} คอลัมน์`,
      );
      setProgressText("");
      await loadDatasets();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setProgressText("");
      await loadDatasets();
    } finally {
      setBusyId(null);
    }
  }

  async function reingestDataset(dataset: DatasetRow) {
    setBusyId(dataset.id);
    setErrorText("");
    setMessage("");
    setProgressText("กำลังดาวน์โหลดไฟล์ต้นฉบับจาก Storage");

    const { data: fileRow, error: fileError } = await supabase
      .from("uploaded_files")
      .select("original_filename,storage_path,mime_type")
      .eq("dataset_id", dataset.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single<{ original_filename: string; storage_path: string; mime_type: string | null }>();

    if (fileError || !fileRow) {
      setErrorText(fileError?.message || "ไม่พบไฟล์ต้นฉบับ");
      setProgressText("");
      setBusyId(null);
      return;
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from("datasets")
      .download(fileRow.storage_path);

    if (downloadError || !blob) {
      setErrorText(downloadError?.message || "ดาวน์โหลดไฟล์ต้นฉบับไม่สำเร็จ");
      setProgressText("");
      setBusyId(null);
      return;
    }

    const sourceFile = new File([blob], fileRow.original_filename, {
      type: fileRow.mime_type || blob.type || "application/octet-stream",
    });

    setBusyId(null);
    await runIngestion(dataset.id, sourceFile);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorText("");
    setProgressText("");

    const selectedFile = file;

    if (!selectedFile) {
      setErrorText("กรุณาเลือกไฟล์ CSV หรือ Excel");
      return;
    }

    const ext = extensionOf(selectedFile.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setErrorText("รองรับเฉพาะ .csv, .xlsx และ .xls");
      return;
    }

    setBusyId("UPLOAD");

    const cleanName = name.trim() || selectedFile.name.replace(/\.[^/.]+$/, "");

    const { data: dataset, error: createError } = await supabase
      .from("datasets")
      .insert({
        name: cleanName,
        description: description.trim() || null,
        source_type: "UPLOAD",
        status: "PROCESSING",
        ingestion_status: "PROCESSING",
        ingested_row_count: 0,
        created_by: session.user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (createError || !dataset) {
      setErrorText(createError?.message || "สร้าง Dataset ไม่สำเร็จ");
      setBusyId(null);
      return;
    }

    const storagePath = `${dataset.id}/${crypto.randomUUID()}.${ext}`;

    const { error: storageError } = await supabase.storage
      .from("datasets")
      .upload(storagePath, selectedFile, {
        upsert: false,
        contentType: selectedFile.type || undefined,
      });

    if (storageError) {
      await supabase.from("datasets").delete().eq("id", dataset.id);
      setErrorText(storageError.message);
      setBusyId(null);
      return;
    }

    const { error: metaError } = await supabase.from("uploaded_files").insert({
      dataset_id: dataset.id,
      original_filename: selectedFile.name,
      storage_path: storagePath,
      mime_type: selectedFile.type || null,
      file_size: selectedFile.size,
      uploaded_by: session.user.id,
    });

    if (metaError) {
      await supabase.storage.from("datasets").remove([storagePath]);
      await supabase.from("datasets").delete().eq("id", dataset.id);
      setErrorText(metaError.message);
      setBusyId(null);
      return;
    }

    const { error: versionError } = await supabase.from("dataset_versions").insert({
      dataset_id: dataset.id,
      version_number: 1,
      change_type: "UPLOAD",
      row_count: 0,
      notes: "Initial upload",
      created_by: session.user.id,
    });

    if (versionError) {
      await supabase.storage.from("datasets").remove([storagePath]);
      await supabase.from("datasets").delete().eq("id", dataset.id);
      setErrorText(versionError.message);
      setBusyId(null);
      return;
    }

    setName("");
    setDescription("");
    setFile(null);
    setBusyId(null);

    await loadDatasets();
    await runIngestion(dataset.id, selectedFile);
  }

  async function deleteDataset(dataset: DatasetRow) {
    if (!window.confirm(`ยืนยันลบ Dataset "${dataset.name}" และไฟล์ต้นฉบับทั้งหมด?`)) return;

    setBusyId(dataset.id);
    setErrorText("");
    setMessage("");
    setProgressText("");

    const { data: fileRows, error: filesError } = await supabase
      .from("uploaded_files")
      .select("storage_path")
      .eq("dataset_id", dataset.id);

    if (filesError) {
      setErrorText(filesError.message);
      setBusyId(null);
      return;
    }

    const paths = (fileRows ?? [])
      .map((row: { storage_path: string }) => row.storage_path)
      .filter(Boolean);

    if (paths.length) {
      const { error } = await supabase.storage.from("datasets").remove(paths);
      if (error) {
        setErrorText(error.message);
        setBusyId(null);
        return;
      }
    }

    const { error } = await supabase.from("datasets").delete().eq("id", dataset.id);

    if (error) {
      setErrorText(error.message);
      setBusyId(null);
      return;
    }

    if (selected?.id === dataset.id) {
      setSelected(null);
      setColumns([]);
      setFiles([]);
    }

    setMessage(`ลบ "${dataset.name}" แล้ว`);
    setBusyId(null);
    await loadDatasets();
  }

  return (
    <div className="admin-section">
      <div className="section-heading">
        <div>
          <h2>Data Management</h2>
          <p className="muted">
            ไฟล์ต้นฉบับเก็บใน Storage และข้อมูลทุกแถวถูกนำเข้า Postgres เพื่อให้ AI คำนวณจากข้อมูลทั้งหมด
          </p>
        </div>
      </div>

      {errorText && <div className="error-box">{errorText}</div>}
      {message && <div className="success-box">{message}</div>}
      {progressText && <div className="warning-box">{progressText}</div>}

      <form className="admin-form" onSubmit={handleUpload}>
        <div className="field-grid">
          <label>
            ชื่อ Dataset
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เว้นว่างเพื่อใช้ชื่อไฟล์"
            />
          </label>

          <label>
            คำอธิบาย
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="คำอธิบายโดยย่อ"
            />
          </label>
        </div>

        <label>
          ไฟล์
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <button type="submit" disabled={busyId !== null}>
          {busyId === "UPLOAD" ? "กำลังอัปโหลด..." : "Upload Dataset"}
        </button>
      </form>

      <div className="admin-list">
        <h3>Datasets</h3>

        {loading ? (
          <div className="empty-state">กำลังโหลด...</div>
        ) : datasets.length === 0 ? (
          <div className="empty-state">ยังไม่มี Dataset</div>
        ) : (
          datasets.map((dataset) => (
            <div className="admin-row" key={dataset.id}>
              <div>
                <strong>{dataset.name}</strong>
                <div className="muted">{dataset.description || "ไม่มีคำอธิบาย"}</div>
                <small>
                  {dataset.source_type} · {dataset.status} · {dataset.ingestion_status || "NOT_INGESTED"} ·{" "}
                  {(dataset.ingested_row_count ?? 0).toLocaleString()} rows · {dataset.column_count} columns
                </small>
                {dataset.ingestion_error && (
                  <div className="error-box" style={{ marginTop: 8 }}>
                    {dataset.ingestion_error}
                  </div>
                )}
              </div>

              <div className="row-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void showDetails(dataset)}
                >
                  รายละเอียด
                </button>

                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void reingestDataset(dataset)}
                >
                  {busyId === dataset.id
                    ? "กำลังนำเข้า..."
                    : dataset.ingestion_status === "READY"
                      ? "นำเข้าข้อมูลใหม่"
                      : "นำเข้าข้อมูลทั้งหมด"}
                </button>

                <button
                  className="danger-button"
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void deleteDataset(dataset)}
                >
                  {busyId === dataset.id ? "กำลังดำเนินการ..." : "ลบ"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {selected && (
        <div className="detail-card">
          <h3>{selected.name}</h3>
          <p className="muted">
            {(selected.ingested_row_count ?? selected.row_count).toLocaleString()} rows · {selected.column_count} columns ·{" "}
            {selected.ingestion_status || selected.status}
          </p>

          <h4>Files</h4>
          {files.length === 0 ? (
            <div className="empty-state">ไม่พบไฟล์</div>
          ) : (
            files.map((item) => (
              <div key={item.id} className="detail-line">
                <span>{item.original_filename}</span>
                <small>{item.file_size ? `${Math.round(item.file_size / 1024)} KB` : "-"}</small>
              </div>
            ))
          )}

          <h4>Columns</h4>
          {columns.length === 0 ? (
            <div className="empty-state">ยังไม่มี Column metadata</div>
          ) : (
            <div className="column-grid">
              {columns.map((column) => (
                <div key={column.id} className="column-chip">
                  <strong>{column.column_name}</strong>
                  <small>
                    {column.data_type || "text"} · {column.is_nullable ? "nullable" : "required"}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
