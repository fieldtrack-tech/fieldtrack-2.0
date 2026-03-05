import { supabaseAnonClient as supabase } from "../../config/supabase.js";
import { enforceTenant } from "../../utils/tenant.js";
import type { FastifyRequest } from "fastify";
import type { Expense, ExpenseStatus, CreateExpenseBody } from "./expenses.schema.js";

/**
 * Expenses repository — all Supabase queries for the expenses table.
 * Every SELECT and UPDATE query is scoped via enforceTenant() for tenant isolation.
 * INSERT explicitly sets organization_id — no enforceTenant() needed for write.
 */
export const expensesRepository = {
  /**
   * Insert a new expense with PENDING status.
   * organization_id is set explicitly from request context.
   */
  async createExpense(
    request: FastifyRequest,
    userId: string,
    body: CreateExpenseBody,
  ): Promise<Expense> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        organization_id: request.organizationId,
        user_id: userId,
        amount: body.amount,
        description: body.description,
        receipt_url: body.receipt_url ?? null,
        status: "PENDING",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to create expense: ${error.message}`);
    }
    return data as Expense;
  },

  /**
   * Fetch a single expense by ID, scoped to the request's organization.
   * Returns null when no matching row exists (PGRST116).
   */
  async findExpenseById(
    request: FastifyRequest,
    expenseId: string,
  ): Promise<Expense | null> {
    const baseQuery = supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId);

    const { data, error } = await enforceTenant(request, baseQuery).single();

    if (error && error.code === "PGRST116") {
      return null;
    }
    if (error) {
      throw new Error(`Failed to fetch expense: ${error.message}`);
    }
    return data as Expense;
  },

  /**
   * Paginated list of all expenses for the requesting user.
   * Ordered newest-first.
   */
  async findExpensesByUser(
    request: FastifyRequest,
    userId: string,
    page: number,
    limit: number,
  ): Promise<Expense[]> {
    const offset = (page - 1) * limit;

    const baseQuery = supabase
      .from("expenses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const { data, error } = await enforceTenant(request, baseQuery).range(
      offset,
      offset + limit - 1,
    );

    if (error) {
      throw new Error(`Failed to fetch user expenses: ${error.message}`);
    }
    return (data ?? []) as Expense[];
  },

  /**
   * Paginated list of all expenses for the organization (ADMIN view).
   * Ordered newest-first.
   */
  async findExpensesByOrg(
    request: FastifyRequest,
    page: number,
    limit: number,
  ): Promise<Expense[]> {
    const offset = (page - 1) * limit;

    const baseQuery = supabase
      .from("expenses")
      .select("*")
      .order("created_at", { ascending: false });

    const { data, error } = await enforceTenant(request, baseQuery).range(
      offset,
      offset + limit - 1,
    );

    if (error) {
      throw new Error(`Failed to fetch org expenses: ${error.message}`);
    }
    return (data ?? []) as Expense[];
  },

  /**
   * Update the status of an expense.
   * enforceTenant() ensures an ADMIN from org A cannot touch org B's expenses.
   */
  async updateExpenseStatus(
    request: FastifyRequest,
    expenseId: string,
    status: ExpenseStatus,
  ): Promise<Expense> {
    const now = new Date().toISOString();

    const baseQuery = supabase
      .from("expenses")
      .update({ status, updated_at: now })
      .eq("id", expenseId);

    const { data, error } = await enforceTenant(request, baseQuery)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update expense status: ${error.message}`);
    }
    return data as Expense;
  },
};
