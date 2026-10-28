/**
 * Store Overview Screen.
 *
 * Requirements:
 * - Display store name and verified tenant context.
 * - Role-appropriate summary cards (financial KPIs for Owner/Manager; operational overview for Cashier).
 * - Clear loading, stale-data, offline, empty, and error states.
 * - Manual pull-to-refresh.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { OwnerSummary } from "@departmental/shared-types";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { TenantBanner } from "../../components/TenantBanner";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, spacing, typography } from "../../theme/colors";

export function StoreOverviewScreen() {
  const { activeTenant, isOffline } = useAuth();
  const [summary, setSummary] = useState<OwnerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isManagerOrOwner =
    activeTenant?.role === "TENANT_OWNER" || activeTenant?.role === "STORE_MANAGER";

  useEffect(() => {
    void loadOverview();
  }, [activeTenant?.tenant_id]);

  async function loadOverview(force = false) {
    if (!isManagerOrOwner) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await api.getOwnerSummary(undefined, force);
      setSummary(res.data);
      setIsStale(res.isStale);
      setCachedAt(res.cachedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load store summary");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadOverview(true);
  }

  function formatCurrency(amount: number) {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return (
    <View style={styles.container}>
      <TenantBanner />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            colors={[colors.primary]}
          />
        }
      >
        {isStale && (
          <View style={styles.staleNotice}>
            <Feather name="alert-triangle" size={14} color={colors.warning} style={styles.noticeIcon} />
            <Text style={styles.staleText}>
              Viewing cached offline data{cachedAt ? ` from ${new Date(cachedAt).toLocaleTimeString()}` : ""}.
              Pull down to refresh when network is restored.
            </Text>
          </View>
        )}

        {isOffline && (
          <View style={styles.offlineNotice}>
            <Text style={styles.offlineText}>
              Offline mode: Device is not connected to server. Read-only cached records are displayed.
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching store data...</Text>
          </View>
        ) : isManagerOrOwner ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Performance</Text>
              <Text style={styles.sectionDate}>
                {summary?.business_date || new Date().toLocaleDateString("en-IN")}
              </Text>
            </View>

            {/* KPI Metric Grid */}
            <View style={styles.grid}>
              <Card style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Gross Sales</Text>
                <Text style={styles.kpiValue}>
                  {summary ? formatCurrency(summary.gross_sales) : "₹0.00"}
                </Text>
                <Text style={styles.kpiSub}>Tax inclusive</Text>
              </Card>

              <Card style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Bills Count</Text>
                <Text style={styles.kpiValue}>{summary?.bills ?? 0}</Text>
                <Text style={styles.kpiSub}>Finalized bills</Text>
              </Card>

              <Card style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Net Sales</Text>
                <Text style={styles.kpiValue}>
                  {summary ? formatCurrency(summary.net_sales) : "₹0.00"}
                </Text>
                <Text style={styles.kpiSub}>Before GST</Text>
              </Card>

              <Card style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Average Bill</Text>
                <Text style={styles.kpiValue}>
                  {summary ? formatCurrency(summary.average_bill_value) : "₹0.00"}
                </Text>
                <Text style={styles.kpiSub}>Per customer</Text>
              </Card>
            </View>

            {/* Taxes and Returns row */}
            <Card style={styles.splitCard}>
              <View style={styles.splitRow}>
                <View style={styles.splitCol}>
                  <Text style={styles.splitLabel}>Taxes Collected (GST)</Text>
                  <Text style={styles.splitValue}>
                    {summary ? formatCurrency(summary.taxes_collected) : "₹0.00"}
                  </Text>
                </View>
                <View style={styles.splitDivider} />
                <View style={styles.splitCol}>
                  <Text style={styles.splitLabel}>Returns Total</Text>
                  <Text style={[styles.splitValue, { color: colors.danger }]}>
                    {summary ? formatCurrency(summary.returns_total) : "₹0.00"}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Payment Modes Split */}
            {Boolean(summary?.payment_split && summary.payment_split.length > 0) && (
              <Card style={styles.breakdownCard}>
                <Text style={styles.cardHeader}>Payment Modes</Text>
                {summary?.payment_split.map((mode, i) => (
                  <View key={i} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{mode.mode_of_payment}</Text>
                    <Text style={styles.breakdownValue}>{formatCurrency(mode.amount)}</Text>
                  </View>
                ))}
              </Card>
            )}
          </>
        ) : (
          /* Operational view for Cashier / Auditor */
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Counter Operations</Text>
              <Text style={styles.sectionDate}>Role: Cashier</Text>
            </View>

            <Card style={styles.operationalCard}>
              <Text style={styles.opTitle}>Shift Active</Text>
              <Text style={styles.opSub}>
                Connected to counter system for {activeTenant?.name}.
              </Text>
              <View style={styles.opBadgeRow}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Online Session Verified</Text>
              </View>
            </Card>

            <Card style={styles.instructionCard}>
              <Text style={styles.instTitle}>Billing Policy Note</Text>
              <Text style={styles.instText}>
                Official customer billing and tax invoice generation are executed through the
                authorized Windows POS counter. Use this mobile console to verify catalog prices,
                check stock availability, and review submitted transactions.
              </Text>
            </Card>
          </View>
        )}
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
  staleNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  noticeIcon: {
    marginTop: 2,
  },
  staleText: {
    flex: 1,
    ...typography.caption,
    color: colors.warning,
    fontWeight: "500",
  },
  offlineNotice: {
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  offlineText: {
    ...typography.caption,
    color: colors.info,
    fontWeight: "500",
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
  },
  centerBox: {
    paddingVertical: spacing.xxxl,
    alignItems: "center",
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  sectionDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  kpiCard: {
    width: "48%",
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  kpiLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiValue: {
    ...typography.subtitle,
    color: colors.text,
    fontSize: 18,
    marginVertical: spacing.xs,
  },
  kpiSub: {
    ...typography.tiny,
    color: colors.textSecondary,
  },
  splitCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  splitCol: {
    flex: 1,
    alignItems: "center",
  },
  splitDivider: {
    width: 1,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.sm,
  },
  splitLabel: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  splitValue: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: 2,
  },
  breakdownCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  breakdownLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  breakdownValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
  },
  operationalCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  opTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  opSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  opBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 6,
  },
  activeText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: "600",
  },
  instructionCard: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSubtle,
  },
  instTitle: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  instText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
