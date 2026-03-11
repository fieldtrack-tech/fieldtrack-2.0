"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGetPaginated, apiPatch } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { Expense, PaginatedResponse, ExpenseStatus } from "@/types";

export function useMyExpenses(page: number, limit: number) {
  return useQuery<PaginatedResponse<Expense>>({
    queryKey: ["expenses", page, limit],
    queryFn: () =>
      apiGetPaginated<Expense>(API.expenses, {
        page: String(page),
        limit: String(limit),
      }),
  });
}

export function useOrgExpenses(page: number, limit: number) {
  return useQuery<PaginatedResponse<Expense>>({
    queryKey: ["orgExpenses", page, limit],
    queryFn: () =>
      apiGetPaginated<Expense>(API.orgExpenses, {
        page: String(page),
        limit: String(limit),
      }),
  });
}

export function useUpdateExpenseStatus() {
  const client = useQueryClient();

  return useMutation<Expense, Error, { id: string; status: ExpenseStatus }>({
    mutationFn: ({ id, status }) =>
      apiPatch<Expense>(API.expenseStatus(id), { status }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["orgExpenses"] });
    },
  });
}
