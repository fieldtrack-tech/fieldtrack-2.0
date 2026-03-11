// Backward-compatibility shim. New code imports from "@/lib/api/client" or "@/lib/api/endpoints".
export { apiGet, apiGetPaginated, apiPatch } from "@/lib/api/client";
export { API } from "@/lib/api/endpoints";
