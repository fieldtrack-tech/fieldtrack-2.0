import { supabaseAnonClient as supabase } from "../../config/supabase.js";
import { enforceTenant } from "../../utils/tenant.js";
import type { FastifyRequest } from "fastify";
import type { Expense, ExpenseStatus, CreateExpenseBody } from "./expenses.schema.js";

/**
 * Expenses repository — all Supabase queries for the expenses table.
 *
 * Phase 16 confirmed column set:
 *   id, organization_id, employee_id, amount, description, status,
 *   receipt_url, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
 */
export const expensesRepository = {
  async createExpense(
    request: FastifyRequest,
    employeeId: string,
    body: CreateExpenseBody,
  ): Promise<Expense> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        organization_id: request.organizationId,
        employee_id: employeeId,
        amount: body.amount,
        description: body.description,
        receipt_url: body.receipt_url ?? null,
        status: "PENDING",
        submitted_at: now,
      })
      .select("id, organization_id, employee_id, amount, description, status, receipt_url, submitted_at, reviewed_at, reviewed_by, created_at, updated_at")
      .single();

    if (error) {
      throw new Error(`Failed to create expense: ${error.message}`);
    }
    return data as Expense;
  },

  async findExpenseById(
    request: FastifyRequest,
    expenseId: string,
  ): Promise<Expense | null> {
    const baseQuery = supabase
      .from("expenses")
      .select("id, organization_id, employee_id, amount, description, status, receipt_url, submitted_at, reviewed_at, reviewed_by, created_at, updated_at")
      .eq("id", expenseId);

    const { data, error } = await enforceTenant(request, baseQuery).single();

    if (error && error.code === "PGRST116") return null;
    if (error) {
      throw new Error(`Failed to fetch expense: ${error.message}`);
    }
    return data as Expense;
  },

  async findExpensesByUser(
    request: FastifyRequest,
    employeeId: string,
    page: number,
    limit: number,
  ): Promise<Expense[]> {
    const offset = (page - 1) * limit;

    const baseQuery = supabase
      .from("expenses")
      .select("id, organization_id, employee_id, amount, description, status, receipt_url, submitted_at, reviewed_at, reviewed_by, created_at, updated_at")
      .eq("employee_id", employeeId)
      .order("submitted_at", { ascending: false });

    const { data, error } = await enforceTenant(request, baseQuery).range(
      offset,
      offset + limit - 1,
    );

    if (error) {
      throw new Error(`Failed to fetch user expenses: ${error.message}`);
    }
    return (data ?? []) as Expense[];
  },

  async findExpensesByOrg(
    request: FastifyRequest,
    page: number,
    limit: number,
  ): Promise<Expense[]> {
    const offset = (page - 1) * limit;

    const baseQuery = supabase
      .from("expenses")
      .select("id, organization_id, employee_id, amount, description, status, receipt_url, submitted_at, reviewed_at, reviewed_by, created_at, updated_at")
      .order("submitted_at", { ascending: false });

    const { data, error } = await enforceTenant(request, baseQuery).range(
      offset,
      offset + limit - 1,
    );

    if (error) {
      throw new Error(`Failed to fetch org expenses: ${error.message}`);
    }
    return (data ?? []) as Expense[];
  },

  async updateExpenseStatus(
    request: FastifyRequest,
    expenseId: string,
    status: ExpenseStatus,
    reviewerId: string,
  ): Promise<Expense> {
    const now = new Date().toISOString();

    const baseQuery = supabase
      .from("expenses")
      .update({ status, reviewed_at: now, reviewed_by: reviewerId })
      .eq("id", expenseId);

    const { data, error } = await enforceTenant(request, baseQuery)
      .select("id, organization_id, employee_id, amount, description, status, receipt_url, submitted_at, reviewed_at, reviewed_by, created_at, updated_at")
      .single();

    if (error) {
      throw new Error(`Failed to update expense status: ${error.message}`);
    }
    return data as Expense;
  },
};
