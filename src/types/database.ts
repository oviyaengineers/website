// Hand-written types matching supabase/migrations/0001_initial_schema.sql

export type UserRole = "admin" | "staff";
export type DcStatus = "draft" | "dispatched" | "delivered";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}
export type ProfileInsert = Partial<ProfileRow> & { id: string };
export type ProfileUpdate = Partial<ProfileRow>;

export interface CustomerRow {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  created_at: string;
  created_by: string | null;
}
export type CustomerInsert = Partial<CustomerRow> & { name: string };
export type CustomerUpdate = Partial<CustomerRow>;

export interface DeliveryChallanRow {
  id: string;
  dc_number: string;
  customer_id: string;
  dc_date: string;
  vehicle_number: string | null;
  driver_name: string | null;
  status: DcStatus;
  remarks: string | null;
  authorized_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export type DeliveryChallanInsert = Partial<DeliveryChallanRow> & {
  customer_id: string;
};
export type DeliveryChallanUpdate = Partial<DeliveryChallanRow>;

export interface DeliveryChallanItemRow {
  id: string;
  dc_id: string;
  description: string;
  quantity: number;
  unit: string;
  remarks: string | null;
  sort_order: number;
}
export type DeliveryChallanItemInsert = Partial<DeliveryChallanItemRow> & {
  dc_id: string;
  description: string;
};
export type DeliveryChallanItemUpdate = Partial<DeliveryChallanItemRow>;

export interface InvoiceRow {
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
}
export type InvoiceInsert = Partial<InvoiceRow> & { customer_id: string };
export type InvoiceUpdate = Partial<InvoiceRow>;

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  sort_order: number;
}
export type InvoiceItemInsert = Partial<InvoiceItemRow> & {
  invoice_id: string;
  description: string;
};
export type InvoiceItemUpdate = Partial<InvoiceItemRow>;

export interface JobCostRow {
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
}
export type JobCostInsert = Partial<JobCostRow> & { job_name: string };
export type JobCostUpdate = Partial<JobCostRow>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      customers: {
        Row: CustomerRow;
        Insert: CustomerInsert;
        Update: CustomerUpdate;
      };
      delivery_challans: {
        Row: DeliveryChallanRow;
        Insert: DeliveryChallanInsert;
        Update: DeliveryChallanUpdate;
      };
      delivery_challan_items: {
        Row: DeliveryChallanItemRow;
        Insert: DeliveryChallanItemInsert;
        Update: DeliveryChallanItemUpdate;
      };
      invoices: {
        Row: InvoiceRow;
        Insert: InvoiceInsert;
        Update: InvoiceUpdate;
      };
      invoice_items: {
        Row: InvoiceItemRow;
        Insert: InvoiceItemInsert;
        Update: InvoiceItemUpdate;
      };
      job_costs: {
        Row: JobCostRow;
        Insert: JobCostInsert;
        Update: JobCostUpdate;
      };
    };
  };
}
