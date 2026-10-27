/**
 * Secure Sign-In Screen.
 *
 * Supports native Frappe ERPNext authentication.
 * Never stores or logs passwords in plaintext.
 */

import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, spacing, typography } from "../../theme/colors";

export function SignInScreen() {
  const { login, error, clearError } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState(api.getBaseUrl());
  const [showConfig, setShowConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSignIn() {
    clearError();
    setLocalError(null);

    const cleanUser = username.trim();
    if (!cleanUser) {
      setLocalError("Please enter your username or email address");
      return;
    }
    if (!password) {
      setLocalError("Please enter your password");
      return;
    }

    try {
      setSubmitting(true);
      api.setBaseUrl(serverUrl);
      await login(cleanUser, password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>D</Text>
          </View>
          <Text style={styles.title}>Department Store</Text>
          <Text style={styles.subtitle}>Multi-Tenant Retail Management</Text>
        </View>

        <Card variant="elevated" style={styles.card}>
          <Text style={styles.cardTitle}>Sign in to your shop</Text>
          <Text style={styles.cardSub}>
            Uses your authorized store account. Access permissions are strictly enforced by the server.
          </Text>

          {(localError || error) && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError || error}</Text>
            </View>
          )}

          <Input
            label="Username or Email"
            placeholder="e.g. Administrator or cashier@shop.com"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              if (localError) setLocalError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
          />

          <Input
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (localError) setLocalError(null);
            }}
            secureTextEntry
            autoComplete="current-password"
          />

          <Button
            title="Sign In"
            onPress={handleSignIn}
            loading={submitting}
            style={styles.signInBtn}
          />

          <TouchableOpacity
            style={styles.configToggle}
            onPress={() => setShowConfig(!showConfig)}
            accessibilityRole="button"
          >
            <Text style={styles.configToggleText}>
              {showConfig ? "▲ Hide Server Settings" : "⚙ Advanced: Server Endpoint"}
            </Text>
          </TouchableOpacity>

          {showConfig && (
            <View style={styles.configBox}>
              <Input
                label="ERPNext Server Address"
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.configHint}>
                Points to central Frappe ingress or local backend server.
              </Text>
            </View>
          )}
        </Card>

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>
            Demo Environment: Sign in as store manager or cashier to access authorized features.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.xl,
    justifyContent: "center",
    minHeight: "100%",
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  logoMark: {
    width: 54,
    height: 54,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  logoText: {
    color: colors.textInverse,
    fontSize: 28,
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
  card: {
    padding: spacing.xl,
  },
  cardTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "500",
  },
  signInBtn: {
    marginTop: spacing.sm,
  },
  configToggle: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  configToggleText: {
    ...typography.tiny,
    color: colors.primaryDark,
    fontWeight: "600",
  },
  configBox: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  configHint: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: -spacing.xs,
  },
  footerNote: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 280,
  },
});
