/**
 * Authentication and Tenant State Context for the Departmental Store Mobile App.
 *
 * Enforces:
 * - Session restoration on app boot.
 * - Loading authorized shops from backend.
 * - Explicit shop selection when user belongs to multiple shops.
 * - Denial and alert banner if selected tenant is suspended.
 * - Memory & cache cleanup when switching shops or logging out.
 */

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserProfileResponse, UserTenantSummary } from "@departmental/shared-types";
import { api, ApiError } from "../api/client";

export interface AuthContextType {
  user: UserProfileResponse | null;
  activeTenant: UserTenantSummary | null;
  tenants: UserTenantSummary[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isOffline: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectTenant: (tenant: UserTenantSummary) => Promise<void>;
  switchTenant: () => void;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfileResponse | null>(null);
  const [activeTenant, setActiveTenant] = useState<UserTenantSummary | null>(null);
  const [tenants, setTenants] = useState<UserTenantSummary[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  async function bootstrapSession(): Promise<void> {
    try {
      setIsLoading(true);
      const { sid, tenantId } = await api.restoreSession();
      if (!sid) {
        setIsLoading(false);
        return;
      }

      // Fetch user profile from ERPNext
      const profile = await api.getUserProfile();
      setUser(profile);
      setTenants(profile.tenants);
      setIsAuthenticated(true);

      // Restore active tenant if valid
      if (tenantId && profile.tenants.length > 0) {
        const matched = profile.tenants.find((t) => t.tenant_id === tenantId);
        if (matched) {
          api.setActiveTenant(matched);
          setActiveTenant(matched);
        } else if (profile.tenants.length === 1 && profile.tenants[0]) {
          api.setActiveTenant(profile.tenants[0]);
          setActiveTenant(profile.tenants[0]);
        }
      } else if (profile.tenants.length === 1 && profile.tenants[0]) {
        api.setActiveTenant(profile.tenants[0]);
        setActiveTenant(profile.tenants[0]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "NETWORK_ERROR") {
        setIsOffline(true);
      } else {
        // Session likely expired
        await api.logout();
        setIsAuthenticated(false);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string): Promise<void> {
    setError(null);
    setIsLoading(true);
    try {
      await api.login(username, password);
      const profile = await api.getUserProfile();
      setUser(profile);
      setTenants(profile.tenants);
      setIsAuthenticated(true);

      // Auto-select if exactly 1 authorized tenant
      if (profile.tenants.length === 1 && profile.tenants[0]) {
        const singleTenant = profile.tenants[0];
        api.setActiveTenant(singleTenant);
        setActiveTenant(singleTenant);
      } else {
        // Leave activeTenant null to trigger TenantSelectScreen
        api.setActiveTenant(null);
        setActiveTenant(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function logout(): Promise<void> {
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      setUser(null);
      setActiveTenant(null);
      setTenants([]);
      setIsAuthenticated(false);
      setError(null);
      setIsLoading(false);
    }
  }

  async function selectTenant(tenant: UserTenantSummary): Promise<void> {
    if (tenant.status === "SUSPENDED") {
      throw new Error(`Shop '${tenant.name}' is currently suspended. Access is blocked.`);
    }

    try {
      // Re-verify authorization with backend
      await api.getTenantInfo(tenant.tenant_id);
      api.setActiveTenant(tenant);
      setActiveTenant(tenant);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tenant authorization failed";
      setError(msg);
      throw err;
    }
  }

  function switchTenant(): void {
    api.setActiveTenant(null);
    setActiveTenant(null);
  }

  async function refresh(): Promise<void> {
    if (!isAuthenticated) return;
    try {
      const profile = await api.getUserProfile();
      setUser(profile);
      setTenants(profile.tenants);
      if (activeTenant) {
        const updated = profile.tenants.find((t) => t.tenant_id === activeTenant.tenant_id);
        if (updated) {
          if (updated.status === "SUSPENDED") {
            setError(`Shop '${updated.name}' has been suspended.`);
          }
          setActiveTenant(updated);
          api.setActiveTenant(updated);
        }
      }
      setIsOffline(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NETWORK_ERROR") {
        setIsOffline(true);
      }
    }
  }

  function clearError(): void {
    setError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        activeTenant,
        tenants,
        isAuthenticated,
        isLoading,
        error,
        isOffline,
        login,
        logout,
        selectTenant,
        switchTenant,
        refresh,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
