# Recorrido en vivo (`e2e/walk/`)

Una corrida de Playwright **con la ventana visible y a cámara lenta**, que camina
la guía `test-guide.html` de principio a fin, R-1 a R-4: la cuenta de QA, la
barra sin pestañas, el Atrás junto al Next, el par de fechas imposible de Emy,
el envío con su número `CG######`, y el inicio de sesión que trae la solicitud
sola.

Sirve para mirar el flujo, para enseñárselo a alguien, o para dejar una
reclamación de prueba en el dashboard sin teclearla a mano.

> **Escribe en el Supabase de verdad.** A diferencia de las dos suites reales,
> esta configuración **no** vacía las claves: R-4 es entrar a una cuenta, y sin
> autenticación real no existe. Cada corrida deja una cuenta y una reclamación
> en el proyecto. De ahí la convención de QA. Requiere además que la
> confirmación de correo de Supabase esté **apagada**, que es como está hoy;
> si se enciende, el alta se queda esperando un buzón que Playwright no puede
> abrir, y hay que pasarle una cuenta ya confirmada con `QA_EMAIL`.

**No es parte de ninguna suite.** `npm run test:e2e` no la ejecuta, y no corre en
CI. Vive aparte a propósito: usa su propio puerto (3102) y su propia
configuración, `playwright.walk.config.ts`.

## Correrlo

```powershell
npx playwright test -c playwright.walk.config.ts
```

Tarda algo menos de dos minutos. Al final imprime el correo, la contraseña, el
teléfono y el número de reclamación que salieron.

## Datos de contacto

**Por defecto son aleatorios en cada corrida**, para que las reclamaciones no se
pisen y se puedan distinguir en el dashboard:

- correo `qa-xxxxxx@rapqa.com`
- teléfono `000` más siete dígitos
- contraseña `Rapqa-2026`, fija, y fijable con `QA_PASSWORD`

El correo es **el mismo** para la cuenta y para el formulario de la reclamación,
y eso no es casualidad: es justo la condición que R-4 exige para enganchar.

Todo lo demás es fijo y sale de la guía: nombre `Adrian`, apellido `Smith`,
pedido `1011099600S` y modelo `CM-QUEEN-01`.

## Fijar el contacto a mano

Cuando quieras repetir un caso concreto, o buscar después esa reclamación:

```powershell
$env:QA_EMAIL="adrian.prueba@rapqa.com"; npx playwright test -c playwright.walk.config.ts
$env:QA_PHONE="0009998888";              npx playwright test -c playwright.walk.config.ts
```

Pasar uno no fija el otro: el que falte sigue siendo aleatorio. Si el valor no
pasa la validación de la app (forma de correo, o siete dígitos como mínimo en el
teléfono), el test falla al arrancar con el motivo, en vez de estrellarse a
mitad del formulario.

Si pasas un correo de otro dominio, se respeta. La convención `@rapqa.com` rige
lo aleatorio, no lo que escribas a mano.

> **Cuidado en PowerShell.** La variable se queda pegada en esa terminal hasta
> que la borres, así que las corridas siguientes en la misma ventana la seguirán
> usando y va a parecer que el aleatorio dejó de funcionar. Para limpiarla:
>
> ```powershell
> Remove-Item Env:QA_EMAIL
> Remove-Item Env:QA_PHONE
> ```

## Ajustar el ritmo

En `playwright.walk.config.ts`:

- `launchOptions.slowMo` (hoy `420`) es la pausa entre acciones del navegador.
- Las esperas de cada bloque están en la función `mirar()` del propio spec.

Subir `slowMo` a `900` deja el recorrido en unos dos minutos, más cómodo para
mirarlo acompañado.

## Fechas

Ya no caducan. El perfil A se calcula desde el reloj (`entrega = hoy menos 45
días`, `compra = hoy menos 52`), así que la aserción `night 45 of your 90` vale
cualquier día. Las fechas fijas anteriores solo daban esa cuenta el 20 de agosto
de 2026.

El par imposible de Emy sí va con literales, y puede: "comprado después de
entregado" es cierto cualquier día del año.
