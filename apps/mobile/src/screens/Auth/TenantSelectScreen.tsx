/**
 * Authorized Shop Selector & Tenant Switcher Screen.
 *
 * Requirements:
 * - Load the shops that the authenticated user is actually authorized to access.
 * - Display tenant names and verified identifiers from the server.
 * - Require an explicit tenant selection when a user has multiple authorized shops.
 * - Do not treat user-supplied slug or QR code as proof of authorization.
 * - Block selection of suspended shops with clear feedback.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { UserTenantSummary } from "@departmental/shared-types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, spacing, typography } from "../../theme/colors";

export function TenantSelectScreen() {
  const { user, tenants, selectTenant, logout, refresh, error } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSelect(tenant: UserTenantSummary) {
    setActionError(null);
    if (tenant.status === "SUSPENDED") {
      setActionError(`Shop '${tenant.name}' has been suspended. Access is currently disabled.`);
      return;
    }

    try {
      setLoadingId(tenant.tenant_id);
      setSelectedId(tenant.tenant_id);
      await selectTenant(tenant);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to connect to selected shop");
    } finally {
      setLoadingId(null);
    }
  }

  function renderTenantItem({ item }: { item: UserTenantSummary }) {
    const isSuspended = item.status === "SUSPENDED";
    const isLoading = loadingId === item.tenant_id;
    const isSelected = selectedId === item.tenant_id;

    const roleBadge =
      item.role === "TENANT_OWNER"
        ? "Owner"
        : item.role === "STORE_MANAGER"
        ? "Store Manager"
        : item.role === "CASHIER"
        ? "Cashier"
        : "Auditor";

    return (
      <TouchableOpacity
        style={[
          styles.tenantCard,
          isSuspended && styles.tenantCardSuspended,
          isSelected && styles.tenantCardSelected,
        ]}
        onPress={() => void handleSelect(item)}
        disabled={isLoading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Select ${item.name}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.nameContainer}>
            <Text style={styles.tenantName}>{item.name}</Text>
            <Text style={styles.tenantSlug}>subdomain: {item.slug}</Text>
          </View>
          <Badge
            label={item.status}
            variant={isSuspended ? "danger" : "success"}
          />
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.roleTag}>
            <Text style={styles.roleLabel}>Role: </Text>
            <Text style={styles.roleValue}>{roleBadge}</Text>
          </View>

          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.selectAction, isSuspended && styles.selectActionSuspended]}>
              {isSuspended ? "Suspended 🔒" : "Open Shop →"}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Shop</Text>
        <Text style={styles.subtitle}>
          Signed in as <Text style={styles.userHighlight}>{user?.full_name || user?.user_id}</Text>
        </Text>
        <Text style={styles.prompt}>
          Choose the departmental store workspace you wish to access:
        </Text>
      </View>

      {(actionError || error) && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{actionError || error}</Text>
        </View>
      )}

      {tenants.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Authorized Shops</Text>
          <Text style={styles.emptyBody}>
            Your user account does not have active membership in any departmental store tenant.
            Please contact your system administrator to assign you to a shop.
          </Text>
          <Button title="Refresh Permissions" variant="outline" onPress={() => void refresh()} style={styles.refreshBtn} />
        </Card>
      ) : (
        <FlatList
          data={tenants}
          keyExtractor={(item) => item.tenant_id}
          renderItem={renderTenantItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <View style={styles.bottomBar}>
        <Button title="Sign Out" variant="secondary" onPress={() => void logout()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  userHighlight: {
    fontWeight: "700",
    color: colors.primaryDark,
  },
  prompt: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontSize: 13,
  },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.dangerBorder,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
  },
  listContent: {
    padding: spacing.lg,
  },
  tenantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tenantCardSuspended: {
    backgroundColor: "#fffdfd",
    borderColor: colors.dangerBorder,
    opacity: 0.85,
  },
  tenantCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  nameContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  tenantName: {
    ...typography.subtitle,
    color: colors.text,
    fontSize: 16,
  },
  tenantSlug: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  roleTag: {
    flexDirection: "row",
    alignItems: "center",
  },
  roleLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  roleValue: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  selectAction: {
    ...typography.bodyBold,
    color: colors.primaryDark,
    fontSize: 13,
  },
  selectActionSuspended: {
    color: colors.danger,
  },
  emptyCard: {
    margin: spacing.xl,
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  refreshBtn: {
    minWidth: 160,
  },
  bottomBar: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
