import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const appDir = path.join(androidDir, 'app');
const resDir = path.join(appDir, 'src', 'main', 'res');
const valuesDir = path.join(resDir, 'values');

console.log('[prepare-android] Starting Android project verification...');

// 1. Ensure android directory exists
if (!fs.existsSync(androidDir)) {
  console.log('[prepare-android] android directory missing, creating...');
  fs.mkdirSync(androidDir, { recursive: true });
}

// 2. Extract missing template files from @capacitor/cli assets if available
const templateTar = path.join(rootDir, 'node_modules', '@capacitor', 'cli', 'assets', 'android-template.tar.gz');
if (fs.existsSync(templateTar)) {
  try {
    console.log('[prepare-android] Restoring missing files from Capacitor template archive...');
    execSync(`tar -xzf "${templateTar}" -C "${androidDir}" --skip-old-files`, { stdio: 'inherit' });
    
    // Explicitly check for crucial mipmap icons in case res was partially empty
    const testIcon = path.join(resDir, 'mipmap-hdpi', 'ic_launcher_round.png');
    if (!fs.existsSync(testIcon)) {
      console.log('[prepare-android] Extracting res directory from template archive...');
      execSync(`tar -xzf "${templateTar}" -C "${androidDir}" app/src/main/res/`, { stdio: 'inherit' });
    }

    const testGradlew = path.join(androidDir, 'gradlew');
    if (!fs.existsSync(testGradlew)) {
      console.log('[prepare-android] Extracting gradlew from template archive...');
      execSync(`tar -xzf "${templateTar}" -C "${androidDir}" gradlew gradle/`, { stdio: 'inherit' });
    }
  } catch (err) {
    console.warn('[prepare-android] Warning during tar extract:', err.message);
  }
}

// 3. Ensure values directory exists
fs.mkdirSync(valuesDir, { recursive: true });

// 4. Ensure colors.xml
const colorsXmlPath = path.join(valuesDir, 'colors.xml');
const colorsXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#FE2C55</color>
    <color name="colorPrimaryDark">#121212</color>
    <color name="colorAccent">#FE2C55</color>
</resources>
`;
fs.writeFileSync(colorsXmlPath, colorsXmlContent, 'utf-8');
console.log('[prepare-android] Verified colors.xml');

// 5. Ensure strings.xml
const stringsXmlPath = path.join(valuesDir, 'strings.xml');
const stringsXmlContent = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">Masti Video</string>
    <string name="title_activity_main">Masti Video</string>
    <string name="package_name">com.mastivideo.app</string>
    <string name="custom_url_scheme">com.mastivideo.app</string>
</resources>
`;
fs.writeFileSync(stringsXmlPath, stringsXmlContent, 'utf-8');
console.log('[prepare-android] Verified strings.xml');

