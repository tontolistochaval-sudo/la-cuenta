// Compila la app de Android con el JDK 21 portátil (~/.jdks) y el SDK de este equipo.
//   npm run android:apk  → "La Cuenta.apk" (APK de depuración, para instalar directamente en el móvil)
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const jdks = join(homedir(), '.jdks');
const jdk = existsSync(jdks) && readdirSync(jdks).find((d) => d.startsWith('jdk-21'));
if (!jdk && !process.env.JAVA_HOME) throw new Error('Falta un JDK 21: pon JAVA_HOME o descomprímelo en ~/.jdks');
const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');

const env = { ...process.env, JAVA_HOME: jdk ? join(jdks, jdk) : process.env.JAVA_HOME, ANDROID_HOME: sdk };
// cmd.exe no busca en la carpeta actual sin ruta explícita.
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
execSync(`${gradlew} assembleDebug`, { cwd: 'android', env, stdio: 'inherit' });
copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'La Cuenta.apk');
console.log('APK listo: La Cuenta.apk');
