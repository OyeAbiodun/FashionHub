import { apiClient } from "./client";
import type {
  CreateMeasurementTemplateInput,
  CreateMeasurementProfileInput,
  GlobalMeasurementProfileListResponse,
  GlobalMeasurementProfileQueryParams,
  MeasurementProfile,
  MeasurementProfileListResponse,
  MeasurementProfileQueryParams,
  MeasurementTemplate,
  MeasurementTemplateListItem,
  UpdateMeasurementTemplateInput,
} from "../types/measurement";

export async function listMeasurementProfiles(
  params: GlobalMeasurementProfileQueryParams,
): Promise<GlobalMeasurementProfileListResponse> {
  const response = await apiClient.get<GlobalMeasurementProfileListResponse>(
    "/measurement-profiles",
    { params },
  );
  return response.data;
}

export async function listMeasurementTemplates(): Promise<
  MeasurementTemplateListItem[]
> {
  const response = await apiClient.get<MeasurementTemplateListItem[]>(
    "/measurement-templates",
  );
  return response.data;
}

export async function getMeasurementTemplate(
  templateId: string,
): Promise<MeasurementTemplate> {
  const response = await apiClient.get<MeasurementTemplate>(
    `/measurement-templates/${templateId}`,
  );
  return response.data;
}

export async function createMeasurementTemplate(
  payload: CreateMeasurementTemplateInput,
): Promise<MeasurementTemplate> {
  const response = await apiClient.post<MeasurementTemplate>(
    "/measurement-templates",
    payload,
  );
  return response.data;
}

export async function updateMeasurementTemplate(
  templateId: string,
  payload: UpdateMeasurementTemplateInput,
): Promise<MeasurementTemplate> {
  const response = await apiClient.patch<MeasurementTemplate>(
    `/measurement-templates/${templateId}`,
    payload,
  );
  return response.data;
}

export async function deleteMeasurementTemplate(
  templateId: string,
): Promise<void> {
  await apiClient.delete(`/measurement-templates/${templateId}`);
}

export async function listCustomerMeasurements(
  customerId: string,
  params: MeasurementProfileQueryParams,
): Promise<MeasurementProfileListResponse> {
  const response = await apiClient.get<MeasurementProfileListResponse>(
    `/customers/${customerId}/measurements`,
    { params },
  );
  return response.data;
}

export async function createCustomerMeasurement(
  customerId: string,
  payload: CreateMeasurementProfileInput,
): Promise<MeasurementProfile> {
  const response = await apiClient.post<MeasurementProfile>(
    `/customers/${customerId}/measurements`,
    payload,
  );
  return response.data;
}

export async function getMeasurementProfile(
  profileId: string,
): Promise<MeasurementProfile> {
  const response = await apiClient.get<MeasurementProfile>(
    `/measurement-profiles/${profileId}`,
  );
  return response.data;
}

export async function archiveMeasurementProfile(
  profileId: string,
): Promise<MeasurementProfile> {
  const response = await apiClient.post<MeasurementProfile>(
    `/measurement-profiles/${profileId}/archive`,
  );
  return response.data;
}

export async function restoreMeasurementProfile(
  profileId: string,
): Promise<MeasurementProfile> {
  const response = await apiClient.post<MeasurementProfile>(
    `/measurement-profiles/${profileId}/restore`,
  );
  return response.data;
}
