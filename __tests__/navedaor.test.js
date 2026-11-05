import puppeteer from 'puppeteer';

describe('MI primer test en puppeteer', () => {

    it('Debe de abrir y cerrar el navegador', async () => {

        const browser = await puppeteer.launch({

            headless: false,
            defaultViewport: {
                width: 2100,
                height: 1080
            },
            //args: ['--window-size=1920,1080']
            args: ['--disable-notifications'],
            slowMo: 300,
            devtools: false,

        })

        const page = await browser.newPage()
        await page.goto('https://www.fragrantica.es')
        //await new Promise(resolve => setTimeout(resolve, 5000))
        await page.waitForSelector('img')
        //Recargar la pagina
        await page.reload()
        await page.waitForSelector('img')

        //Navegar a otro sitio
        await page.goto('https://platzi.com/')
        await page.waitForSelector('#micro-ui\\.public-header > div > div.styles-module_Logo__y389q.styles-module_Container__Lnmdq > a > svg')
        
        //Navegar hacia atras y adelante

        await page.goBack()
        await page.goForward()
        await page.waitForSelector('img')


        //Abrir otra pestaña

        const page2 = await browser.newPage()
        await page2.goto('https://www.facebook.com/')
        
        await browser.close()

    }, 40000)

})