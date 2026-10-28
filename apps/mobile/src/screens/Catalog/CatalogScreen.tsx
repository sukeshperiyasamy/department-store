/**
 * Catalog and Inventory Screen.
 *
 * Requirements:
 * - Search products by item code, name, barcode, or Tanglish/Tamil aliases.
 * - View product details, authoritative selling prices, and UOM.
 * - Respect backend permissions: cashier is read-only; no client-invented stock updates.
 * - Offline/stale cache indicator.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { CatalogItem } from "@departmental/shared-types";
import { api } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { TenantBanner } from "../../components/TenantBanner";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, spacing, typography } from "../../theme/colors";

export function CatalogScreen() {
  const { activeTenant } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [filtered, setFiltered] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  useEffect(() => {
    void loadCatalog();
  }, [activeTenant?.tenant_id]);

  useEffect(() => {
    filterItems(query);
  }, [query, items]);

  async function loadCatalog(force = false) {
    setError(null);
    try {
      const res = await api.getCatalogItems(force);
      setItems(res.data ?? []);
      setIsStale(res.isStale);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function filterItems(text: string) {
    if (!text.trim()) {
      setFiltered(items);
      return;
    }
    const q = text.trim().toLowerCase();
    const matches = items.filter((item) => {
      if (item.item_code.toLowerCase().includes(q)) return true;
      if (item.item_name.toLowerCase().includes(q)) return true;
      if (item.barcodes?.some((b) => b.barcode.toLowerCase().includes(q))) return true;
      if (item.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
      if (item.brand && item.brand.toLowerCase().includes(q)) return true;
      return false;
    });
    setFiltered(matches);
  }

  function formatPrice(rate?: number | null) {
    if (rate === undefined || rate === null) return "Price on request";
    return `₹${rate.toFixed(2)}`;
  }

  function renderItem({ item }: { item: CatalogItem }) {
    const isSelected = selectedItem?.item_code === item.item_code;
    return (
      <TouchableOpacity
        style={[styles.itemCard, isSelected && styles.itemCardSelected]}
        onPress={() => setSelectedItem(isSelected ? null : item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.item_name}`}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.item_name}
            </Text>
            <Text style={styles.itemCode}>
              Code: {item.item_code} {item.stock_uom ? `• Unit: ${item.stock_uom}` : ""}
            </Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.itemPrice}>
              {formatPrice(item.price?.price_list_rate)}
            </Text>
            {Boolean(item.item_group) && (
              <Badge label={item.item_group ?? ""} variant="neutral" />
            )}
          </View>
        </View>

        {isSelected && (
          <View style={styles.expandedDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Brand:</Text>
              <Text style={styles.detailValue}>{item.brand || "Standard"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Stock Managed:</Text>
              <Text style={styles.detailValue}>{item.is_stock_item ? "Yes (ERP tracked)" : "No"}</Text>
            </View>
            {Boolean(item.barcodes && item.barcodes.length > 0) && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Barcodes:</Text>
                <Text style={styles.detailValue}>
                  {item.barcodes.map((b) => b.barcode).join(", ")}
                </Text>
              </View>
            )}
            {Boolean(item.aliases && item.aliases.length > 0) && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Aliases:</Text>
                <Text style={styles.detailValue}>{item.aliases.join(", ")}</Text>
              </View>
            )}

            <View style={styles.permissionNotice}>
              <Feather name="info" size={14} color={colors.primaryDark} style={styles.noticeIcon} />
              <Text style={styles.permissionText}>
                Stock adjustments must be submitted through an authorized ERP Stock Entry workflow.
                Cashiers and mobile users operate in verified read-only inspection mode.
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

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, code, barcode, or Tamil alias..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          autoCorrect={false}
          accessibilityLabel="Search catalog products"
        />
        {Boolean(query) && (
          <TouchableOpacity onPress={() => setQuery("")} style={styles.clearBtn} accessibilityLabel="Clear search">
            <Feather name="x" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {isStale && (
        <View style={styles.staleBanner}>
          <Feather name="alert-triangle" size={14} color={colors.warning} style={styles.bannerIcon} />
          <Text style={styles.staleText}>Viewing offline cached catalog checkpoint.</Text>
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
          <Text style={styles.loadingText}>Loading store catalog...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.item_code}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadCatalog(true);
              }}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No Products Found</Text>
              <Text style={styles.emptyBody}>
                {query
                  ? `No catalog items matched "${query}".`
                  : "No sales items found in this store catalog."}
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
  searchBar: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    minHeight: 42,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
  },
  clearBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  clearBtnText: {
    color: colors.textMuted,
    fontSize: 16,
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
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemCardSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemName: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
  },
  itemCode: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },
  priceContainer: {
    alignItems: "flex-end",
  },
  itemPrice: {
    ...typography.bodyBold,
    color: colors.primaryDark,
    fontSize: 15,
    marginBottom: 4,
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
  permissionNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  noticeIcon: {
    marginTop: 1,
  },
  permissionText: {
    flex: 1,
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