// 6. Ensure styles.xml
const stylesXmlPath = path.join(valuesDir, 'styles.xml');
const stylesXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`;
if (!fs.existsSync(stylesXmlPath) || !fs.readFileSync(stylesXmlPath, 'utf-8').includes('AppTheme')) {
  fs.writeFileSync(stylesXmlPath, stylesXmlContent, 'utf-8');
  console.log('[prepare-android] Created styles.xml');
} else {
  console.log('[prepare-android] Verified styles.xml');
}

// 7. Ensure variables.gradle
const variablesGradlePath = path.join(androidDir, 'variables.gradle');
const variablesGradleContent = `// Top-level build file variables for capacitor dependencies
ext {
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
    androidxActivityVersion = '1.10.1'
    androidxAppCompatVersion = '1.7.1'
    androidxCoordinatorLayoutVersion = '1.3.0'
    androidxCoreVersion = '1.16.0'
    androidxFragmentVersion = '1.8.6'
    coreSplashScreenVersion = '1.0.1'
    androidxWebkitVersion = '1.14.0'
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.2.1'
    androidxEspressoCoreVersion = '3.6.1'
    cordovaAndroidVersion = '10.1.1'
}
`;
fs.writeFileSync(variablesGradlePath, variablesGradleContent, 'utf-8');
console.log('[prepare-android] Verified variables.gradle');

// 8. Ensure gradle.properties
const gradlePropsPath = path.join(androidDir, 'gradle.properties');
const gradlePropsContent = `android.useAndroidX=true
android.enableJetifier=true
android.builder.sdkDownload=true
android.suppressUnsupportedCompileSdk=36
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
`;
fs.writeFileSync(gradlePropsPath, gradlePropsContent, 'utf-8');
console.log('[prepare-android] Verified gradle.properties');

// 9. Ensure local.properties
const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
if (sdkDir) {
  const localPropsPath = path.join(androidDir, 'local.properties');
  fs.writeFileSync(localPropsPath, `sdk.dir=${sdkDir}\n`, 'utf-8');
  console.log('[prepare-android] Verified local.properties with sdk.dir');
}

// 10. Ensure google-services.json
const googleServicesJsonPath = path.join(appDir, 'google-services.json');
const googleServicesJsonContent = JSON.stringify({
  project_info: {
    project_number: '669297294909',
    project_id: 'masti-video-24740',
    storage_bucket: 'masti-video-24740.firebasestorage.app',
  },
  client: [
    {
      client_info: {
        mobilesdk_app_id: '1:669297294909:android:b75d451c103922904db454',
        android_client_info: {
          package_name: 'com.mastivideo.app',
        },
      },
      oauth_client: [
        {
          client_id: '669297294909-goc4vvb8vdn0uqc2lv3ltlurn2vakva6.apps.googleusercontent.com',
          client_type: 3,
        },
      ],
      api_key: [
        {
          current_key: 'AIzaSyCpTSbVg9OR6cnu5i4U2Iq40kAZrVBYOx4',
        },
      ],
      services: {
        appinvite_service: {
          other_platform_oauth_client: [
            {
              client_id: '669297294909-goc4vvb8vdn0uqc2lv3ltlurn2vakva6.apps.googleusercontent.com',
              client_type: 3,
            },
          ],
        },
      },
    },
    {
      client_info: {
        mobilesdk_app_id: '1:669297294909:android:b75d451c103922904db454',
        android_client_info: {
          package_name: 'com.mastivideo',
        },
      },
      oauth_client: [
        {
          client_id: '669297294909-goc4vvb8vdn0uqc2lv3ltlurn2vakva6.apps.googleusercontent.com',
          client_type: 3,
        },
      ],
      api_key: [
        {
          current_key: 'AIzaSyCpTSbVg9OR6cnu5i4U2Iq40kAZrVBYOx4',
        },
      ],
      services: {
        appinvite_service: {
          other_platform_oauth_client: [
            {
              client_id: '669297294909-goc4vvb8vdn0uqc2lv3ltlurn2vakva6.apps.googleusercontent.com',
              client_type: 3,
            },
          ],
        },
      },
    },
  ],
  configuration_version: '1',
}, null, 2);

if (!fs.existsSync(googleServicesJsonPath)) {
  fs.writeFileSync(googleServicesJsonPath, googleServicesJsonContent, 'utf-8');
  console.log('[prepare-android] Created google-services.json');
} else {
  console.log('[prepare-android] Verified google-services.json');
}

// 11. Sync AdMob APPLICATION_ID in AndroidManifest.xml from MastiBase (with fallback)
const manifestPath = path.join(appDir, 'src', 'main', 'AndroidManifest.xml');
const DEFAULT_ADMOB_APP_ID = 'ca-app-pub-3940256099942544~3347511713';

async function syncAdMobManifestAppId() {
  if (!fs.existsSync(manifestPath)) {
    console.warn('[prepare-android] AndroidManifest.xml not found, skipping AdMob App ID sync');
    return;
  }

  let resolvedAppId = DEFAULT_ADMOB_APP_ID;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch('https://masti-basen.lovable.app/api/v1/admob', {
      headers: {
        'x-api-key': 'mb_live_rajkali_8789_7b31a6fe89d24643',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json();
      const payload = json?.data && typeof json.data === 'object' ? json.data : json;
      const remoteAppId = typeof payload?.appId === 'string' ? payload.appId.trim() : '';
      if (remoteAppId && remoteAppId.startsWith('ca-app-pub-')) {
        resolvedAppId = remoteAppId;
      }
    }
  } catch (err) {
    console.warn('[prepare-android] Using default AdMob App ID (MastiBase unreachable):', err.message);
  }

  let manifest = fs.readFileSync(manifestPath, 'utf-8');
  const metaTag = `<meta-data\n            android:name="com.google.android.gms.ads.APPLICATION_ID"\n            android:value="${resolvedAppId}" />`;
  const existingRegex = /<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[\s\S]*?\/>/m;

  if (existingRegex.test(manifest)) {
    manifest = manifest.replace(existingRegex, metaTag);
  } else if (manifest.includes('<activity')) {
    manifest = manifest.replace('<activity', `${metaTag}\n\n        <activity`);
  }

  fs.writeFileSync(manifestPath, manifest, 'utf-8');
  console.log(`[prepare-android] Synced AdMob APPLICATION_ID in AndroidManifest.xml: ${resolvedAppId}`);
}

await syncAdMobManifestAppId();

// 12. Ensure gradlew executable
const gradlewPath = path.join(androidDir, 'gradlew');
if (fs.existsSync(gradlewPath)) {
  try {
    fs.chmodSync(gradlewPath, 0o755);
    console.log('[prepare-android] chmod 755 applied to gradlew');
  } catch (err) {
    console.warn('[prepare-android] Could not chmod gradlew:', err.message);
  }
}

console.log('[prepare-android] Android project preparation completed successfully!');
