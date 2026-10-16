import type {
  Client,
  ClientInfo,
  ClientRef,
  ClientSnapshot,
  ClientSummary,
  LogoContentType,
} from "@/modules/case-study/domain/case-study";
import type { Result } from "@/shared/result";

/** A `client_logo` row as the module sees it. Rows are never updated or deleted. */
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

/** Every field of a client after an edit (the code never changes). */
export interface ClientUpdate extends ClientInfo {
  id: string;
  name: string;
  logoId: string | null;
}

/**
 * Reads and writes `client` and `client_logo`. Implemented by
 * `adapters/supabase/client-repository.ts`. There is no delete (AD-21, AD-22).
 */
export interface ClientRepository {
  /** Every client (`{ id, name, code }`), ordered by name; `err` only when the read fails or a row fails validation. */
  list(): Promise<Result<ClientRef[]>>;
  /**
   * Every client with the number of its non-deleted case studies, ordered by name;
   * `err` only when the read fails or a row fails validation.
   */
  listWithCaseCounts(): Promise<Result<ClientSummary[]>>;
  /** `ok(null)` when no client has this id; `err` only when the lookup itself fails. */
  findById(id: string): Promise<Result<Client | null>>;
  /**
   * Adds a client through `create_client`, which assigns the code (AD-21).
   * `err CLIENT_NAME_TAKEN` / `CLIENT_CODE_EXHAUSTED` / `CLIENT_FIELD_TOO_LONG`,
   * otherwise `err` only when the write fails. Nothing is written on any `err`.
   */
  create(name: string, info: ClientInfo, actorId: string): Promise<Result<Client>>;
  /**
   * Edits a client through `update_client`; the code never changes.
   * `err CLIENT_NOT_FOUND` / `CLIENT_NAME_TAKEN` / `CLIENT_LOGO_INVALID` /
   * `CLIENT_FIELD_TOO_LONG`, otherwise `err` only when the write fails. Nothing is
   * written on any `err`.
   */
  update(input: ClientUpdate, actorId: string): Promise<Result<Client>>;
  /** `ok(null)` when no logo row has this id; `err` only when the lookup fails. */
  findLogo(id: string): Promise<Result<ClientLogo | null>>;
  /** Inserts one `client_logo` row (the path is built by the adapter). `err` when the write fails. */
  insertLogo(logo: NewClientLogo): Promise<Result<ClientLogo>>;
  /**
   * The current client info of a non-deleted case (AD-22). `ok(null)` when no
   * non-deleted case has this id; `err` only when the lookup fails.
   */
  findSnapshotByCaseId(caseId: string): Promise<Result<ClientSnapshot | null>>;
}
