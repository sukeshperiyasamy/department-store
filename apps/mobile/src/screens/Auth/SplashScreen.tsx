/**
 * Splash and session loading screen.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>D</Text>
        </View>
        <Text style={styles.title}>Department Store</Text>
        <Text style={styles.subtitle}>Multi-Tenant Retail SaaS</Text>
        <ActivityIndicator style={styles.spinner} color={colors.primary} size="large" />
        <Text style={styles.statusText}>Connecting to store platform...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  content: {
    alignItems: "center",
  },
  logoMark: {
    width: 64,
    height: 64,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  logoText: {
    color: colors.textInverse,
    fontSize: 32,
    fontWeight: "800",
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  spinner: {
    marginTop: spacing.xxl,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
