
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "asset": {
                  Row: {
                    "case_id": string,"content_type": string,"created_at": string,"created_by": string,"deleted_at": string | null,"id": string,"is_favourite": boolean,"kind": string,"original_file_name": string,"s3_key": string,"size_bytes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"content_type": string,"created_at"?: string,"created_by": string,"deleted_at"?: string | null,"id"?: string,"is_favourite"?: boolean,"kind": string,"original_file_name": string,"s3_key": string,"size_bytes": number
                  }
                  Update: {
                    "case_id"?: string,"content_type"?: string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"id"?: string,"is_favourite"?: boolean,"kind"?: string,"original_file_name"?: string,"s3_key"?: string,"size_bytes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "asset_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "case_study"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"case_event": {
                  Row: {
                    "actor_id": string,"at": string,"case_id": string,"data": NonNullable<Json>,"id": string,"revision_id": string | null,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"at"?: string,"case_id": string,"data"?: NonNullable<Json>,"id"?: string,"revision_id"?: string | null,"type": string
                  }
                  Update: {
                    "actor_id"?: string,"at"?: string,"case_id"?: string,"data"?: NonNullable<Json>,"id"?: string,"revision_id"?: string | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "case_event_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "case_event_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "case_study"
      referencedColumns: ["id"]
    }
                  ]
                },"case_number_counter": {
                  Row: {
                    "client_id": string,"last_number": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"last_number": number,"year": number
                  }
                  Update: {
                    "client_id"?: string,"last_number"?: number,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "case_number_counter_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client"
      referencedColumns: ["id"]
    }
                  ]
                },"case_study": {
                  Row: {
                    "approved_revision_id": string | null,"client_id": string,"code": string,"created_at": string,"created_by": string,"deleted_at": string | null,"head_revision_id": string | null,"head_version": number,"id": string,"locale": string,"name": string,"number": number,"project_order_ref": string | null,"status": string,"updated_at": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_revision_id"?: string | null,"client_id": string,"code": string,"created_at"?: string,"created_by": string,"deleted_at"?: string | null,"head_revision_id"?: string | null,"head_version"?: number,"id"?: string,"locale"?: string,"name": string,"number": number,"project_order_ref"?: string | null,"status"?: string,"updated_at"?: string,"year": number
                  }
                  Update: {
                    "approved_revision_id"?: string | null,"client_id"?: string,"code"?: string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"head_revision_id"?: string | null,"head_version"?: number,"id"?: string,"locale"?: string,"name"?: string,"number"?: number,"project_order_ref"?: string | null,"status"?: string,"updated_at"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "case_study_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "case_study_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"client": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string,"description": string | null,"id": string,"industries": (string)[],"logo_id": string | null,"name": string,"name_key": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"created_by": string,"description"?: string | null,"id"?: string,"industries"?: (string)[],"logo_id"?: string | null,"name": string,"name_key": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"industries"?: (string)[],"logo_id"?: string | null,"name"?: string,"name_key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_logo_id_fkey"
      columns: ["logo_id"]
isOneToOne: false
      referencedRelation: "client_logo"
      referencedColumns: ["id"]
    }
                  ]
                },"client_asset": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string,"file_name": string,"height": number | null,"id": string,"mime_type": string,"path": string,"position": number,"size_bytes": number,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by": string,"file_name": string,"height"?: number | null,"id"?: string,"mime_type": string,"path": string,"position": number,"size_bytes": number,"width"?: number | null
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string,"file_name"?: string,"height"?: number | null,"id"?: string,"mime_type"?: string,"path"?: string,"position"?: number,"size_bytes"?: number,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_asset_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_asset_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"client_brief": {
                  Row: {
                    "client_id": string,"context": string,"results": string,"solution": string,"updated_at": string,"updated_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"context"?: string,"results"?: string,"solution"?: string,"updated_at"?: string,"updated_by": string
                  }
                  Update: {
                    "client_id"?: string,"context"?: string,"results"?: string,"solution"?: string,"updated_at"?: string,"updated_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_brief_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "client"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_brief_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"client_logo": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string,"id": string,"mime_type": string,"path": string,"size_bytes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by": string,"id"?: string,"mime_type": string,"path": string,"size_bytes": number
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"mime_type"?: string,"path"?: string,"size_bytes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_logo_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_logo_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"context_form": {
                  Row: {
                    "case_id": string,"context": string,"created_at": string,"results": string,"solution": string,"updated_at": string,"updated_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"context"?: string,"created_at"?: string,"results"?: string,"solution"?: string,"updated_at"?: string,"updated_by": string
                  }
                  Update: {
                    "case_id"?: string,"context"?: string,"created_at"?: string,"results"?: string,"solution"?: string,"updated_at"?: string,"updated_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "context_form_case_id_fkey"
      columns: ["case_id"]
isOneToOne: true
      referencedRelation: "case_study"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "context_form_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"job": {
                  Row: {
                    "attempts": number,"created_at": string,"error": Json | null,"finished_at": string | null,"id": string,"input_hash": string,"kind": string,"locked_until": string | null,"max_attempts": number,"payload": NonNullable<Json>,"status": string,"subject_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"error"?: Json | null,"finished_at"?: string | null,"id"?: string,"input_hash": string,"kind": string,"locked_until"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"status"?: string,"subject_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"error"?: Json | null,"finished_at"?: string | null,"id"?: string,"input_hash"?: string,"kind"?: string,"locked_until"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"status"?: string,"subject_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profile": {
                  Row: {
                    "created_at": string,"disabled_at": string | null,"display_name": string,"email": string,"id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"disabled_at"?: string | null,"display_name": string,"email": string,"id"?: string,"role": string
                  }
                  Update: {
                    "created_at"?: string,"disabled_at"?: string | null,"display_name"?: string,"email"?: string,"id"?: string,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "case_study_code":
{ Args: { "p_client_code": string,"p_number": number,"p_year": number }; Returns: string
                           },
"client_code_letters":
{ Args: { "p_name": string }; Returns: string
                           },
"client_info_text":
{ Args: { "p_text": string }; Returns: string
                           },
"client_name_key":
{ Args: { "p_name": string }; Returns: string
                           },
"create_asset":
{ Args: { "p_actor_id": string,"p_case_id": string,"p_content_type": string,"p_id": string,"p_kind": string,"p_original_file_name": string,"p_s3_key": string,"p_size_bytes": number }; Returns: {
              "case_id": string,
"content_type": string,
"created_at": string,
"created_by": string,
"deleted_at": string | null,
"id": string,
"is_favourite": boolean,
"kind": string,
"original_file_name": string,
"s3_key": string,
"size_bytes": number
            }
                          SetofOptions: {
        from: "*"
        to: "asset"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_case_study":
{ Args: { "p_actor_id": string,"p_client_id": string,"p_locale": string,"p_name": string,"p_year": number }; Returns: {
              "approved_revision_id": string | null,
"client_id": string,
"code": string,
"created_at": string,
"created_by": string,
"deleted_at": string | null,
"head_revision_id": string | null,
"head_version": number,
"id": string,
"locale": string,
"name": string,
"number": number,
"project_order_ref": string | null,
"status": string,
"updated_at": string,
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "case_study"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_client":
{ Args: { "p_actor_id": string,"p_description": string,"p_industries": (string)[],"p_name": string }; Returns: {
              "code": string,
"created_at": string,
"created_by": string,
"description": string | null,
"id": string,
"industries": (string)[],
"logo_id": string | null,
"name": string,
"name_key": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "client"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_client_asset":
{ Args: { "p_asset_id": string }; Returns: boolean
                           },
"delete_client_logo":
{ Args: { "p_logo_id": string }; Returns: boolean
                           },
"has_material":
{ Args: { "p_case_id": string }; Returns: boolean
                           },
"insert_client_asset":
{ Args: { "p_actor_id": string,"p_client_id": string,"p_file_name": string,"p_height": number,"p_id": string,"p_mime_type": string,"p_path": string,"p_size_bytes": number,"p_width": number }; Returns: {
              "client_id": string,
"created_at": string,
"created_by": string,
"file_name": string,
"height": number | null,
"id": string,
"mime_type": string,
"path": string,
"position": number,
"size_bytes": number,
"width": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "client_asset"
        isOneToOne: true
        isSetofReturn: false
      } },
"jobs_claim":
{ Args: { "p_kinds": (string)[] }; Returns: {
              "attempts": number,
"created_at": string,
"error": Json | null,
"finished_at": string | null,
"id": string,
"input_hash": string,
"kind": string,
"locked_until": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"status": string,
"subject_id": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "job"
        isOneToOne: false
        isSetofReturn: true
      } },
"jobs_enqueue":
{ Args: { "p_input_hash": string,"p_kind": string,"p_payload": Json,"p_subject_id": string }; Returns: {
              "attempts": number,
"created_at": string,
"error": Json | null,
"finished_at": string | null,
"id": string,
"input_hash": string,
"kind": string,
"locked_until": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"status": string,
"subject_id": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "job"
        isOneToOne: false
        isSetofReturn: true
      } },
"jobs_fail":
{ Args: { "p_attempts": number,"p_error": Json,"p_id": string,"p_retry_after": number,"p_retryable": boolean }; Returns: {
              "attempts": number,
"created_at": string,
"error": Json | null,
"finished_at": string | null,
"id": string,
"input_hash": string,
"kind": string,
"locked_until": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"status": string,
"subject_id": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "job"
        isOneToOne: false
        isSetofReturn: true
      } },
"jobs_finish":
{ Args: { "p_attempts": number,"p_id": string }; Returns: boolean
                           },
"jobs_release":
{ Args: { "p_attempts": number,"p_id": string }; Returns: boolean
                           },
"jobs_renew":
{ Args: { "p_attempts": number,"p_id": string }; Returns: boolean
                           },
"restore_asset":
{ Args: { "p_asset_id": string,"p_case_id": string }; Returns: boolean
                           },
"save_client_brief_field":
{ Args: { "p_actor_id": string,"p_client_id": string,"p_field": string,"p_text": string }; Returns: string
                           },
"save_context_field":
{ Args: { "p_actor_id": string,"p_case_id": string,"p_field": string,"p_text": string }; Returns: string
                           },
"transition_case_study":
{ Args: { "p_actor_id": string,"p_case_id": string,"p_event": string,"p_from": string,"p_to": string }; Returns: {
              "approved_revision_id": string | null,
"client_id": string,
"code": string,
"created_at": string,
"created_by": string,
"deleted_at": string | null,
"head_revision_id": string | null,
"head_version": number,
"id": string,
"locale": string,
"name": string,
"number": number,
"project_order_ref": string | null,
"status": string,
"updated_at": string,
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "case_study"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_client":
{ Args: { "p_actor_id": string,"p_client_id": string,"p_description": string,"p_industries": (string)[],"p_logo_id": string,"p_name": string }; Returns: {
              "code": string,
"created_at": string,
"created_by": string,
"description": string | null,
"id": string,
"industries": (string)[],
"logo_id": string | null,
"name": string,
"name_key": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "client"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
