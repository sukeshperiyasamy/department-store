/**
 * Prominent Tenant Banner component.
 *
 * Clearly identifies the active shop on every operational screen to prevent
 * cross-store confusion or mistakes. Includes active shop name, slug, user role,
 * and quick-access "Switch Shop" action.
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing, typography } from "../theme/colors";

export function TenantBanner() {
  const { activeTenant, tenants, switchTenant } = useAuth();

  if (!activeTenant) return null;

  const roleLabel =
    activeTenant.role === "TENANT_OWNER"
      ? "Owner"
      : activeTenant.role === "STORE_MANAGER"
      ? "Manager"
      : activeTenant.role === "CASHIER"
      ? "Cashier"
      : "Auditor";

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.storeBadge}>
          <Text style={styles.storeBadgeText}>SHOP</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.storeName} numberOfLines={1}>
            {activeTenant.name}
          </Text>
          <Text style={styles.slugAndRole}>
            {activeTenant.slug} • <Text style={styles.roleHighlight}>{roleLabel}</Text>
          </Text>
        </View>
      </View>
      {tenants.length > 1 && (
        <TouchableOpacity
          style={styles.switchButton}
          onPress={switchTenant}
          accessibilityLabel="Switch active shop"
          accessibilityRole="button"
        >
          <Text style={styles.switchButtonText}>Switch</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: spacing.sm,
  },
  storeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  storeBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  info: {
    flex: 1,
  },
  storeName: {
    ...typography.bodyBold,
    color: colors.primaryDark,
    fontSize: 13,
  },
  slugAndRole: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 1,
  },
  roleHighlight: {
    color: colors.primary,
    fontWeight: "600",
  },
  switchButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.md,
  },
  switchButtonText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "600",
  },
});
