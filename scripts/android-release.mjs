import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(homedir(), 'Library/Android/sdk');
const java = process.env.JAVA_HOME || path.join(homedir(), 'android-tools/jdk-21/Contents/Home');
const buildTools = path.join(sdk, 'build-tools/36.0.0');
const signingDirectory = path.resolve(root, '../../.private-signing/pliegue-ia');
const keystore = path.join(signingDirectory, 'release.keystore');
const credentialsPath = path.join(signingDirectory, 'release-signing.json');
const artifacts = path.join(root, 'artifacts');
const unsigned = path.join(android, 'app/build/outputs/apk/release/app-release-unsigned.apk');
const aligned = path.join(artifacts, '.pliegue-ia-aligned.apk');
const apk = path.join(artifacts, 'pliegue-ia.apk');
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, PATH: `${java}/bin:${process.env.PATH || ''}` };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} terminó con código ${result.status}.`);
  return result;
}

if (!existsSync(path.join(root, 'dist/index.html'))) throw new Error('Primero genera la web final con npm run build.');
if (!existsSync(path.join(android, 'gradlew'))) throw new Error('Primero crea Android con npx cap add android.');
for (const executable of [path.join(java, 'bin/keytool'), path.join(buildTools, 'apksigner'), path.join(buildTools, 'zipalign')]) {
  if (!existsSync(executable)) throw new Error(`Falta la herramienta: ${executable}`);
}

// Native receives the web bundle before the downloadable APK is added to the hosted web output.
const hostedDownload = path.join(root, 'dist/downloads/pliegue-ia.apk');
if (existsSync(hostedDownload)) rmSync(hostedDownload);
run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
run(path.join(android, 'gradlew'), ['assembleRelease', '--no-daemon'], { cwd: android });
if (!existsSync(unsigned)) throw new Error('Gradle no produjo el APK release esperado.');

mkdirSync(signingDirectory, { recursive: true, mode: 0o700 });
chmodSync(signingDirectory, 0o700);
let credentials;
if (existsSync(credentialsPath)) {
  credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  if (credentials.alias !== 'pliegueia' || typeof credentials.password !== 'string' || credentials.password.length < 20) throw new Error('Configuración de firma no válida; no se cambió la clave existente.');
} else {
  if (existsSync(keystore)) throw new Error('Existe la clave de firma sin su configuración; restaura sus credenciales antes de compilar.');
  credentials = { alias: 'pliegueia', password: randomBytes(32).toString('base64url') };
  writeFileSync(credentialsPath, `${JSON.stringify(credentials)}\n`, { mode: 0o600, flag: 'wx' });
}
chmodSync(credentialsPath, 0o600);
const signingEnv = { ...env, PLIEGUE_KEYSTORE_PASSWORD: credentials.password };
if (!existsSync(keystore)) {
  run(path.join(java, 'bin/keytool'), [
    '-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-alias', credentials.alias,
    '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Pliegue IA',
    '-storepass:env', 'PLIEGUE_KEYSTORE_PASSWORD', '-keypass:env', 'PLIEGUE_KEYSTORE_PASSWORD',
  ], { env: signingEnv });
}
chmodSync(keystore, 0o600);
mkdirSync(artifacts, { recursive: true });
run(path.join(buildTools, 'zipalign'), ['-f', '-p', '4', unsigned, aligned]);
run(path.join(buildTools, 'apksigner'), [
  'sign', '--ks', keystore, '--ks-key-alias', credentials.alias,
  '--ks-pass', 'env:PLIEGUE_KEYSTORE_PASSWORD', '--key-pass', 'env:PLIEGUE_KEYSTORE_PASSWORD',
  '--out', apk, aligned,
], { env: signingEnv });
run(path.join(buildTools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk]);
run(path.join(buildTools, 'zipalign'), ['-c', '4', apk]);
const details = run(path.join(buildTools, 'aapt'), ['dump', 'badging', apk], { encoding: 'utf8', stdio: 'pipe' }).stdout;
const packageLine = details.split('\n').find(line => line.startsWith('package:'));
if (!packageLine?.includes("name='com.luizun.pliegueia'")) throw new Error('El APK tiene un identificador inesperado.');
console.log(packageLine);
for (const line of details.split('\n').filter(line => line.startsWith('sdkVersion:') || line.startsWith('targetSdkVersion:'))) console.log(line);
const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
writeFileSync(`${apk}.sha256`, `${sha256}  pliegue-ia.apk\n`);
rmSync(aligned);
console.log(`APK: ${apk}\nSHA-256: ${sha256}\nFirma persistente: ${signingDirectory} (archivos privados, conservar para futuras actualizaciones).`);
