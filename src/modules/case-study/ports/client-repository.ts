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

/** Every field of a client after an edit (the code never changes). The logo is required. */
export interface ClientUpdate extends ClientInfo {
  id: string;
  name: string;
  logoId: string;
}

/**
 * Reads and writes `client`, `client_logo` and `client_brief`. Implemented by
 * `adapters/supabase/client-repository.ts`. There is no delete (AD-21, AD-22).
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
  /** `ok(null)` when no client has this id; `err` only when the lookup itself fails. */
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
  /**
   * The client's current info for a non-deleted case (live: AD-22 as amended
   * 2026-10-16). `ok(null)` when no
   * non-deleted case has this id; `err` only when the lookup fails.
   */
  findClientInfoByCaseId(caseId: string): Promise<Result<CaseClientInfo | null>>;
}
