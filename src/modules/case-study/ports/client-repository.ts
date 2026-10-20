import type {
  Client,
  ClientBrief,
  ClientBriefField,
  ClientInfo,
  ClientRef,
  CaseClientInfo,
  ClientSummary,
  LogoContentType,
} from "@/modules/case-study/domain/case-study";
import type { ClientAsset, ClientMaterialContentType } from "@/modules/case-study/domain/client-material";
import type { Result } from "@/shared/result";

/** A `client_logo` row as the module sees it. A replaced or removed logo's row is deleted. */
export interface ClientLogo {
  id: string;
  clientId: string;
  contentType: LogoContentType;
  sizeBytes: number;
}

/** A confirmed logo to record: its object is already stored and checked. */
export interface NewClientLogo {
  id: string;
  clientId: string;
  contentType: LogoContentType;
  sizeBytes: number;
  createdBy: string;
}

/** A confirmed client file to record: its object is already stored and checked. The position is chosen in SQL. */
export interface NewClientAsset {
  id: string;
  clientId: string;
  /** Trimmed, 1–255 characters. */
  fileName: string;
  contentType: ClientMaterialContentType;
  sizeBytes: number;
  /** Set for images only. */
  width: number | null;
  height: number | null;
  createdBy: string;
}

/** Every field of a client after an edit (the code never changes). The logo is required. */
export interface ClientUpdate extends ClientInfo {
  id: string;
  name: string;
  logoId: string;
}

/**
 * Reads and writes `client`, `client_logo`, `client_brief` and `client_asset`. Implemented by
 * `adapters/supabase/client-repository.ts`. A client is deleted only softly, with its
 * cases (`deleteClient`, owner 2026-10-19); every read and write here ignores a deleted
 * client.
 */
export interface ClientRepository {
  /** Every client (`{ id, name, code }`), ordered by name; `err` only when the read fails or a row fails validation. */
  list(): Promise<Result<ClientRef[]>>;
  /**
   * Every client with the number of its non-deleted case studies and whether every
   * required field is filled (`isClientComplete`), ordered by name; `err` only when
   * the read fails or a row fails validation.
   */
  listWithCaseCounts(): Promise<Result<ClientSummary[]>>;
  /** `ok(null)` when no non-deleted client has this id; `err` only when the lookup itself fails. */
  findById(id: string): Promise<Result<Client | null>>;
  /**
   * Adds a client through `create_client`, which assigns the code (AD-21).
   * `err CLIENT_NAME_TAKEN` / `CLIENT_CODE_EXHAUSTED` / `CLIENT_FIELD_INVALID` /
   * `CLIENT_FIELD_TOO_LONG`, otherwise `err` only when the write fails. Nothing is
   * written on any `err`.
   */
  create(name: string, info: ClientInfo, actorId: string): Promise<Result<Client>>;
  /**
   * Edits a client through `update_client`; the code never changes.
   * `err CLIENT_NOT_FOUND` / `CLIENT_NAME_TAKEN` / `CLIENT_LOGO_INVALID` /
   * `CLIENT_FIELD_INVALID` / `CLIENT_FIELD_TOO_LONG`, otherwise `err` only when the write fails. Nothing is
   * written on any `err`.
   */
  update(input: ClientUpdate, actorId: string): Promise<Result<Client>>;
  /**
   * Soft-deletes a client and every one of its non-deleted cases through
   * `delete_client`, with one `case_deleted` case event per case, and returns the number of
   * cases deleted. `err CLIENT_NOT_FOUND` (unknown or already deleted) /
   * `CLIENT_DELETE_NAME_MISMATCH`, otherwise `err` only when the write fails. Nothing
   * is written on any `err`.
   */
  deleteClient(clientId: string, confirmName: string, actorId: string): Promise<Result<number>>;
  /** The client's brief; `""` for each field when it has no row. `err` only when the lookup fails. */
  findBrief(clientId: string): Promise<Result<ClientBrief>>;
  /**
   * Saves one brief field through `save_client_brief_field` and returns the field's
   * previous text. `err CLIENT_NOT_FOUND` / `UNKNOWN_FIELD` / `CLIENT_FIELD_TOO_LONG`,
   * otherwise `err` only when the write fails. Nothing is written on any `err`.
   */
  saveBriefField(clientId: string, field: ClientBriefField, text: string, actorId: string): Promise<Result<string>>;
  /** `ok(null)` when no logo row has this id; `err` only when the lookup fails. */
  findLogo(id: string): Promise<Result<ClientLogo | null>>;
  /**
   * Deletes one `client_logo` row through `delete_client_logo`, only when no client
   * points at it: `err CLIENT_LOGO_IN_USE` otherwise. `ok(false)` when no row has
   * this id; `err` when the write fails.
   */
  deleteLogo(id: string): Promise<Result<boolean>>;
  /** Inserts one `client_logo` row (the path is built by the adapter). `err` when the write fails. */
  insertLogo(logo: NewClientLogo): Promise<Result<ClientLogo>>;
  /** The client's files, in position order; `err` only when the read fails or a row fails validation. */
  listAssets(clientId: string): Promise<Result<ClientAsset[]>>;
  /**
   * Records one client file through `insert_client_asset`, which takes the lowest
   * free position (1–3). `err CLIENT_MATERIAL_LIMIT` (3 files already) /
   * `CLIENT_NOT_FOUND` / `ASSET_ALREADY_CONFIRMED`, otherwise `err` only when the
   * write fails. Nothing is written on any `err`.
   */
  insertAsset(asset: NewClientAsset): Promise<Result<ClientAsset>>;
  /**
   * Deletes one `client_asset` row (of `clientId`, for the log) through `delete_client_asset`;
   * `ok(false)` when no row has this id, `err CLIENT_NOT_FOUND` when its client is deleted.
   */
  deleteAsset(id: string, clientId: string): Promise<Result<boolean>>;
  /**
   * The client's current info for a non-deleted case (live: AD-22 as amended
   * 2026-10-16). `ok(null)` when no
   * non-deleted case has this id; `err` only when the lookup fails.
   */
  findClientInfoByCaseId(caseId: string): Promise<Result<CaseClientInfo | null>>;
}
