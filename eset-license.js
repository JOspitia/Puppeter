/**
 * Automatizacion completa para obtener una llave de licencia de ESET HOME.
 *
 * Flujo:
 *   1. correo temporal   -> mail.tm (API, sin navegador) con respaldo en temp-mail.org
 *   2. login.eset.com    -> alta de cuenta (email + password)
 *   3. correo de ESET    -> enlace de verificacion "Confirm registration"
 *   4. home.eset.com     -> onboarding: "Start a free 30-day trial" + ambito + dispositivos
 *   5. home.eset.com     -> detalle de la licencia -> llave
 *
 * Todos los selectores de la app ESET usan el atributo estable [data-label],
 * no las clases CSS generadas (css-xxxx) que cambian en cada build.
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'node:fs';
import path from 'node:path';

puppeteer.use(StealthPlugin());

export const CHROME_SISTEMA = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/** Guardia global: nada puede quedarse colgado indefinidamente. */
export const TIMEOUT_GLOBAL_MS = Number(process.env.ESET_TIMEOUT_MS || 8 * 60 * 1000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Promesa con limite de tiempo y mensaje claro. */
async function conTimeout(promesa, ms, mensaje) {
    let timer;
    try {
        return await Promise.race([
            promesa,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`TIMEOUT (${ms} ms): ${mensaje}`)), ms);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

/* ------------------------------------------------------------------ *
 *  Proveedores de correo temporal
 * ------------------------------------------------------------------ */

/**
 * mail.tm - todo por API REST, sin navegador y sin Cloudflare.
 * Devuelve { direccion, password, leerEnlace() }.
 */
export async function crearMailboxMailTm({ password = 'Prueba123*', log = () => { } } = {}) {
    const dominios = await (await fetch('https://api.mail.tm/domains?page=1')).json();
    const disponibles = dominios['hydra:member'].filter(d => d.isActive && !d.isPrivate);
    if (!disponibles.length) throw new Error('mail.tm no devolvio dominios activos');

    let direccion = null;
    for (let intento = 0; intento < 5 && !direccion; intento++) {
        const dominio = disponibles[intento % disponibles.length].domain;
        const local = `eset${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        const candidate = `${local}@${dominio}`;
        const r = await fetch('https://api.mail.tm/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: candidate, password }),
        });
        if (r.ok) direccion = candidate;
        else if (r.status === 422) log(`      mail.tm: ${candidate} ocupado, probando otro`);
        else throw new Error(`mail.tm alta HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    }
    if (!direccion) throw new Error('mail.tm no entrego ninguna direccion valida');

    const tr = await fetch('https://api.mail.tm/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: direccion, password }),
    });
    if (!tr.ok) throw new Error(`mail.tm token HTTP ${tr.status}`);
    const { token } = await tr.json();
    log(`      mail.tm: ${direccion}`);

    /** Busca el correo de verificacion de ESET y devuelve el enlace de confirmacion. */
    const leerEnlace = async ({ intentos = 40, espera = 5000 } = {}) => {
        for (let i = 0; i < intentos; i++) {
            const r = await fetch('https://api.mail.tm/messages?page=1', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (r.ok) {
                const { 'hydra:member': msgs = [] } = await r.json();
                // en mail.tm "from" es un objeto {address, name}, no un string
                const eset = msgs.find(m => {
                    const de = `${m.from?.address || ''} ${m.from?.name || ''}`;
                    return /eset/i.test(de) || /confirm|verif|registro/i.test(`${m.subject || ''} ${m.intro || ''}`);
                });
                if (eset) {
                    const det = await (await fetch(`https://api.mail.tm/messages/${eset.id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })).json();
                    const cuerpo = `${det.text || ''} ${det.html || ''}`;
                    const m = cuerpo.match(/https:\/\/login\.eset\.com\/link\/confirmregistration\?token=[A-Za-z0-9\-._~]+/);
                    if (m) return m[0];
                    const alt = cuerpo.match(/https?:\/\/[^\s"'<>]*confirmregistration[^\s"'<>]*/i);
                    if (alt) return alt[0];
                    throw new Error('El correo de ESET no traia enlace de confirmacion');
                }
            }
            await sleep(espera);
        }
        throw new Error('El correo de verificacion de ESET no llego a mail.tm');
    };

    return { direccion, password, leerEnlace, proveedor: 'mail.tm' };
}

/**
 * temp-mail.org - via navegador. Se usa de respaldo cuando mail.tm falla.
 * Devuelve { direccion, password, leerEnlace() }.
 */
export async function crearMailboxTempMailOrg(browser, { password = 'Prueba123*', log = () => { } } = {}) {
    const mailPage = await browser.newPage();
    mailPage.on('dialog', d => d.accept().catch(() => { }));

    await mailPage.goto('https://temp-mail.org/es/', { waitUntil: 'domcontentloaded' });
    await mailPage.waitForFunction(() => {
        const i = document.querySelector('#mail');
        return i && i.value && !i.value.startsWith('Cargando');
    }, { timeout: 45000 });
    const direccion = await mailPage.$eval('#mail', el => el.value.trim());
    log(`      temp-mail.org: ${direccion}`);

    const leerEnlace = async ({ intentos = 24, espera = 5000 } = {}) => {
        let vista = null;
        for (let i = 0; i < intentos && !vista; i++) {
            vista = await mailPage.evaluate(() => {
                const li = [...document.querySelectorAll('.inbox-dataList li')]
                    .find(l => /eset/i.test(l.innerText || ''));
                const a = li && li.querySelector('a');
                return a ? a.href : null;
            }).catch(() => null);
            if (!vista) await sleep(espera);
        }
        if (!vista) throw new Error('El correo de verificacion de ESET no llego a temp-mail.org');

        const visor = await browser.newPage();
        await visor.goto(vista, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(3000);
        const enlace = await visor.evaluate(() => {
            const a = [...document.querySelectorAll('a')]
                .find(x => /confirmregistration|verify|confirm/i.test(x.getAttribute('href') || ''));
            return a ? a.href : null;
        }).catch(() => null);
        await visor.close().catch(() => { });
        if (!enlace) throw new Error('El correo no contenia enlace de verificacion');
        return enlace;
    };

    return { direccion, password, leerEnlace, proveedor: 'temp-mail.org' };
}

/* ------------------------------------------------------------------ *
 *  Utilidades de interaccion
 * ------------------------------------------------------------------ */

/** Click por texto visible, ignorando botones deshabilitados. */
async function clicPorTexto(page, patron, { timeout = 20000 } = {}) {
    const src = patron.source;
    const fin = Date.now() + timeout;
    while (Date.now() < fin) {
        let ok = null;
        try {
            ok = await page.evaluate((s) => {
                const re = new RegExp(s, 'i');
                const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                const isOff = el => el.disabled === true || el.getAttribute('aria-disabled') === 'true';
                const txt = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
                const hit = [...document.querySelectorAll('button, a, label, [role=button]')]
                    .filter(isVis).filter(el => !isOff(el))
                    .map(el => ({ el, t: txt(el) }))
                    .find(c => c.t && c.t.length < 60 && re.test(c.t));
                if (hit) { hit.el.click(); return hit.t; }
                return null;
            }, src);
        } catch (e) {
            ok = null; // frame navegado: reintentar
        }
        if (ok) return ok;
        await sleep(400);
    }
    throw new Error(`TIMEOUT: no se encontro el elemento de texto /${src}/`);
}

/** Click por atributo data-label estable de la app ESET. */
async function clicPorDataLabel(page, dl, { timeout = 20000 } = {}) {
    const sel = `[data-label="${dl}"]`;
    try {
        await page.waitForSelector(sel, { visible: true, timeout });
        await page.click(sel);
        return dl;
    } catch (e) {
        throw new Error(`TIMEOUT: no se encontro [data-label="${dl}"]`);
    }
}

/** Selecciona la primera tarjeta elegible (radio oculto dentro de un label). */
async function seleccionarTarjeta(page, { timeout = 10000 } = {}) {
    const fin = Date.now() + timeout;
    while (Date.now() < fin) {
        let r = null;
        try {
            r = await page.evaluate(() => {
                const isVis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
                const txt = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
                const cards = [...document.querySelectorAll('[data-label*="card-"], [data-label*="-card"]')]
                    .filter(isVis)
                    .filter(el => el.tagName === 'LABEL' || el.getAttribute('role') === 'radio' || el.querySelector('input'));
                const libre = cards.find(el => {
                    const radio = el.matches('input[type=radio]') ? el : el.querySelector('input[type=radio]');
                    return radio ? !radio.checked : true;
                });
                if (!libre) return null;
                libre.click();
                return { dl: libre.getAttribute('data-label'), texto: txt(libre).slice(0, 60) };
            });
        } catch (e) { r = null; }
        if (r) return r;
        await sleep(400);
    }
    return null;
}

/** Rellena los campos de texto visibles que esten vacios. */
async function rellenarCampos(page, valor = 'Prueba') {
    try {
        return await page.evaluate((v) => {
            const isVis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
            const campos = [...document.querySelectorAll('input[type=text], input[type=email], input:not([type])')].filter(isVis);
            let count = 0;
            for (const c of campos) {
                if (!c.value) {
                    c.focus();
                    c.value = v;
                    c.dispatchEvent(new Event('input', { bubbles: true }));
                    c.dispatchEvent(new Event('change', { bubbles: true }));
                    count++;
                }
            }
            return count;
        }, valor);
    } catch (e) { return 0; }
}

/** Estado resumido de la pagina para diagnostico. */
async function estado(page) {
    try {
        return await page.evaluate(() => {
            const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const txt = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
            return {
                url: location.href,
                botones: [...document.querySelectorAll('button')].filter(isVis).map(b => ({
                    texto: txt(b).slice(0, 50),
                    dl: b.getAttribute('data-label') || '',
                    off: b.disabled === true,
                })),
                labels: [...document.querySelectorAll('label')].filter(isVis).map(l => ({
                    texto: txt(l).slice(0, 50),
                    dl: l.getAttribute('data-label') || '',
                })),
                campos: [...document.querySelectorAll('input, textarea, select')].filter(isVis).map(i => ({
                    id: i.id, tipo: i.type, ph: i.placeholder || '', valor: i.value || '',
                })),
                nav: [...document.querySelectorAll('nav a, aside a, header a, [role=navigation] a')]
                    .filter(isVis)
                    .map(a => ({ t: txt(a).slice(0, 30), href: (a.getAttribute('href') || '').slice(0, 50), dl: a.getAttribute('data-label') || '' }))
                    .filter(x => x.t),
                texto: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 700),
            };
        });
    } catch (e) {
        return { url: '(frame detached)', botones: [], labels: [], campos: [], nav: [], texto: e.message };
    }
}

/* ------------------------------------------------------------------ *
 *  Pasos del flujo ESET
 * ------------------------------------------------------------------ */

/** 2. Alta de cuenta en login.eset.com */
export async function registrarCuenta(page, email, password = 'Prueba123*') {
    await page.goto('https://login.eset.com/register', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500);
    const cc = await page.$('#cc-accept');
    if (cc) { await cc.click(); await sleep(1000); }
    await page.type('#email', email, { delay: 4 });
    await page.type('#password', password, { delay: 4 });
    await clicPorDataLabel(page, 'register-create-account-button');
    await sleep(5000);
}

/** Comprueba que ESET acepto el alta (si no, muestra el error de la web). */
export async function registroAceptado(page, { timeout = 20000 } = {}) {
    const fin = Date.now() + timeout;
    while (Date.now() < fin) {
        const st = await estado(page);
        if (/home\.eset\.com/.test(st.url)) return true;
        const error = st.texto.match(/[^.]{0,90}(error|invalid|not allowed|not valid|no permitid|no válido|already exists|disposable)[^.]{0,90}/i);
        if (error) throw new Error(`ESET rechazo el alta: ${error[0].trim().slice(0, 160)}`);
        await sleep(1000);
    }
    throw new Error('ESET no confirmo el alta de la cuenta');
}

/**
 * Tras confirmar el correo ESET no siempre se aterriza en el onboarding:
 * a veces aparece la pantalla de login (login.eset.com/welcome) porque el
 * enlace de confirmacion no deja sesion iniciada. En ese caso se inicia
 * sesion con la misma cuenta y se sigue.
 */
export async function asegurarOnboarding(page, { email, password, log = () => { } } = {}) {
    const fin = Date.now() + 60000;
    while (Date.now() < fin) {
        const onboarding = await page.$('[data-label="onboarding-welcome-continue-btn"]').catch(() => null);
        if (onboarding) return 'onboarding';

        const botonLogin = await page.$('[data-label="log-in-button"]').catch(() => null);
        if (botonLogin) {
            log('      pantalla de login detectada -> iniciando sesion');
            // el login se hace dentro de la pagina: los handles externos se
            // invalidan cuando el banner de cookies re-renderiza el DOM
            const hecho = await page.evaluate(({ email, password }) => {
                const cc = document.querySelector('#cc-accept');
                if (cc) cc.click();
                const setVal = (el, v) => {
                    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                    setter.call(el, v);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                };
                const mail = document.querySelector('[data-label="email-input-input"]');
                const pass = document.querySelector('[data-label="password-input-input"]');
                const btn = document.querySelector('[data-label="log-in-button"]');
                if (!mail || !pass || !btn) return false;
                setVal(mail, email);
                setVal(pass, password);
                btn.click();
                return true;
            }, { email, password });
            if (!hecho) throw new Error('Pantalla de login sin campos de email/password');
            await sleep(6000);
            continue;
        }

        // pantalla intermedia con un boton que lleva a ESET HOME
        const clic = await page.evaluate(() => {
            const isVis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
            const txt = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
            const cands = [...document.querySelectorAll('button, a')].filter(isVis);
            const hit = cands.find(b => /home\.eset\.com/.test(b.getAttribute('href') || ''))
                || cands.find(b => /eset home|continue|continuar|entrar|go to|empezar/i.test(txt(b)));
            if (!hit) return null;
            hit.click();
            return txt(hit).slice(0, 60);
        }).catch(() => null);

        if (clic) { log(`      pantalla intermedia -> "${clic}"`); await sleep(4000); continue; }
        await sleep(1000);
    }
    throw new Error('No se llego a la pantalla de onboarding de ESET HOME');
}

/** 4. Onboarding: activar la prueba gratuita de 30 dias */
export async function activarPruebaGratuita(page, { email, password, log = () => { } } = {}) {
    await asegurarOnboarding(page, { email, password, log });

    // Paso 1 -> carrusel de bienvenida: "Continue" hasta pasar a /onboarding/subscriptions
    await page.waitForSelector('[data-label="onboarding-welcome-continue-btn"]', { timeout: 30000 });
    for (let i = 0; i < 6; i++) {
        if (!page.url().includes('/onboarding/welcome')) break;
        await page.click('[data-label="onboarding-welcome-continue-btn"]').catch(() => { });
        await sleep(2200);
    }

    // Paso 2 -> elegir "Start a free 30-day trial" y continuar
    await page.waitForSelector('[data-label="onboarding-add-subscription-protect-card-trial"]', { timeout: 30000 });
    await page.click('[data-label="onboarding-add-subscription-protect-card-trial"]');
    await sleep(1500);
    await clicPorTexto(page, /^(continue|continuar|siguiente|next)$/);
    await sleep(3000);

    // Paso 3 -> elegir ambito de proteccion (hogar o pequena empresa) y continuar
    await page.waitForSelector('[data-label^="onboarding-trial-protect-card-"]', { timeout: 30000 });
    await seleccionarTarjeta(page);
    await sleep(1500);
    await clicPorTexto(page, /^(continue|continuar|siguiente|next)$/);
    await sleep(3000);
}

/** 5. Extrae la llave del detalle de la licencia */
export async function extraerLlave(page, { timeout = 60000 } = {}) {
    const fin = Date.now() + timeout;
    while (Date.now() < fin) {
        let llave = null;
        try {
            llave = await page.evaluate(() => {
                const el = document.querySelector('[data-label="license-detail-license-key"] p');
                if (!el) return null;
                const t = (el.innerText || '').trim();
                return t && t.length > 8 ? t : null;
            });
        } catch (e) { llave = null; }
        if (llave) return llave;
        await sleep(1000);
    }
    return null;
}

/**
 * Proceso completo. Devuelve { email, licencia, pasos }.
 */
export async function obtenerLicenciaESET({
    headless = false,
    password = 'Prueba123*',
    log = console.log,
    guardarEn = null,
    timeoutGlobal = TIMEOUT_GLOBAL_MS,
    proveedores = ['mail.tm', 'temp-mail.org'],
} = {}) {
    const pasos = [];
    const tiempos = [];
    let browser;

    // Cronometraje: cada linea del log lleva el tiempo transcurrido.
    const t0 = Date.now();
    const fmt = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    const stamp = () => fmt(Date.now() - t0);
    const marca = paso => { tiempos.push({ paso, ms: Date.now() - t0 }); };
    const say = (msg) => log(`[${stamp()}] ${msg}`);

    const correr = async () => {
        browser = await puppeteer.launch({
            executablePath: process.env.ESET_CHROME_PATH || CHROME_SISTEMA,
            headless,
            defaultViewport: null,
            args: ['--disable-notifications', '--window-size=1600,1000', '--lang=es-ES'],
            slowMo: 25,
        });

        let mailbox = null;
        let eset = null;
        let home = null;
        let email = null;

        // 1-3. correo temporal + registro + verificacion (con reintento por proveedor)
        for (const nombre of proveedores) {
            try {
                say(`[1/5] obteniendo correo temporal via ${nombre}...`);
                mailbox = nombre === 'mail.tm'
                    ? await crearMailboxMailTm({ password, log: say })
                    : await crearMailboxTempMailOrg(browser, { password, log: say });
                email = mailbox.direccion;
                marca('correo temporal');

                eset = await browser.newPage();
                eset.on('dialog', d => d.accept().catch(() => { }));
                say(`[2/5] registrando ${email} en login.eset.com...`);
                await registrarCuenta(eset, email, mailbox.password);
                await registroAceptado(eset);
                say(`[2/5] cuenta creada`);
                marca('registro');

                say('[3/5] esperando el correo de verificacion...');
                const enlace = await mailbox.leerEnlace();
                marca('llegada del correo');
                say('[3/5] correo recibido, abriendo el enlace...');
                home = await browser.newPage();
                home.on('dialog', d => d.accept().catch(() => { }));
                await home.goto(enlace, { waitUntil: 'networkidle2', timeout: 60000 });
                await sleep(4000);
                say(`[3/5] correo verificado -> ${home.url()}`);
                marca('verificacion');
                pasos.push('correo temporal', 'registro', 'verificacion');
                break;
            } catch (e) {
                say(`      ${nombre} fallo: ${e.message}`);
                mailbox = null; email = null;
                if (eset) { await eset.close().catch(() => { }); eset = null; }
            }
        }
        if (!home) throw new Error('No se pudo completar el registro con ningun proveedor de correo');

        // 4. prueba gratuita
        await activarPruebaGratuita(home, { email, password: mailbox.password, log: say });
        say(`[4/5] onboarding de prueba -> ${home.url()}`);
        marca('onboarding');
        pasos.push('prueba gratuita');

        // 5. llave
        // la llave no esta todavia en pantalla: 4 s bastan antes de entrar al bucle
        let llave = await extraerLlave(home, { timeout: 4000 });
        if (!llave) llave = await avanzarBuscandoLlave(home, say);
        marca('licencia');
        pasos.push('licencia');

        if (llave) {
            say(`\n*** LLAVE DE LICENCIA ESET ***\n${llave}\n`);
            if (guardarEn) {
                const destino = path.resolve(guardarEn);
                fs.writeFileSync(destino, `ESET HOME - llave de licencia\n${llave}\n`, 'utf8');
                say(`guardada en ${destino}`);
            }
        } else {
            say('\nNo se pudo obtener la llave: se agoto el flujo de pantallas.');
        }

        const total = Date.now() - t0;
        say(`\ndesglose: ${tiempos.map(x => `${x.paso}=${(x.ms / 1000).toFixed(1)}s`).join('  ')}`);
        say(`total: ${(total / 1000).toFixed(1)}s`);

        return { email, licencia: llave, pasos, tiempos, totalMs: total };
    };

    try {
        return await conTimeout(correr(), timeoutGlobal, 'el proceso completo de ESET');
    } catch (e) {
        log(`\nERROR: ${e.message}`);
        return { email: null, licencia: null, pasos, error: e.message };
    } finally {
        if (browser) {
            try { await browser.close(); } catch (e) { /* EPERM en Windows al cerrar el perfil */ }
        }
    }
}

/**
 * Localiza y ejecuta en una sola pasada la primera accion disponible.
 * Antes cada patron se probaba por separado con 2,5 s de timeout cada uno:
 * cuatro patrones fallidos costaban 10 s por iteracion.
 */
async function ejecutarAccion(page, acciones, { timeout = 6000 } = {}) {
    const fin = Date.now() + timeout;
    while (Date.now() < fin) {
        let r = null;
        try {
            r = await page.evaluate((accionesSrc) => {
                const acciones = JSON.parse(accionesSrc);
                const isVis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
                const isOff = el => el.disabled === true || el.getAttribute('aria-disabled') === 'true';
                const txt = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
                const visibles = [...document.querySelectorAll('button, a, label, [role=button]')].filter(isVis);

                // 1) tarjeta sin marcar (debe ir antes de "Continue")
                const cards = visibles.filter(el =>
                    /card-| -card/.test(el.getAttribute('data-label') || '') &&
                    (el.tagName === 'LABEL' || el.getAttribute('role') === 'radio' || el.querySelector('input')));
                const libre = cards.find(el => {
                    const radio = el.matches('input[type=radio]') ? el : el.querySelector('input[type=radio]');
                    return radio ? !radio.checked : true;
                });
                if (libre) { libre.click(); return { tipo: 'tarjeta', texto: txt(libre).slice(0, 60) }; }

                // 2) acciones por prioridad
                for (const acc of acciones) {
                    if (acc.tipo === 'dl') {
                        const el = visibles.find(e => e.getAttribute('data-label') === acc.valor);
                        if (el && !isOff(el)) { el.click(); return { tipo: 'dl', texto: acc.valor }; }
                    } else {
                        const re = new RegExp(acc.patron, 'i');
                        const hit = visibles.map(el => ({ el, t: txt(el) }))
                            .find(c => c.t && c.t.length < 60 && re.test(c.t) && !isOff(c.el));
                        if (hit) { hit.el.click(); return { tipo: 'texto', texto: hit.t }; }
                    }
                }
                return null;
            }, JSON.stringify(acciones));
        } catch (e) { r = null; }
        if (r) return r;
        await sleep(300);
    }
    return null;
}

/** Avanza el flujo de pantallas buscando la llave en cada una. */
async function avanzarBuscandoLlave(page, log) {
    // Orden de prioridad: los botones con data-label son los mas estables.
    const ACCIONES = [
        { tipo: 'dl', valor: 'onboarding-finish-protection-modal-finish-btn' },
        { tipo: 'dl', valor: 'license-list-open-detail-page-btn' },
        { tipo: 'dl', valor: 'onboarding-finish-protection-modal-protect-others-btn' },
        { tipo: 'texto', patron: '^(continue to eset home|go to eset home|ir a eset home|finalizar|finish)$' },
        { tipo: 'texto', patron: '^(open subscription|open license|ver suscripcion|abrir suscripcion)$' },
        { tipo: 'texto', patron: '^(subscriptions?|mis suscripciones?|suscripciones?)$' },
        { tipo: 'texto', patron: '^(licenses?|licencias?)$' },
        { tipo: 'texto', patron: '^(continue|continuar|siguiente|next)$' },
    ];

    for (let i = 0; i < 18; i++) {
        const llave = await extraerLlave(page, { timeout: 1500 });
        if (llave) return llave;

        const st = await estado(page);
        log(`      [${i}] ${st.url}`);
        log(`         texto=${st.texto.slice(0, 130)}`);

        // 1. completar campos de texto vacios
        const rellenados = await rellenarCampos(page);
        if (rellenados) log(`         -> ${rellenados} campo(s) rellenados`);

        // 2. ejecutar la primera accion disponible (tarjeta o boton)
        const acc = await ejecutarAccion(page, ACCIONES, { timeout: 6000 });
        if (!acc) { log('         sin accion posible (ningun boton activo)'); return null; }
        log(`         -> ${acc.tipo}: "${acc.texto}"`);
        await sleep(acc.tipo === 'tarjeta' ? 1200 : 2000);
    }
    return await extraerLlave(page, { timeout: 5000 });
}
