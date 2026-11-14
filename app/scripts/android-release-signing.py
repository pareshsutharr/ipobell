#!/usr/bin/env python3
"""Inject release signing (credentials/keystore.properties) into the prebuilt android/app/build.gradle.
Idempotent — safe to run after every `expo prebuild --platform android`.
"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parents[1]
gradle = root / "android" / "app" / "build.gradle"
props = root / "credentials" / "keystore.properties"
if not gradle.exists():
    sys.exit("android/app/build.gradle not found — run `npx expo prebuild --platform android` first")
if not props.exists():
    sys.exit("credentials/keystore.properties not found")

s = gradle.read_text()

HEADER = '''def keystorePropertiesFile = rootProject.file("../credentials/keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

'''
RELEASE_CFG = '''        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
'''

if "keystorePropertiesFile" not in s:
    s = s.replace("android {\n", HEADER + "android {\n", 1)
if "storeFile file(keystoreProperties['storeFile'])" not in s:
    s = re.sub(r"(    signingConfigs \{\n)", lambda m: m.group(1) + RELEASE_CFG, s, count=1)

# buildTypes { ... release { ... signingConfig <debug> } } → release config.
bt = s.index("    buildTypes {")
rel = s.index("        release {", bt)
end = s.index("\n        }", rel)
block = re.sub(r"signingConfig\s*=?\s*signingConfigs\.debug", "signingConfig signingConfigs.release", s[rel:end])
s = s[:rel] + block + s[end:]

if "signingConfig signingConfigs.release" not in s:
    sys.exit("failed to point buildTypes.release at signingConfigs.release")
gradle.write_text(s)
print("release signing configured in android/app/build.gradle")
