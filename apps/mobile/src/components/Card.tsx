/**
 * Accessible light-surface Card container component.
 */

import React, { type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius, shadows, spacing } from "../theme/colors";

export interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  variant?: "default" | "elevated" | "subtle";
}

export function Card({ children, style, variant = "default" }: CardProps) {
  const cardStyle = [
    styles.card,
    variant === "elevated" && styles.elevated,
    variant === "subtle" && styles.subtle,
    style,
  ];

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  elevated: {
    ...shadows.md,
    borderWidth: 0,
  },
  subtle: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
});
