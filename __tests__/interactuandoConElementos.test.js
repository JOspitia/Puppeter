import puppeteer from 'puppeteer';

describe('Interactuando con elementos', () => {

    it('Debe de abrir y cerrar el navegador', async () => {

        const browser = await puppeteer.launch({

            headless: false,
            defaultViewport: null,
            //args: ['--window-size=1920,1080']
            args: ['--disable-notifications'],
            slowMo: 100,
            devtools: false,

        })

        const page = await browser.newPage()
        
        page.on('dialog', async dialog => {
            await dialog.accept();
        });


        await page.goto('https://demo.guru99.com/test/simple_context_menu.html')

        //Click derecho

        await page.click('#authentication > span', {button:'right', delay:500})
        await page.click('#authentication > span')
        
        //Doble click

        await page.click('#authentication > button', {count: 2, delay:500})

        //Escribir en un campos de texto

        await page.goto('https://devexpress.github.io/testcafe/example/')
        await page.type('#developer-name', 'Fabian',{delay:100})

        //Seleccionar un checkbox

        await page.click('#remote-testing')
        await page.click('#tried-test-cafe')


        //Escribir en un campos de area de texto

        await page.type('#comments','Prueba \n Salto de linea')

        //Seleccionar un radio button

        await page.click('#windows')

        //Dar click en un boton

        await page.click('#submit-button')

        await new Promise(resolve => setTimeout(resolve, 2000))

        await browser.close()

    },50000)

})