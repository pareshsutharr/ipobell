// Opens a broker's app or website, and reads the icons of broker apps that are installed on this phone.
// The Android launcher module is loaded only when needed, so an app built before it was added simply opens
// the website.
import { Linking, Platform } from "react-native";

import { openBroker, type Broker } from "@/features/ipos/brokers";

type Launcher = typeof import("expo-intent-launcher");

function launcher(): Launcher | null {
  if (Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-intent-launcher") as Launcher;
  } catch {
    return null;
  }
}

export function launchBroker(broker: Broker): Promise<"app" | "web" | "failed"> {
  return openBroker(broker, Platform.OS, {
    app: (packageName) => {
      const l = launcher();
      if (!l) throw new Error("launcher not available");
      l.openApplication(packageName); // throws when the app is not installed
    },
    web: (url) => Linking.openURL(url),
  });
}

/** The icon of the broker's app as installed on this phone (a data: URI), or null when it is not installed. */
export async function installedIcon(broker: Broker): Promise<string | null> {
  const l = launcher();
  if (!l || !broker.androidPackage) return null;
  try {
    const icon = await l.getApplicationIconAsync(broker.androidPackage);
    return typeof icon === "string" && icon.startsWith("data:image/") ? icon : null;
  } catch {
    return null;
  }
}
