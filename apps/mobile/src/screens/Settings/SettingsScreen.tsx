/**
 * Settings and Support Screen.
 *
 * Displays:
 * - Current user, authorized roles, and email.
 * - Active shop metadata and verified tenant ID.
 * - Connection and synchronization diagnostics (zero secrets).
 * - Tenant switcher and sign out.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { TenantBanner } from "../../components/TenantBanner";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing, typography } from "../../theme/colors";

export function SettingsScreen() {
  const { user, activeTenant, tenants, switchTenant, logout, isOffline } = useAuth();
  const [testingHealth, setTestingHealth] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);

  async function checkServerHealth() {
    setTestingHealth(true);
    setHealthStatus(null);
    try {
      const res = await api.getServerStatus();
      setHealthStatus(`Connected: Frappe ${res.frappe_version ?? "v16"} (DB: ${res.database?.engine ?? "MariaDB"})`);
    } catch (err) {
      setHealthStatus(`Health check error: ${err instanceof Error ? err.message : "Unreachable"}`);
    } finally {
      setTestingHealth(false);
    }
  }

  return (
    <View style={styles.container}>
      <TenantBanner />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User Profile */}
        <Card>
          <Text style={styles.sectionTitle}>User Profile</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Full Name</Text>
            <Text style={styles.value}>{user?.full_name || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>User ID</Text>
            <Text style={styles.value}>{user?.user_id || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user?.email || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Assigned Roles</Text>
            <Text style={styles.value}>{user?.roles.join(", ") || "User"}</Text>
          </View>
        </Card>

        {/* Active Shop Information */}
        <Card>
          <Text style={styles.sectionTitle}>Active Shop Workspace</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Shop Name</Text>
            <Text style={styles.value}>{activeTenant?.name || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Subdomain Slug</Text>
            <Text style={styles.value}>{activeTenant?.slug || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Role in this Shop</Text>
            <Text style={[styles.value, { color: colors.primaryDark, fontWeight: "600" }]}>
              {activeTenant?.role || "—"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tenant ID</Text>
            <Text style={[styles.value, { fontSize: 11 }]}>{activeTenant?.tenant_id || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Hostname</Text>
            <Text style={styles.value}>{activeTenant?.primary_hostname || "Local Cluster"}</Text>
          </View>

          {tenants.length > 1 && (
            <Button
              title="Switch to Another Shop"
              variant="outline"
              onPress={switchTenant}
              style={styles.switchBtn}
            />
          )}
        </Card>

        {/* Connection & Diagnostics */}
        <Card>
          <Text style={styles.sectionTitle}>Connection & Diagnostics</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Connection Status</Text>
            <Text style={[styles.value, { color: isOffline ? colors.warning : colors.success, fontWeight: "600" }]}>
              {isOffline ? "Offline (Cached)" : "Online / Connected"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>ERP Host</Text>
            <Text style={[styles.value, { fontSize: 11 }]}>{api.getBaseUrl()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>App Version</Text>
            <Text style={styles.value}>v0.1.0 (Phase 5 Mobile)</Text>
          </View>

          <Button
            title={testingHealth ? "Testing Connection..." : "Test ERP Health"}
            variant="secondary"
            onPress={() => void checkServerHealth()}
            loading={testingHealth}
            style={styles.healthBtn}
          />
          {healthStatus && (
            <Text style={[styles.healthResult, healthStatus.includes("error") && styles.healthError]}>
              {healthStatus}
            </Text>
          )}
        </Card>

        {/* Security & Support Note */}
        <Card style={styles.supportCard}>
          <Text style={styles.supportTitle}>Security & Support</Text>
          <Text style={styles.supportText}>
            This mobile companion app adheres strictly to server-side tenant boundaries.
            Transactions, pricing, and stock entries are validated by ERPNext.
            No private keys or database passwords are held on this device.
          </Text>
        </Card>

        {/* Sign Out */}
        <Button
          title="Sign Out of All Shops"
          variant="danger"
          onPress={() => void logout()}
          style={styles.logoutBtn}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
    fontSize: 16,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  value: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  switchBtn: {
    marginTop: spacing.md,
  },
  healthBtn: {
    marginTop: spacing.md,
  },
  healthResult: {
    ...typography.tiny,
    color: colors.primaryDark,
    marginTop: spacing.sm,
    fontWeight: "600",
  },
  healthError: {
    color: colors.danger,
  },
  supportCard: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  supportTitle: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  supportText: {
    ...typography.tiny,
    color: colors.textMuted,
    lineHeight: 16,
  },
  logoutBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
});
