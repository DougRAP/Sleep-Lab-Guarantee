import fs from "fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * next dev reads .env.local by itself; the TEST process does not. The walk
 * needs the service key in here too, because it fabricates its own guarantee
 * for R-5 and takes it away again afterwards — something the app deliberately
 * cannot do (there is no unlink anywhere in it), and the reason each run does
 * not have to spend one of the seeded purchases forever.
 *
 * Walk-only. Neither real suite does this: both blank these keys on purpose.
 */
for (const line of readEnvLocal()) {
  const at = line.indexOf("=");
  if (at < 1 || line.trimStart().startsWith("#")) continue;
  const key = line.slice(0, at).trim();
  if (process.env[key]) continue;
  process.env[key] = line.slice(at + 1).trim();
}

function readEnvLocal(): string[] {
  try {
    return fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
  } catch {
    // No .env.local: the walk will fail its own precondition check with a
    // sentence, rather than here with a stack trace.
    return [];
  }
}

/**
 * Para mirar el recorrido de la guía en vivo, no para CI.
 * Ventana visible, a cámara lenta y en tamaño de móvil.
 *
 * A DIFERENCIA de las dos suites reales, aquí NO se vacían las claves de
 * Supabase: el recorrido incluye R-4, que es entrar a una cuenta, y sin
 * autenticación real no existe. Se leen de .env.local, así que esta corrida
 * escribe en el proyecto de Supabase de verdad. De ahí la convención de QA:
 * correos @rapqa.com y teléfonos que empiezan por 000, para que nada de lo que
 * quede en la base pueda confundirse con un cliente real.
 */
export default defineConfig({
  testDir: "./e2e/walk",
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3102",
    headless: false,
    viewport: { width: 420, height: 900 },
    launchOptions: { slowMo: 420, args: ["--window-position=60,40"] },
  },
  projects: [{ name: "walk", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- -p 3102",
    url: "http://localhost:3102",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      // Supabase se hereda de .env.local a propósito. Solo se apaga el
      // concierge, que en modo claims está dormido igualmente.
      ANTHROPIC_API_KEY: "",
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_CLAIMS_MODE: "true",
      NEXT_DIST_DIR: ".next-walk",
    },
  },
});
