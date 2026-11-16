import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Be IPO Ready",
  slug: "beipoready",
  version: "1.1.1",
  orientation: "portrait",
  scheme: "beipoready",
  platforms: ["ios", "android"],
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#FBFAF7",
  android: {
    package: "in.ipobell.app",
    versionCode: 6,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: ["android.permission.POST_NOTIFICATIONS"],
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "beipoready.com", pathPrefix: "/app/ipo" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  ios: { supportsTablet: false, bundleIdentifier: "in.ipobell.app", appleTeamId: process.env.APPLE_TEAM_ID || "H666L2KBMY" },
  plugins: [
    "expo-router",
    "@react-native-google-signin/google-signin",
    "expo-font",
    "expo-web-browser",
    "expo-secure-store",
    [
      "expo-splash-screen",
      { image: "./assets/splash-icon.png", imageWidth: 220, resizeMode: "contain", backgroundColor: "#FBFAF7", dark: { backgroundColor: "#0A1120" } },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#F59E0B",
        defaultChannel: "default",
        enableRemoteNotifications: true,
      },
    ],
    ["expo-calendar", { calendarPermission: "IPOBell adds IPO open, close, allotment and listing dates to your calendar." }],
    [
      "expo-build-properties",
      {
        android: {
          // R8 is on by default in Expo 58 release builds. WorkManager (pulled in by Firebase/expo-notifications)
          // loads its Room database by reflection; without these keep rules the app crashes at startup.
          extraProguardRules: [
            "-keep class androidx.work.** { *; }",
            "-keep class androidx.room.** { *; }",
            "-keep class * extends androidx.room.RoomDatabase { *; }",
            "-keep class * extends androidx.room.RoomDatabase$Callback { *; }",
            "-keep class com.google.firebase.** { *; }",
            "-keep class expo.modules.notifications.** { *; }",
            "-dontwarn com.google.firebase.ktx.**",
            "-dontwarn kotlinx.**",
            "-dontwarn androidx.work.**",
            "-dontwarn androidx.room.**",
          ].join("\n"),
          // Broker apps the "Apply through your broker" page may open and read the icon of (Android 11+ hides
          // other apps unless they are listed). Keep in step with BROKER_PACKAGES in src/features/ipos/brokers.ts.
          manifestQueries: { package: ["com.fivepaisa.trade", "com.msf.angelmobile", "com.dhan.live", "com.nextbillion.groww", "com.cloudtradetech.sky", "com.kotak.neo", "com.paytmmoney", "in.upstox.app", "com.zerodha.kite3"] },
        },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
