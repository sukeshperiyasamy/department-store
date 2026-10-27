/**
 * Accessible status badge component.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/colors";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = "neutral" }: BadgeProps) {
  const variantStyles = {
    success: { bg: colors.successLight, text: colors.success, border: colors.successBorder },
    warning: { bg: colors.warningLight, text: colors.warning, border: colors.warningBorder },
    danger: { bg: colors.dangerLight, text: colors.danger, border: colors.dangerBorder },
    info: { bg: colors.infoLight, text: colors.info, border: colors.infoBorder },
    neutral: { bg: colors.surfaceSubtle, text: colors.textSecondary, border: colors.border },
    primary: { bg: colors.primaryLight, text: colors.primaryDark, border: colors.primaryBorder },
  }[variant];

  return (
    <View style={[styles.badge, { backgroundColor: variantStyles.bg, borderColor: variantStyles.border }]}>
      <Text style={[styles.text, { color: variantStyles.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  text: {
    ...typography.tiny,
    fontWeight: "600",
  },
});
