import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

const BATCH_SIZE = 750;
const SAMPLE_SIZE = 300;

type ProgressCallback = (message: string, percent: number | null) => void;

type IngestResult = {
  rowCount: number;
  columnCount: number;
};

type ColumnDefinition = {
  name: string;
  type: "text" | "number" | "boolean" | "date";
  nullable: boolean;
};

function extensionOf(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

function makeUniqueHeaders(values: unknown[]) {
  const used = new Map<string, number>();

  return values.map((value, index) => {
    const raw = String(value ?? "").trim().replace(/^\uFEFF/, "");
    const base = raw || `column_${index + 1}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}_${seen + 1}`;
  });
}

function isBlank(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeCell(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  return String(value).trim();
}

function isBlankRow(values: unknown[]) {
  return values.every(isBlank);
}

function rowToObject(headers: string[], values: unknown[]) {
  const row: Record<string, unknown> = {};
  for (let index = 0; index < headers.length; index += 1) {
    row[headers[index]] = normalizeCell(values[index]);
  }
  return row;
}

function inferColumnType(values: unknown[]): ColumnDefinition["type"] {
  const nonBlank = values.filter((value) => !isBlank(value));
  if (!nonBlank.length) return "text";

  const booleanValues = nonBlank.every((value) => {
    if (typeof value === "boolean") return true;
    return /^(true|false)$/i.test(String(value).trim());
  });
  if (booleanValues) return "boolean";

  const numericValues = nonBlank.every((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return true;
    const normalized = String(value).trim().replace(/,/g, "");
    return /^-?(?:\d+|\d*\.\d+)$/.test(normalized);
  });
  if (numericValues) return "number";

  const dateValues = nonBlank.every((value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
    const text = String(value).trim();
    if (!/^\d{4}-\d{1,2}-\d{1,2}(?:[T\s].*)?$/.test(text)) return false;
    return !Number.isNaN(Date.parse(text));
  });
  if (dateValues) return "date";

  return "text";
}

function buildColumns(headers: string[], samples: Record<string, unknown>[]) {
  return headers.map<ColumnDefinition>((header) => {
    const values = samples.map((row) => row[header]);
    return {
      name: header,
      type: inferColumnType(values),
      nullable: values.some(isBlank),
    };
  });
}

async function resetDataset(datasetId: string) {
  const { error } = await supabase.rpc("reset_dataset_ingestion", {
    p_dataset_id: datasetId,
  });
  if (error) throw error;
}

async function insertBatch(
  datasetId: string,
  startRow: number,
  rows: Record<string, unknown>[],
) {
  if (!rows.length) return;

  const { error } = await supabase.rpc("ingest_dataset_batch", {
    p_dataset_id: datasetId,
    p_start_row: startRow,
    p_rows: rows,
  });
  if (error) throw error;
}

async function finalizeDataset(
  datasetId: string,
  rowCount: number,
  columns: ColumnDefinition[],
) {
  const { error } = await supabase.rpc("finalize_dataset_ingestion", {
    p_dataset_id: datasetId,
    p_row_count: rowCount,
    p_columns: columns,
  });
  if (error) throw error;
}

async function markFailed(datasetId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await supabase
    .from("datasets")
    .update({
      status: "ERROR",
      ingestion_status: "ERROR",
      ingestion_error: message.slice(0, 2000),
    })
    .eq("id", datasetId);
}

async function ingestCsv(
  datasetId: string,
  file: File,
  onProgress?: ProgressCallback,
): Promise<IngestResult> {
  await resetDataset(datasetId);

  return await new Promise<IngestResult>((resolve, reject) => {
    let headers: string[] | null = null;
    let rowCount = 0;
    let nextRowNumber = 1;
    let failed = false;
    const samples: Record<string, unknown>[] = [];

    Papa.parse<unknown[]>(file, {
      header: false,
      skipEmptyLines: "greedy",
      chunkSize: 1024 * 1024,
      chunk: (results, parser) => {
        parser.pause();

        void (async () => {
          try {
            if (failed) return;

            const parsedRows = (results.data ?? []) as unknown[][];
            const batch: Record<string, unknown>[] = [];

            for (const values of parsedRows) {
              if (!Array.isArray(values) || isBlankRow(values)) continue;

              if (!headers) {
                headers = makeUniqueHeaders(values);
                continue;
              }

              const row = rowToObject(headers, values);
              batch.push(row);
              rowCount += 1;

              if (samples.length < SAMPLE_SIZE) samples.push(row);

              if (batch.length >= BATCH_SIZE) {
                const rowsToInsert = batch.splice(0, batch.length);
                await insertBatch(datasetId, nextRowNumber, rowsToInsert);
                nextRowNumber += rowsToInsert.length;
              }
            }

            if (batch.length) {
              await insertBatch(datasetId, nextRowNumber, batch);
              nextRowNumber += batch.length;
            }

            const cursor = Number(results.meta?.cursor ?? 0);
            const percent = file.size > 0
              ? Math.max(0, Math.min(99, Math.round((cursor / file.size) * 100)))
              : null;

            onProgress?.(`กำลังนำเข้าข้อมูล ${rowCount.toLocaleString()} แถว`, percent);
            parser.resume();
          } catch (error) {
            failed = true;
            parser.abort();
            reject(error);
          }
        })();
      },
      complete: () => {
        void (async () => {
          if (failed) return;

          try {
            if (!headers?.length) throw new Error("ไม่พบหัวตารางในไฟล์ CSV");
            const columns = buildColumns(headers, samples);
            await finalizeDataset(datasetId, rowCount, columns);
            onProgress?.(`นำเข้าข้อมูลครบ ${rowCount.toLocaleString()} แถว`, 100);
            resolve({ rowCount, columnCount: headers.length });
          } catch (error) {
            reject(error);
          }
        })();
      },
      error: (error) => reject(error),
    });
  });
}

async function ingestExcel(
  datasetId: string,
  file: File,
  onProgress?: ProgressCallback,
): Promise<IngestResult> {
  await resetDataset(datasetId);

  onProgress?.("กำลังอ่านไฟล์ Excel ใน Browser", 5);

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: true,
    dense: false,
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("ไฟล์ Excel ไม่มี Worksheet");

  const sheet = workbook.Sheets[firstSheetName];
  const ref = sheet["!ref"];
  if (!ref) throw new Error("Worksheet ไม่มีข้อมูล");

  const range = XLSX.utils.decode_range(ref);
  const headerValues: unknown[] = [];

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const address = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    headerValues.push(sheet[address]?.v ?? "");
  }

  const headers = makeUniqueHeaders(headerValues);
  const samples: Record<string, unknown>[] = [];
  const batch: Record<string, unknown>[] = [];
  let rowCount = 0;
  let nextRowNumber = 1;
  const totalRows = Math.max(1, range.e.r - range.s.r);

  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const values: unknown[] = [];

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
      values.push(sheet[address]?.v ?? null);
    }

    if (isBlankRow(values)) continue;

    const row = rowToObject(headers, values);
    batch.push(row);
    rowCount += 1;

    if (samples.length < SAMPLE_SIZE) samples.push(row);

    if (batch.length >= BATCH_SIZE) {
      const rowsToInsert = batch.splice(0, batch.length);
      await insertBatch(datasetId, nextRowNumber, rowsToInsert);
      nextRowNumber += rowsToInsert.length;

      const processed = rowIndex - range.s.r;
      const percent = Math.min(99, Math.round((processed / totalRows) * 100));
      onProgress?.(`กำลังนำเข้าข้อมูล ${rowCount.toLocaleString()} แถว`, percent);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  if (batch.length) {
    await insertBatch(datasetId, nextRowNumber, batch);
  }

  const columns = buildColumns(headers, samples);
  await finalizeDataset(datasetId, rowCount, columns);
  onProgress?.(`นำเข้าข้อมูลครบ ${rowCount.toLocaleString()} แถว`, 100);

  return { rowCount, columnCount: headers.length };
}

export async function ingestDatasetFile(
  datasetId: string,
  file: File,
  onProgress?: ProgressCallback,
): Promise<IngestResult> {
  try {
    const ext = extensionOf(file.name);

    if (ext === "csv") {
      return await ingestCsv(datasetId, file, onProgress);
    }

    if (ext === "xlsx" || ext === "xls") {
      return await ingestExcel(datasetId, file, onProgress);
    }

    throw new Error("รองรับเฉพาะไฟล์ CSV, XLSX และ XLS");
  } catch (error) {
    await markFailed(datasetId, error);
    throw error;
  }
}
