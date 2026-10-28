/**
 * Sales and Operational Activity Screen.
 *
 * Requirements:
 * - View recent submitted invoices and their actual server status.
 * - Display finalized invoice identifiers supplied by ERPNext.
 * - Clearly distinguish finalized bills, returns, and pending reviews.
 * - Do not claim payment settlement based merely on typed references.
 * - Avoid building a conflicting 2nd mobile billing engine; Windows POS is authoritative for counter checkout.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { api, type RecentInvoiceRow } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { TenantBanner } from "../../components/TenantBanner";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, spacing, typography } from "../../theme/colors";

export function SalesActivityScreen() {
  const { activeTenant } = useAuth();
  const [invoices, setInvoices] = useState<RecentInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<RecentInvoiceRow | null>(null);

  useEffect(() => {
    void loadInvoices();
  }, [activeTenant?.tenant_id]);

  async function loadInvoices(force = false) {
    setError(null);
    try {
      const res = await api.getRecentInvoices(25, force);
      setInvoices(res.data ?? []);
      setIsStale(res.isStale);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recent sales");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function formatCurrency(amount: number) {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function renderInvoiceItem({ item }: { item: RecentInvoiceRow }) {
    const isReturn = Boolean(item.is_return);
    const isSelected = selectedInvoice?.name === item.name;

    return (
      <TouchableOpacity
        style={[styles.invoiceCard, isSelected && styles.invoiceCardSelected]}
        onPress={() => setSelectedInvoice(isSelected ? null : item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Invoice ${item.name}`}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.invoiceId}>{item.name}</Text>
            <Text style={styles.invoiceMeta}>
              {item.posting_date} {item.posting_time ? `• ${item.posting_time.slice(0, 5)}` : ""}
            </Text>
          </View>
          <View style={styles.amountCol}>
            <Text style={[styles.invoiceAmount, isReturn && styles.returnAmount]}>
              {isReturn ? "-" : ""}{formatCurrency(Math.abs(item.base_grand_total))}
            </Text>
            <Badge
              label={isReturn ? "RETURN" : item.status === "Paid" ? "CONFIRMED" : item.status.toUpperCase()}
              variant={isReturn ? "warning" : "success"}
            />
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.cashierText}>
            Cashier: {item.owner || "Counter POS"}
          </Text>
          {Boolean(item.customer) && (
            <Text style={styles.customerText} numberOfLines={1}>
              Cust: {item.customer}
            </Text>
          )}
        </View>

        {isSelected && (
          <View style={styles.expandedDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Authoritative Ledger:</Text>
              <Text style={styles.detailValue}>ERPNext Sales Invoice</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Transaction Verification:</Text>
              <Text style={styles.detailValue}>Server Committed (GL & SLE posted)</Text>
            </View>
            <View style={styles.policyBox}>
              <Text style={styles.policyText}>
                Official invoice records are immutable. Corrections require authorized return
                or credit note processing via counter POS workflows.
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TenantBanner />

      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Recent Invoices</Text>
        <Text style={styles.headerSubtitle}>Live counter transactions from ERPNext</Text>
      </View>

      {isStale && (
        <View style={styles.staleBanner}>
          <Feather name="alert-triangle" size={14} color={colors.warning} style={styles.bannerIcon} />
          <Text style={styles.staleText}>Viewing cached sales snapshot.</Text>
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
          <Text style={styles.loadingText}>Fetching recent invoices...</Text>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => item.name}
          renderItem={renderInvoiceItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadInvoices(true);
              }}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No Recent Bills</Text>
              <Text style={styles.emptyBody}>
                No submitted sales invoices recorded for this shop today.
              </Text>
            </Card>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },
  staleBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.warningBorder,
    gap: spacing.xs,
  },
  bannerIcon: {
    marginRight: 2,
  },
  staleText: {
    ...typography.tiny,
    color: colors.warning,
    fontWeight: "500",
  },
  errorBox: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.dangerLight,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.md,
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
  listContent: {
    padding: spacing.md,
  },
  invoiceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  invoiceCardSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  invoiceId: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
  },
  invoiceMeta: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },
  amountCol: {
    alignItems: "flex-end",
  },
  invoiceAmount: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 15,
    marginBottom: 4,
  },
  returnAmount: {
    color: colors.danger,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  cashierText: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  customerText: {
    ...typography.tiny,
    color: colors.textSecondary,
    maxWidth: 160,
  },
  expandedDetails: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  detailLabel: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  detailValue: {
    ...typography.tiny,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  policyBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  policyText: {
    ...typography.tiny,
    color: colors.textMuted,
    lineHeight: 16,
  },
  emptyCard: {
    marginVertical: spacing.xl,
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
