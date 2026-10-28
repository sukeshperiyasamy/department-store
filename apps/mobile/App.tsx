/**
 * Main Entry Point for Departmental Store Mobile App.
 *
 * Implements:
 * - Session state routing (Splash -> SignIn -> TenantSelect -> Workspace).
 * - Multi-tenant workspace navigation with accessible bottom tabs.
 * - Prominent shop context identification.
 * - Offline / Live indicator.
 */

import React, { useState } from "react";
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Header } from "./src/components/Header";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { SignInScreen } from "./src/screens/Auth/SignInScreen";
import { SplashScreen } from "./src/screens/Auth/SplashScreen";
import { TenantSelectScreen } from "./src/screens/Auth/TenantSelectScreen";
import { CatalogScreen } from "./src/screens/Catalog/CatalogScreen";
import { StoreOverviewScreen } from "./src/screens/Overview/StoreOverviewScreen";
import { SalesActivityScreen } from "./src/screens/Sales/SalesActivityScreen";
import { SettingsScreen } from "./src/screens/Settings/SettingsScreen";
import { colors, radius, spacing, typography } from "./src/theme/colors";

type TabId = "overview" | "catalog" | "sales" | "settings";

function MainNavigator() {
  const { isLoading, isAuthenticated, activeTenant } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <SignInScreen />;
  }

  if (!activeTenant) {
    return <TenantSelectScreen />;
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      case "overview":
        return <StoreOverviewScreen />;
      case "catalog":
        return <CatalogScreen />;
      case "sales":
        return <SalesActivityScreen />;
      case "settings":
        return <SettingsScreen />;
    }
  };

  const tabs: Array<{ id: TabId; label: string; icon: keyof typeof Feather.glyphMap }> = [
    { id: "overview", label: "Overview", icon: "bar-chart-2" },
    { id: "catalog", label: "Catalog", icon: "package" },
    { id: "sales", label: "Sales", icon: "file-text" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <Header />
      <View style={styles.body}>{renderActiveScreen()}</View>

      {/* Accessible Bottom Tab Bar */}
      <View style={styles.tabBar} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab`}
              activeOpacity={0.7}
            >
              <Feather
                name={tab.icon}
                size={20}
                color={isActive ? colors.primaryDark : colors.textMuted}
                style={{ marginBottom: 2 }}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  body: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 56,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  tabButtonActive: {
    backgroundColor: colors.primaryLight,
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
});
