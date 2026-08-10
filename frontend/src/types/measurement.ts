export type MeasurementUnit = "INCH" | "CM";

export interface MeasurementTemplateField {
  id: string;
  field_name: string;
  field_key: string;
  position: number;
  is_required: boolean;
  unit_hint: string | null;
}

export interface MeasurementTemplate {
  id: string;
  name: string;
  garment_type: string;
  description: string | null;
  is_system_template: boolean;
  fields: MeasurementTemplateField[];
}

export interface MeasurementTemplateListItem {
  id: string;
  name: string;
  garment_type: string;
  is_system_template: boolean;
}

export interface MeasurementValue {
  id: string;
  field_name: string;
  field_key: string;
  value: string;
  notes: string | null;
  position: number;
}

export interface MeasurementProfile {
  id: string;
  customer_id: string;
  template_id: string | null;
  template_name: string | null;
  name: string;
  garment_type: string;
  unit: MeasurementUnit;
  notes: string | null;
  recorded_at: string;
  recorded_by: string;
  recorded_by_name: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  values: MeasurementValue[];
}

export interface MeasurementProfileListItem {
  id: string;
  name: string;
  garment_type: string;
  unit: MeasurementUnit;
  template_name: string | null;
  recorded_at: string;
  recorded_by_name: string;
  archived_at: string | null;
  value_count: number;
}

export interface CreateMeasurementProfileInput {
  template_id: string;
  name: string;
  garment_type: string;
  unit: MeasurementUnit;
  notes?: string | null;
  recorded_at?: string | null;
  values: Array<{
    field_key: string;
    field_name: string;
    value: string;
    notes?: string | null;
    position: number;
  }>;
}

export interface MeasurementProfileListResponse {
  items: MeasurementProfileListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface MeasurementProfileQueryParams {
  page?: number;
  page_size?: number;
  archived?: boolean;
}

export interface GlobalMeasurementProfileListItem {
  profile_id: string;
  profile_name: string;
  garment_type: string;
  unit: MeasurementUnit;
  recorded_at: string;
  archived_at: string | null;
  value_count: number;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  template_name: string | null;
  recorded_by_name: string | null;
}

export interface GlobalMeasurementProfileListResponse {
  items: GlobalMeasurementProfileListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface GlobalMeasurementProfileQueryParams {
  search?: string;
  garment_type?: string;
  archived?: boolean;
  page?: number;
  page_size?: number;
}
