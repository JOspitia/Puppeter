import { obtenerLicenciaESET } from '../eset-license.js';

describe('ESET HOME - licencia de prueba automatica', () => {

    it('Debe de crear la cuenta, activar la prueba de 30 dias y devolver la llave', async () => {

        const { email, licencia, error } = await obtenerLicenciaESET({
            headless: false,
            guardarEn: 'licencia-eset.txt',
            log: (...args) => console.log(...args),
        });

        expect(error).toBeUndefined();
        expect(email).toMatch(/@/);
        // formato de llave de ESET: bloques alfanumericos separados por guiones
        expect(licencia).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3,5}$/);

        console.log(`\nEMAIL   : ${email}`);
        console.log(`LICENCIA: ${licencia}`);

    }, 600000)

})
