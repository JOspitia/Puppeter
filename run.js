import { obtenerLicenciaESET } from './eset-license.js';

const resultado = await obtenerLicenciaESET({
    headless: false,
    guardarEn: 'licencia-eset.txt',
});

console.log('\n=== RESULTADO ===');
console.log('email  :', resultado.email);
console.log('licencia:', resultado.licencia ?? 'NO OBTENIDA');
console.log('pasos  :', resultado.pasos.join(' -> '));
