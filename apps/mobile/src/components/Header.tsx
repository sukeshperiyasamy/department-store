/**
 * Top App Header component.
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing, typography } from "../theme/colors";

export interface HeaderProps {
  title?: string;
}

export function Header({ title = "Department Store" }: HeaderProps) {
  const { user, isOffline, logout } = useAuth();

  return (
    <View style={styles.header}>
      <View style={styles.left}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>D</Text>
        </View>
        <View>
          <Text style={styles.title}>{title}</Text>
          {Boolean(user?.full_name) && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {user?.full_name}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.right}>
        {isOffline ? (
          <View style={[styles.statusBadge, styles.offlineBadge]}>
            <View style={[styles.statusDot, styles.offlineDot]} />
            <Text style={styles.offlineText}>Offline</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, styles.liveBadge]}>
            <View style={[styles.statusDot, styles.liveDot]} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => void logout()}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.logoutText}>Exit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logoMark: {
    width: 32,
    height: 32,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  logoText: {
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 18,
  },
  title: {
    ...typography.subtitle,
    fontSize: 16,
    color: colors.text,
  },
  subtitle: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  liveBadge: {
    backgroundColor: colors.successLight,
    borderColor: colors.successBorder,
  },
  offlineBadge: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warningBorder,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  liveDot: {
    backgroundColor: colors.success,
  },
  offlineDot: {
    backgroundColor: colors.warning,
  },
  liveText: {
    ...typography.tiny,
    color: colors.success,
    fontWeight: "600",
  },
  offlineText: {
    ...typography.tiny,
    color: colors.warning,
    fontWeight: "600",
  },
  logoutButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
  },
  logoutText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: "600",
  },
});
