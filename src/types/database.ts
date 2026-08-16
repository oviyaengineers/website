// Hand-written types matching supabase/migrations/0001_initial_schema.sql
//
// IMPORTANT: these must be plain `type` object literals (not `interface`,
// and Insert/Update must not be built via `Partial<Row> & {...}` intersections)
// so that they structurally satisfy @supabase/supabase-js's GenericTable
// constraint (Record<string, GenericTable>). Interfaces and Partial<>
// intersections do NOT satisfy an index-signature constraint in a
// conditional-type `extends` check, which silently collapses all query
// results to `never`.

export type UserRole = "admin" | "staff";
export type DcStatus = "draft" | "dispatched" | "delivered";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
};
export type ProfileInsert = {
  id: string;
  full_name?: string | null;
  role?: UserRole;
  created_at?: string;
};
export type ProfileUpdate = {
  id?: string;
  full_name?: string | null;
  role?: UserRole;
  created_at?: string;
};

export type CustomerRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  created_at: string;
  created_by: string | null;
};
export type CustomerInsert = {
  id?: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
  created_at?: string;
  created_by?: string | null;
};
export type CustomerUpdate = {
  id?: string;
  name?: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
  created_at?: string;
  created_by?: string | null;
};

export type DeliveryChallanRow = {
  id: string;
  dc_number: string;
  customer_id: string;
  dc_date: string;
  customer_dc_number: string[] | null;
  customer_dc_date: string[] | null;
  job_order_no: string | null;
  vehicle_number: string | null;
  status: DcStatus;
  remarks: string | null;
  authorized_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type DeliveryChallanInsert = {
  id?: string;
  dc_number?: string | null;
  customer_id: string;
  dc_date?: string;
  customer_dc_number?: string[] | null;
  customer_dc_date?: (string | null)[] | null;
  job_order_no?: string | null;
  vehicle_number?: string | null;
  status?: DcStatus;
  remarks?: string | null;
  authorized_by?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};
export type DeliveryChallanUpdate = {
  id?: string;
  dc_number?: string | null;
  customer_id?: string;
  dc_date?: string;
  customer_dc_number?: string[] | null;
  customer_dc_date?: (string | null)[] | null;
  job_order_no?: string | null;
  vehicle_number?: string | null;
  status?: DcStatus;
  remarks?: string | null;
  authorized_by?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DeliveryChallanItemRow = {
  id: string;
  dc_id: string;
  component: string;
  material: string | null;
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
  total_qty: number;
  sort_order: number;
};
export type DeliveryChallanItemInsert = {
  id?: string;
  dc_id: string;
  component: string;
  material?: string | null;
  received_qty?: number;
  sent_qty?: number;
  material_problem_qty?: number;
  rejection_qty?: number;
  sort_order?: number;
};
export type DeliveryChallanItemUpdate = {
  id?: string;
  dc_id?: string;
  component?: string;
  material?: string | null;
  received_qty?: number;
  sent_qty?: number;
  material_problem_qty?: number;
  rejection_qty?: number;
  sort_order?: number;
};

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_id: string;
  dc_id: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  gst_rate: number;
  gst_amount: number;
  discount: number;
  grand_total: number;
  payment_status: PaymentStatus;
  amount_paid: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};
export type InvoiceInsert = {
  id?: string;
  invoice_number?: string | null;
  customer_id: string;
  dc_id?: string | null;
  invoice_date?: string;
  due_date?: string | null;
  subtotal?: number;
  gst_rate?: number;
  gst_amount?: number;
  discount?: number;
  grand_total?: number;
  payment_status?: PaymentStatus;
  amount_paid?: number;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
};
export type InvoiceUpdate = {
  id?: string;
  invoice_number?: string | null;
  customer_id?: string;
  dc_id?: string | null;
  invoice_date?: string;
  due_date?: string | null;
  subtotal?: number;
  gst_rate?: number;
  gst_amount?: number;
  discount?: number;
  grand_total?: number;
  payment_status?: PaymentStatus;
  amount_paid?: number;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
};

export type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  sort_order: number;
};
export type InvoiceItemInsert = {
  id?: string;
  invoice_id: string;
  description: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  amount?: number;
  sort_order?: number;
};
export type InvoiceItemUpdate = {
  id?: string;
  invoice_id?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  amount?: number;
  sort_order?: number;
};

export type JobCostRow = {
  id: string;
  dc_id: string | null;
  invoice_id: string | null;
  job_name: string;
  material_cost: number;
  machine_hours: number;
  machine_rate: number;
  labor_cost: number;
  tooling_cost: number;
  overhead_cost: number;
  total_cost: number;
  created_by: string | null;
  created_at: string;
};
export type JobCostInsert = {
  id?: string;
  dc_id?: string | null;
  invoice_id?: string | null;
  job_name: string;
  material_cost?: number;
  machine_hours?: number;
  machine_rate?: number;
  labor_cost?: number;
  tooling_cost?: number;
  overhead_cost?: number;
  created_by?: string | null;
  created_at?: string;
};
export type JobCostUpdate = {
  id?: string;
  dc_id?: string | null;
  invoice_id?: string | null;
  job_name?: string;
  material_cost?: number;
  machine_hours?: number;
  machine_rate?: number;
  labor_cost?: number;
  tooling_cost?: number;
  overhead_cost?: number;
  created_by?: string | null;
  created_at?: string;
};

export type DcPicklistKind = "component" | "material";

export type DcPicklistItemRow = {
  id: string;
  kind: DcPicklistKind;
  name: string;
  created_at: string;
  created_by: string | null;
};
export type DcPicklistItemInsert = {
  id?: string;
  kind: DcPicklistKind;
  name: string;
  created_at?: string;
  created_by?: string | null;
};
export type DcPicklistItemUpdate = {
  id?: string;
  kind?: DcPicklistKind;
  name?: string;
  created_at?: string;
  created_by?: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      customers: {
        Row: CustomerRow;
        Insert: CustomerInsert;
        Update: CustomerUpdate;
        Relationships: [];
      };
      delivery_challans: {
        Row: DeliveryChallanRow;
        Insert: DeliveryChallanInsert;
        Update: DeliveryChallanUpdate;
        Relationships: [];
      };
      delivery_challan_items: {
        Row: DeliveryChallanItemRow;
        Insert: DeliveryChallanItemInsert;
        Update: DeliveryChallanItemUpdate;
        Relationships: [];
      };
      invoices: {
        Row: InvoiceRow;
        Insert: InvoiceInsert;
        Update: InvoiceUpdate;
        Relationships: [];
      };
      invoice_items: {
        Row: InvoiceItemRow;
        Insert: InvoiceItemInsert;
        Update: InvoiceItemUpdate;
        Relationships: [];
      };
      job_costs: {
        Row: JobCostRow;
        Insert: JobCostInsert;
        Update: JobCostUpdate;
        Relationships: [];
      };
      dc_picklist_items: {
        Row: DcPicklistItemRow;
        Insert: DcPicklistItemInsert;
        Update: DcPicklistItemUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      generate_dc_number: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      generate_invoice_number: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
  };
};
