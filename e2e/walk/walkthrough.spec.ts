// e2e/walk/walkthrough.spec.ts
// Recorrido en vivo de test-guide.html. Ver e2e/walk/README.md.
// No forma parte de ninguna suite: se corre a mano con playwright.walk.config.ts
// en modo headed, para mirarlo o para enseñárselo a alguien.
//
//   npx playwright test -c playwright.walk.config.ts
//
// Dos actos, para que cada uno se pueda mirar entero sin cansarse:
//
//   1. EL CLIENTE   R-1, R-8, R-2, R-3, R-9 y R-4. Anónimo de principio a fin,
//                   hasta que entra a su cuenta y la solicitud le sigue.
//   2. LA CUENTA    R-6, R-5 y R-7. Lo que ve alguien con sesión.
//
// Se corre uno solo con -g "el cliente" o -g "la cuenta".
//
// OJO: esta configuración NO vacía las claves de Supabase, porque media lista
// es "entrar a una cuenta" y sin autenticación real no existe. La corrida
// escribe EN EL PROYECTO DE SUPABASE DE VERDAD: crea una cuenta, una
// reclamación, y en el segundo acto una compra que se lleva al terminar. Por
// eso el correo y el teléfono son de QA.

import { test, expect, type Page } from "@playwright/test";
import { createQaPurchase, removeQaPurchase, type QaPurchase } from "./support";

/* -------------------------------------------------------------------------- */
/* Contacto: aleatorio por defecto, fijable a mano                            */
/* -------------------------------------------------------------------------- */
//
// Cada corrida inventa un cliente nuevo, para que las reclamaciones no se pisen
// y se puedan distinguir en el dashboard. Si necesitas repetir un caso concreto
// o buscarlo después, pasa el valor por variable de entorno:
//
//   $env:QA_EMAIL="adrian.prueba@rapqa.com"; npx playwright test -c playwright.walk.config.ts
//   $env:QA_PHONE="0009998888";              npx playwright test -c playwright.walk.config.ts
//
// OJO en PowerShell: la variable se queda pegada en esa terminal hasta que la
// borres, así que las corridas siguientes en la misma ventana la seguirán
// usando y parecerá que el aleatorio dejó de funcionar. Para limpiarla:
//
//   Remove-Item Env:QA_EMAIL
//   Remove-Item Env:QA_PHONE
//
// Pasar uno no fija el otro: el que falte sigue siendo aleatorio. Y si pasas un
// correo de otro dominio se respeta; la convención @rapqa.com rige el aleatorio,
// no lo que escribas a mano.
//
// El correo es el MISMO para la cuenta y para el formulario de la reclamación,
// y eso no es casualidad: es justo la condición que R-4 exige para enganchar.

/** Sufijo corto y legible, distinto en cada corrida. */
function sufijo(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Las mismas reglas que aplica la app (lib/claim-flow.ts). */
function validarContacto(email: string, phone: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`QA_EMAIL no tiene forma de correo: "${email}"`);
  }
  if (phone.replace(/\D/g, "").length < 7) {
    throw new Error(`QA_PHONE necesita al menos 7 dígitos: "${phone}"`);
  }
}

const EMAIL = process.env.QA_EMAIL || `qa-${sufijo()}@rapqa.com`;
const PHONE =
  process.env.QA_PHONE || `000${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
validarContacto(EMAIL, PHONE);

/** Mínimo 8 caracteres (lib/auth/config.ts). La misma en toda la corrida. */
const PASSWORD = process.env.QA_PASSWORD || "Rapqa-2026";

// Los datos exactos de la guía. Solo el contacto varía.
const QA = {
  firstName: "Adrian",
  lastName: "Smith",
  salesOrder: "1011099600S",
  email: EMAIL,
  phone: PHONE,
};

/** Una fecha llana a N días de hoy, en el calendario del cliente. */
function desdeHoy(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// R-8: lo que el cliente cuenta con sus palabras. Dos párrafos a propósito,
// para ver que los saltos de línea sobreviven hasta la pantalla del agente.
const RELATO = `Ha resultado bastante más firme de lo que esperaba.

