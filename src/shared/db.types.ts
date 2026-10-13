
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
                    "case_id": string,"content_type": string,"created_at": string,"created_by": string,"deleted_at": string | null,"id": string,"kind": string,"original_file_name": string,"s3_key": string,"size_bytes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "case_id": string,"content_type": string,"created_at"?: string,"created_by": string,"deleted_at"?: string | null,"id"?: string,"kind": string,"original_file_name": string,"s3_key": string,"size_bytes": number
                  }
                  Update: {
                    "case_id"?: string,"content_type"?: string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"id"?: string,"kind"?: string,"original_file_name"?: string,"s3_key"?: string,"size_bytes"?: number
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
                },"case_study": {
                  Row: {
                    "approved_revision_id": string | null,"client": string,"created_at": string,"created_by": string,"deleted_at": string | null,"head_revision_id": string | null,"head_version": number,"id": string,"locale": string,"name": string,"project_order_ref": string | null,"status": string,"updated_at": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_revision_id"?: string | null,"client": string,"created_at"?: string,"created_by": string,"deleted_at"?: string | null,"head_revision_id"?: string | null,"head_version"?: number,"id"?: string,"locale"?: string,"name": string,"project_order_ref"?: string | null,"status"?: string,"updated_at"?: string,"year": number
                  }
                  Update: {
                    "approved_revision_id"?: string | null,"client"?: string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"head_revision_id"?: string | null,"head_version"?: number,"id"?: string,"locale"?: string,"name"?: string,"project_order_ref"?: string | null,"status"?: string,"updated_at"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "case_study_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"material_term": {
                  Row: {
                    "created_at": string,"id": string,"ref_id": string,"ref_kind": string,"term_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"ref_id": string,"ref_kind": string,"term_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ref_id"?: string,"ref_kind"?: string,"term_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_term_term_id_fkey"
      columns: ["term_id"]
isOneToOne: false
      referencedRelation: "taxonomy_term"
      referencedColumns: ["id"]
    }
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
                },"taxonomy_term": {
                  Row: {
                    "id": string,"key": string,"kind": string,"label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"key": string,"kind": string,"label": string
                  }
                  Update: {
                    "id"?: string,"key"?: string,"kind"?: string,"label"?: string
                  }
                  Relationships: [
                    
                  ]
                },"text_item": {
                  Row: {
                    "body": string,"case_id": string,"created_at": string,"created_by": string,"deleted_at": string | null,"id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"case_id": string,"created_at"?: string,"created_by": string,"deleted_at"?: string | null,"id"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"case_id"?: string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "text_item_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "case_study"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "text_item_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "case_material_terms":
{ Args: { "p_case_id": string }; Returns: Json
                           },
"create_asset":
{ Args: { "p_actor_id": string,"p_case_id": string,"p_content_type": string,"p_id": string,"p_kind": string,"p_original_file_name": string,"p_s3_key": string,"p_size_bytes": number }; Returns: {
              "case_id": string,
"content_type": string,
"created_at": string,
"created_by": string,
"deleted_at": string | null,
"id": string,
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
{ Args: { "p_actor_id": string,"p_client": string,"p_locale": string,"p_name": string,"p_year": number }; Returns: {
              "approved_revision_id": string | null,
"client": string,
"created_at": string,
"created_by": string,
"deleted_at": string | null,
"head_revision_id": string | null,
"head_version": number,
"id": string,
"locale": string,
"name": string,
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
"has_material":
{ Args: { "p_case_id": string }; Returns: boolean
                           },
"restore_asset":
{ Args: { "p_asset_id": string,"p_case_id": string }; Returns: boolean
                           },
"set_material_terms":
{ Args: { "p_case_id": string,"p_keys": (string)[],"p_kind": string,"p_ref_id": string,"p_ref_kind": string }; Returns: (string)[]
                           },
"transition_case_study":
{ Args: { "p_actor_id": string,"p_case_id": string,"p_event": string,"p_from": string,"p_to": string }; Returns: {
              "approved_revision_id": string | null,
"client": string,
"created_at": string,
"created_by": string,
"deleted_at": string | null,
"head_revision_id": string | null,
"head_version": number,
"id": string,
"locale": string,
"name": string,
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
