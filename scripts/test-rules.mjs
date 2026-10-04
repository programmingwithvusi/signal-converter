// Runs the Firestore rules suite inside the emulator (npm run test:rules).
// The emulator needs Java 21 or newer. This picks a suitable JDK for this one command only,
// so the machine's default Java can stay on whatever other projects need.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'

const MIN_JAVA = 21
const isWindows = process.platform === 'win32'

function javaIn(home) {
  return join(home, 'bin', isWindows ? 'java.exe' : 'java')
}

// Major version of a java executable, or 0 if it cannot be run.
function majorOf(java) {
  const result = spawnSync(java, ['-version'], { encoding: 'utf8' })
  const match = /version "(\d+)/.exec(`${result.stderr ?? ''}${result.stdout ?? ''}`)
  return match ? Number(match[1]) : 0
}

function installedJdkHomes() {
  const roots = isWindows
    ? ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'Amazon Corretto'].map((dir) =>
        join(process.env.ProgramFiles ?? 'C:\\Program Files', dir),
      )
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines']
  const homes = process.env.JAVA_HOME ? [process.env.JAVA_HOME] : []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root)) {
      homes.push(join(root, entry), join(root, entry, 'Contents', 'Home'))
    }
  }
  return homes.filter((home) => existsSync(javaIn(home)))
}

function environmentWithJava() {
  if (majorOf('java') >= MIN_JAVA) return process.env

  // Lowest version that qualifies, to stay close to the Java 21 that CI uses.
  const [best] = installedJdkHomes()
    .map((home) => ({ home, major: majorOf(javaIn(home)) }))
    .filter((jdk) => jdk.major >= MIN_JAVA)
    .sort((a, b) => a.major - b.major)

  if (!best) {
    console.error(
      `The Firestore emulator needs Java ${MIN_JAVA} or newer, and none was found.\n` +
        `Install a JDK ${MIN_JAVA}+ (it does not have to be the default), or set JAVA_HOME to one.`,
    )
    process.exit(1)
  }

  console.log(`Using Java ${best.major} from ${best.home} for the emulator.`)
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
  return {
    ...process.env,
    JAVA_HOME: best.home,
    [pathKey]: `${join(best.home, 'bin')}${delimiter}${process.env[pathKey] ?? ''}`,
  }
}

const command =
  'npx --yes firebase-tools emulators:exec --only firestore --project demo-signal-converter ' +
  '"vitest run --config vitest.rules.config.ts"'

const { status } = spawnSync(command, { stdio: 'inherit', shell: true, env: environmentWithJava() })
process.exit(status ?? 1)
