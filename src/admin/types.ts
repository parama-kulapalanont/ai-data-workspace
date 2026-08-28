export type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

export type DatasetRow = {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  status: string;
  row_count: number;
  column_count: number;
  ingestion_status?: "NOT_INGESTED" | "PROCESSING" | "READY" | "ERROR";
  ingested_row_count?: number;
  ingestion_error?: string | null;
  ingested_at?: string | null;
  created_at?: string;
};

export type DataSourceRow = {
  id: string;
  name: string;
  source_type: "API" | "DATABASE" | "GOOGLE_SHEET" | "OTHER";
  description: string | null;
  endpoint: string | null;
  host: string | null;
  port: number | null;
  database_name: string | null;
  configuration: Record<string, unknown> | null;
  secret_reference: string | null;
  status: "ACTIVE" | "INACTIVE" | "ERROR";
  last_tested_at: string | null;
  created_at?: string;
};

export type AgentConfigRow = {
  id: string;
  name: string;
  provider: string;
  model: string;
  temperature: number;
  is_active: boolean;
};

export type AgentPromptRow = {
  id: string;
  agent_id: string;
  name: string;
  active_version: number;
};

export type AgentPromptVersionRow = {
  id: string;
  prompt_id: string;
  version: number;
  prompt_text: string;
  created_at: string;
};

export type SkillRow = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  is_enabled: boolean;
  created_at?: string;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  banned_until: string | null;
  created_at: string | null;
};

export type AuditLogRow = {
  id: number;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};
