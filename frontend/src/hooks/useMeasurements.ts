import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as measurementsApi from "../api/measurements";
import type {
  CreateMeasurementTemplateInput,
  CreateMeasurementProfileInput,
  GlobalMeasurementProfileQueryParams,
  MeasurementProfileQueryParams,
  UpdateMeasurementTemplateInput,
} from "../types/measurement";

export const measurementKeys = {
  lists: ["measurement-profiles"] as const,
  list: (filters: GlobalMeasurementProfileQueryParams) =>
    ["measurement-profiles", filters] as const,
  templates: ["measurement-templates"] as const,
  template: (templateId: string) =>
    ["measurement-template", templateId] as const,
  customerMeasurements: (
    customerId: string,
    filters: MeasurementProfileQueryParams,
  ) => ["customer-measurements", customerId, filters] as const,
  customerMeasurementPrefix: (customerId: string) =>
    ["customer-measurements", customerId] as const,
  profile: (profileId: string) => ["measurement-profile", profileId] as const,
};

export function useMeasurementProfiles(
  filters: GlobalMeasurementProfileQueryParams,
) {
  return useQuery({
    queryKey: measurementKeys.list(filters),
    queryFn: () => measurementsApi.listMeasurementProfiles(filters),
  });
}

export function useMeasurementTemplates() {
  return useQuery({
    queryKey: measurementKeys.templates,
    queryFn: measurementsApi.listMeasurementTemplates,
  });
}

export function useMeasurementTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: measurementKeys.template(templateId ?? ""),
    queryFn: () => measurementsApi.getMeasurementTemplate(templateId!),
    enabled: Boolean(templateId),
  });
}

export function useCreateMeasurementTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMeasurementTemplateInput) =>
      measurementsApi.createMeasurementTemplate(payload),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: measurementKeys.templates });
      queryClient.setQueryData(measurementKeys.template(template.id), template);
    },
  });
}

export function useUpdateMeasurementTemplate(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateMeasurementTemplateInput) =>
      measurementsApi.updateMeasurementTemplate(templateId, payload),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: measurementKeys.templates });
      queryClient.setQueryData(measurementKeys.template(template.id), template);
    },
  });
}

export function useDeleteMeasurementTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      measurementsApi.deleteMeasurementTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementKeys.templates });
    },
  });
}

export function useCustomerMeasurements(
  customerId: string | undefined,
  filters: MeasurementProfileQueryParams,
) {
  return useQuery({
    queryKey: measurementKeys.customerMeasurements(customerId ?? "", filters),
    queryFn: () =>
      measurementsApi.listCustomerMeasurements(customerId!, filters),
    enabled: Boolean(customerId),
  });
}

export function useCreateMeasurement(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMeasurementProfileInput) =>
      measurementsApi.createCustomerMeasurement(customerId, payload),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: measurementKeys.lists });
      queryClient.invalidateQueries({
        queryKey: measurementKeys.customerMeasurementPrefix(customerId),
      });
      queryClient.setQueryData(measurementKeys.profile(profile.id), profile);
    },
  });
}

export function useMeasurementProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: measurementKeys.profile(profileId ?? ""),
    queryFn: () => measurementsApi.getMeasurementProfile(profileId!),
    enabled: Boolean(profileId),
  });
}

export function useArchiveMeasurementProfile(
  profileId: string,
  customerId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => measurementsApi.archiveMeasurementProfile(profileId),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: measurementKeys.lists });
      queryClient.setQueryData(measurementKeys.profile(profile.id), profile);
      if (customerId) {
        queryClient.invalidateQueries({
          queryKey: measurementKeys.customerMeasurementPrefix(customerId),
        });
      }
    },
  });
}

export function useRestoreMeasurementProfile(
  profileId: string,
  customerId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => measurementsApi.restoreMeasurementProfile(profileId),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: measurementKeys.lists });
      queryClient.setQueryData(measurementKeys.profile(profile.id), profile);
      if (customerId) {
        queryClient.invalidateQueries({
          queryKey: measurementKeys.customerMeasurementPrefix(customerId),
        });
      }
    },
  });
}