Me despierta el hombro sobre las tres de la mañana, casi todas las noches.`;
const PREFERENCIA = "Algo más blando en la zona del hombro, del mismo tamaño.";

// Perfil A: en ventana. Se calcula desde el reloj, porque unas fechas fijas
// dejarían de dar la noche 45 al día siguiente de escribirlas.
const PERFIL_A = {
  model: "CM-QUEEN-01",
  purchase: desdeHoy(-52),
  delivery: desdeHoy(-45),
};

// El par de Emy, tal cual salió en su captura. Estos literales sí son seguros:
// "comprado después de entregado" es cierto cualquier día del año.
const PAR_DE_EMY = { purchase: "2026-08-04", delivery: "2026-07-29" };

/** Pausa para que se pueda mirar lo que acaba de pasar. */
async function mirar(page: Page, ms = 1600) {
  await page.waitForTimeout(ms);
}

test("acto 1 · el cliente: R-1, R-8, R-2, R-3, R-9 y R-4", async ({ page }) => {
  test.setTimeout(300_000);

  await test.step("Preparación · la cuenta tiene que existir ANTES", async () => {
    // R-4 engancha al ENTRAR, no al darse de alta: crear una cuenta no prueba
    // que el correo sea tuyo mientras la confirmación de Supabase esté apagada.
    // Así que primero se crea la cuenta, y más tarde se entra con ella.
    await page.goto("/signup");
    await page.getByLabel("Email").fill(QA.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await mirar(page, 2000);
    await page.getByRole("button", { name: "Create my account" }).click();
    await page.waitForURL("**/requests");
    await mirar(page, 2000);
  });

  await test.step("R-4 · el formulario del número está a la vista", async () => {
    // Antes vivía dentro del bloque de las cuentas sin compra vinculada, así
    // que una cuenta con compra no tenía NINGUNA forma de añadir un CG.
    await expect(page.getByLabel("Claim number")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add my claim" })).toBeVisible();
    await mirar(page, 2500);
  });

  await test.step("Volver a ser anónimo", async () => {
    // No hay botón de cerrar sesión en las pantallas de cliente: en la guía
    // manual esto es abrir una ventana privada.
    await page.context().clearCookies();
    await page.goto("/");
    await mirar(page, 1500);
  });

  await test.step("R-1 · la portada ahora tiene barra, y sin pestañas", async () => {
    const barra = page.getByRole("navigation", { name: "Primary" });
    await expect(barra).toBeVisible();
    // Soporte sí, pestañas no: un visitante anónimo sería expulsado de todas.
    await expect(barra.getByRole("link", { name: /1-855-513-5435/ })).toBeVisible();
    await expect(barra.getByRole("link", { name: "Guarantee" })).toHaveCount(0);
    await expect(barra.getByRole("link", { name: "Requests" })).toHaveCount(0);
    await mirar(page, 2500);
  });

  await test.step("Identificación con los datos de QA", async () => {
    await page.getByLabel("First name").fill(QA.firstName);
    await page.getByLabel("Last name", { exact: true }).fill(QA.lastName);
    await page.getByLabel("Sales order number").fill(QA.salesOrder);
    await page.getByLabel("Email").fill(QA.email);
    await page.getByLabel("Mobile number").fill(QA.phone);
    await mirar(page, 2200);
    await page.getByRole("button", { name: "Get started" }).click();
    await page.waitForURL("**/claim");
    await mirar(page);
  });

  await test.step("R-2 · el Atrás vive junto al Next, ya desde el primer paso", async () => {
    await expect(page.getByRole("button", { name: /Back/ })).toBeVisible();
    await mirar(page, 1800);
  });

  await test.step("R-8 · lo primero que se pide son sus palabras", async () => {
    // El hallazgo de Emy: las dos pantallas de detalle pintaban "In your
    // words" y nada las rellenaba, así que el agente recibía casillas y ni una
    // línea sobre el colchón. Van ARRIBA del número de modelo, porque es lo
    // que el cliente viene a decir y lo único que no necesita el recibo.
    await expect(page.getByText(/In your own words, if you.d like/i)).toBeVisible();
    await page.getByLabel("Your experience").fill(RELATO);
    await page.getByLabel("What you'd rather have").fill(PREFERENCIA);
    await mirar(page, 2600);
  });

  await test.step("R-3 · el par de Emy no pasa de aquí", async () => {
    await page.getByLabel("Model number").fill(PERFIL_A.model);
    await page.getByLabel("Date of purchase").fill(PAR_DE_EMY.purchase);
    await page.getByLabel("Date of delivery").fill(PAR_DE_EMY.delivery);
    await expect(
      page.getByText(/purchase date lands after the delivery date/i)
    ).toBeVisible();
    // Una corrección y un conteo de noches nunca comparten pantalla: para este
    // par el conteo es un disparate, y es exactamente lo que se le mostró.
    await expect(page.getByText(/night -?\d+/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /a few confirmations/ })).toBeDisabled();
    // Nunca encerrado: la salida de una pantalla que no se puede satisfacer sigue abierta.
    await expect(page.getByRole("button", { name: /Back/ })).toBeEnabled();
    await mirar(page, 4000);
  });

  await test.step("R-3 · una entrega de mañana tampoco", async () => {
    await page.getByLabel("Date of purchase").fill(desdeHoy(-60));
    await page.getByLabel("Date of delivery").fill(desdeHoy(1));
    await expect(page.getByText(/delivery date is still ahead of us/i)).toBeVisible();
    await mirar(page, 3000);
  });

  await test.step("Perfil A · corregido, la app calcula la noche 45", async () => {
    await page.getByLabel("Date of delivery").fill(PERFIL_A.delivery);
    await page.getByLabel("Date of purchase").fill(PERFIL_A.purchase);
    await expect(page.getByText(/purchase date lands after/i)).toHaveCount(0);
    await expect(page.getByText(/night 45 of your 90/)).toBeVisible();
    await mirar(page, 3000);
  });

  await test.step("Al avanzar, el Atrás sigue junto al Next", async () => {
    await page.getByRole("button", { name: /a few confirmations/ }).click();
    await expect(page.getByRole("checkbox", { name: /clean and sanitary/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Back/ })).toBeVisible();
    await mirar(page, 2500);
  });

  await test.step("LA PRUEBA CLAVE · volver conserva lo tecleado", async () => {
    await page.getByRole("button", { name: /Back/ }).click();
    const modelo = page.getByLabel("Model number");
    await expect(modelo).toBeVisible();
    // Sin reintento: en el instante en que el campo aparece ya debe tener el valor.
    expect(await modelo.inputValue()).toBe(PERFIL_A.model);
    expect(await page.getByLabel("Date of delivery").inputValue()).toBe(PERFIL_A.delivery);
    // R-8 tiene que sobrevivir lo mismo, y es lo más largo que hay que perder:
    // en la primera versión, lo escrito mientras se guardaba se tiraba.
    expect(await page.getByLabel("Your experience").inputValue()).toBe(RELATO);
    await mirar(page, 3500);
  });

  await test.step("Las 9 casillas, y el protector sin marcar", async () => {
    await page.getByRole("button", { name: /a few confirmations/ }).click();
    // Esperar a que el paso LLEGUE antes de contar. El guardado es una acción
    // de servidor, y contar las casillas antes de que aterrice cuenta cero: el
    // bucle no marca nada y el botón se queda cerrado sin explicación.
    await expect(page.getByRole("checkbox", { name: /clean and sanitary/ })).toBeVisible();

    const casillas = page.getByRole("checkbox");
    const siguiente = page.getByRole("button", { name: /photos, if you/ });
    const total = await casillas.count();

    // La lista de "Still needed" se encoge con cada marca, así que la página se
    // reacomoda bajo el cursor y algún clic se pierde. Se marca solo lo que
    // sigue sin marcar, y se repasa hasta que el botón se habilita.
    // La última casilla es el protector, informativa: se deja fuera a propósito.
    for (let pasada = 0; pasada < 3; pasada++) {
      for (let i = 0; i < total - 1; i++) {
        const casilla = casillas.nth(i);
        if (!(await casilla.isChecked())) {
          await casilla.click();
          await page.waitForTimeout(140);
        }
      }
      if (await siguiente.isEnabled()) break;
    }
    await expect(siguiente).toBeEnabled();
    await expect(casillas.nth(total - 1)).not.toBeChecked();
    await mirar(page, 1500);
  });

  await test.step("Fotos opcionales, se saltan, y el explicativo", async () => {
    await page.getByRole("button", { name: /photos, if you/ }).click();
    await mirar(page, 2000);
    await page.getByRole("button", { name: /I can skip these/ }).click();
    await mirar(page, 2200);
  });

  let claimNumber = "";

  await test.step("Enviar · sale el CG y el Atrás desaparece", async () => {
    await page.getByRole("button", { name: "Send my request" }).click();
    const cg = page.getByText(/^CG[A-Z0-9]{6}$/);
    await expect(cg).toBeVisible();
    // Emitido el número, ya no hay marcha atrás.
    await expect(page.getByRole("button", { name: /Back/ })).toHaveCount(0);
    claimNumber = (await cg.textContent())?.trim() ?? "";
    await mirar(page, 3500);
  });

  await test.step("R-9 · la pantalla ya sabe quién es", async () => {
    // La queja de Doug, literal: "it doesn't recognize that I already have an
    // account... it let me in as if I didn't have an account". La cuenta se
    // creó en el primer paso con este mismo correo, así que aquí la app tiene
    // que decirlo en vez de ofrecerle crear otra.
    //
    // Este acto es el ÚNICO sitio donde esto se puede ver: las dos suites de
    // CI vacían las claves de Supabase a propósito, así que allí no hay
    // cuentas que reconocer y la invitación no se pinta en absoluto.
    await expect(
      page.getByText(/There's already an account with this email/)
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Create an account/ })).toHaveCount(0);
    await mirar(page, 3000);
  });

  await test.step("R-4 · entrar trae la solicitud sola", async () => {
    await page.getByRole("link", { name: "Log in", exact: true }).click();
    await page.waitForURL("**/login");
    await mirar(page, 1800);

    await page.getByLabel("Email").fill(QA.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await mirar(page, 1500);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/requests");

    // LA PRUEBA: la fila ya está, sin haber tecleado el número en ningún momento.
    await expect(page.getByText(claimNumber)).toBeVisible();
    await mirar(page, 4000);
  });

  await test.step("R-4 · la cookie de reclamante se gastó", async () => {
    await page.goto("/claim");
    // Ya no hay nada que retomar ahí: la cookie se gastó al enganchar y la
    // reclamación vive en la cuenta. Rebota, y no importa adónde.
    await expect(page).not.toHaveURL(/\/claim/);
    await mirar(page, 2000);

    // ADÓNDE rebota SÍ cambió con R-6, y este paso lo cazó en vivo. Antes
    // encadenaba hasta /requests, porque /guarantee expulsaba a las cuentas sin
    // compra vinculada. Ya no las expulsa, así que ahí se queda: el middleware
    // manda a /guarantee desde la raíz y esa página ahora funciona. Nadie se
    // pierde, Requests está a una pestaña, pero la aplicación tiene dos casas
    // para el mismo visitante y cuál es la buena está sin decidir.
    await page.getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Requests" })
      .click();
    await page.waitForURL("**/requests");
    await expect(page.getByText(claimNumber)).toBeVisible();
    await mirar(page, 2500);

    const fijado = (v?: string) => (v ? "   (fijado a mano)" : "");
    console.log(
      [
        "",
        "  ─── esta corrida ──────────────────────────────",
        `  correo:      ${QA.email}${fijado(process.env.QA_EMAIL)}`,
        `  contraseña:  ${PASSWORD}${fijado(process.env.QA_PASSWORD)}`,
        `  teléfono:    ${QA.phone}${fijado(process.env.QA_PHONE)}`,
        `  reclamación: ${claimNumber}`,
        "  ───────────────────────────────────────────────",
        "",
      ].join("\n")
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Acto 2 · la cuenta: R-6, R-5 y R-7                                         */
/* -------------------------------------------------------------------------- */
//
// Este acto se fabrica su propia compra y se la lleva al terminar. La
// aplicación no sabe desvincular (no existe ningún desvincular en todo el
// repositorio, y es uno de los dos huecos que salieron en la revisión de R-4),
// así que tomar prestada una garantía de la semilla la gastaría para siempre,
// una corrida cada vez. Con la clave de servicio se puede hacer lo que la
// aplicación no ofrece. Ver e2e/walk/support.ts.

test("acto 2 · la cuenta: R-6, R-5 y R-7", async ({ page, request }) => {
  test.setTimeout(300_000);

  const marca = sufijo();
  const correo = `qa-${marca}@rapqa.com`;
  let compra: QaPurchase | null = null;

  try {
    await test.step("Una cuenta nueva, sin ninguna compra vinculada", async () => {
      // El cliente mayoritario de la v3: presentó una reclamación anónima y
      // solo después se hizo la cuenta. Nunca vinculó nada.
      await page.goto("/signup");
      await page.getByLabel("Email").fill(correo);
      await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
      await mirar(page, 1800);
      await page.getByRole("button", { name: "Create my account" }).click();
      await page.waitForURL("**/requests");
      await mirar(page, 2000);
    });

    await test.step("R-6 · la barra ofrece tres pestañas, no una", async () => {
      // Emy, leída por Doug: "logged in as customer, stuck on request page,
      // would not go to guarantee nor shop". Guarantee y Shop rebotaban, así
      // que R-1 escondía las dos pestañas antes que ofrecer una puerta que se
      // cierra. Ahora las páginas funcionan y las pestañas pueden estar.
      const barra = page.getByRole("navigation", { name: "Primary" });
      await expect(barra.getByRole("link", { name: "Guarantee" })).toBeVisible();
      await expect(barra.getByRole("link", { name: "Shop" })).toBeVisible();
      await mirar(page, 2200);
    });

    await test.step("R-6 · la garantía, sin compra, sigue siendo la garantía", async () => {
      await page.getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Guarantee" })
        .click();
      await page.waitForURL("**/guarantee");
      await expect(page.getByRole("heading", { name: /90-Night Comfort Guarantee/ })).toBeVisible();
      // Sin conteo de noches y sin botón de cambio: no hay compra que cambiar,
      // y un botón gris bajo un mensaje de elegibilidad inventaría un estado.
      await expect(page.getByText(/DAY \d+ \/ 90/)).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Request an exchange" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "The essentials" })).toBeVisible();
      await mirar(page, 3200);
    });

    await test.step("R-6 · y la salida del final NO rebota", async () => {
      // El defecto que casi se va: esta página enlazaba a /guarantee/help, que
      // seguía exigiendo compra vinculada. La queja de Emy reproducida un nivel
      // más abajo, en la página construida para arreglarla.
      await page.getByRole("link", { name: /Something else/ }).click();
      await page.waitForURL("**/guarantee/help");
      await expect(page.getByRole("heading", { name: /Something other than comfort/ })).toBeVisible();
      await expect(page.getByText(/1-855-513-5435/)).toBeVisible();
      await mirar(page, 3000);
    });

    await test.step("R-6 · la tienda, con catálogo y sin cupón", async () => {
      await page.goto("/shop");
      await expect(page.getByRole("heading", { name: /A few things for better sleep/ })).toBeVisible();
      await expect(page.getByText(/The dealer coupon is issued against a purchase/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /Get my coupon/i })).toHaveCount(0);
      await mirar(page, 2800);
    });

    await test.step("R-7 · el endpoint de TTC no existe todavía", async () => {
      // Doug lo pidió y dijo en la misma frase "we need to talk about the
      // communication". Esa conversación no ha ocurrido, así que nace apagado.
      const res = await request.post("/api/ttc", {
        data: { claimNumber: "CG7MKQ42", ttcClaim: "TTC-9912" },
        headers: { authorization: "Bearer loquesea" },
      });
      expect(res.status()).toBe(501);
      expect((await res.json()).code).toBe("feature_off");
    });

    await test.step("Una compra nuestra, para poder mirar R-5", async () => {
      const nueva = await createQaPurchase(marca);
      compra = nueva;
      await page.goto("/link");
      await page.getByLabel("Sales order or claim number").fill(nueva.salesOrderNumber);
      await page.getByLabel("Last name", { exact: true }).fill(nueva.lastName);
      await mirar(page, 1800);
      await page.getByRole("button", { name: /Link my purchase|Find my purchase|Continue/ }).click();
      await page.waitForURL(/\/(guarantee|requests)/);
      await mirar(page, 2200);
    });

    await test.step("R-5 · a quien no tiene nada no se le pregunta nada", async () => {
      await page.goto("/fitting");
      await expect(page.getByLabel("Your experience")).toBeVisible();
      await expect(page.getByRole("button", { name: /Pick it up/ })).toHaveCount(0);
      await mirar(page, 2400);
    });

    await test.step("Dejar una solicitud a medias", async () => {
      await page.getByLabel("Your experience").fill("Demasiado firme para mí.");
      await page.getByLabel("What you'd rather have").fill("Algo más blando.");
      await page.getByRole("button", { name: /Next — the mattress/ }).click();
      await expect(page.getByText(/model number/i).first()).toBeVisible({ timeout: 15000 });
      await mirar(page, 2000);
    });

    await test.step("R-5 · al volver, la app pregunta en vez de decidir", async () => {
      // Doug: "we should ask, is this a new claim or an existing one?". Antes
      // reanudaba el borrador en silencio y no ofrecía la otra opción.
      await page.goto("/fitting");
      await expect(page.getByText(/already have a request under way/i)).toBeVisible();
      await expect(page.getByText(/one request going at a time/i)).toBeVisible();
      await expect(page.getByRole("link", { name: "Not now, see my requests" })).toBeVisible();
      await mirar(page, 4000);

      await page.getByRole("button", { name: "Pick it up where I left off" }).click();
      await expect(page.getByText(/model number/i).first()).toBeVisible();
      await mirar(page, 2500);
    });

    console.log(
      [
        "",
        "  ─── acto 2 ────────────────────────────────────",
        `  cuenta:      ${correo}`,
        `  contraseña:  ${PASSWORD}`,
        `  compra QA:   ${(compra as QaPurchase | null)?.salesOrderNumber ?? "(no llegó a crearse)"}`,
        "  ───────────────────────────────────────────────",
        "",
      ].join("\n")
    );
  } finally {
    // Siempre, aunque el acto se caiga a mitad: la cascada de `claims` sobre
    // `guarantees` se lleva la solicitud con ella, así que no se acumula nada.
    if (compra) await removeQaPurchase(compra);
  }
});
