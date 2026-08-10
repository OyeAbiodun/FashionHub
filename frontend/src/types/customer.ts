export interface Customer {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  address: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerListItem {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface CustomerCreateInput {
  first_name: string;
  last_name?: string | null;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  gender?: string | null;
  birthday?: string | null;
  address?: string | null;
  notes?: string | null;
}

export type CustomerUpdateInput = Partial<CustomerCreateInput>;

export interface CustomerListResponse {
  items: CustomerListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface CustomerQueryParams {
  search?: string;
  page?: number;
  page_size?: number;
  archived?: boolean;
}
