import { defineConfig, devices } from "@playwright/test";

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
