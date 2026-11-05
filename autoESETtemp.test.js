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


        //await page.goto('https://temp-mail.org/es/')

        //await page.waitForFunction(() => {
         //   const input = document.querySelector('#mail');
          //  return input && input.value && !input.value.startsWith('Cargando');
        //}, {
          //  timeout: 30000
        //});

        //const email = await page.$eval('#mail', el => el.value);//

        const page2 = await browser.newPage()
        await page2.goto('https://login.eset.com/login')

        await page2.click('#root > div > div > div.css-15ugwsr > div > div > div > div > div:nth-child(2) > div > div > div:nth-child(4) > p > a')
       
        await new Promise(resolve => setTimeout(resolve, 2000))

        await page2.click('#cc-accept > i18n-text')

        await page2.type('#email','fafora8419@fishnone.com',{delay:1})
        await page2.type('#password','Prueba123*',{delay:1})
        await page2.click('#root > div > div > div.css-15ugwsr > div > div > div > div > div:nth-child(2) > div > form > button > span')

        await page2.click('#root > div > div.css-15t5msr > div > div > div > div.css-13pia71 > button > span')

        await page2.type('#email','fafora8419@fishnone.com',{delay:1})
        await page2.type('#password','Prueba123*',{delay:1})

        await page2.click('#root > div > div > div.css-15ugwsr > div > div > div > div > div:nth-child(2) > div > form > div.css-e6h2vz > button > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-26gxmu > div > div.css-bpk347 > div:nth-child(1) > button > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-1fw062a > div > div > div.css-eeb0sn > label:nth-child(3) > span > span.css-2h9q4w > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-bpk347 > div:nth-child(2) > button > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-1fw062a > div > div > div.css-eeb0sn > label:nth-child(1) > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-bpk347 > div:nth-child(2) > button > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-zmvv4k > button > span')

        await page2.type('#name','prueba',{delay:1})

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-zmvv4k > button > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-zmvv4k > button > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-1fw062a > div > div > div.css-eeb0sn > label:nth-child(1) > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-zmvv4k > button > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1siz9ha > div > div.css-bpk347 > div:nth-child(1) > button > span')

        await page2.click('#root > div > div > div > main > div > div > div.css-1u007ep > div > div > div > div > div.css-10kl263 > div:nth-child(2) > div > button > div > div > div.css-1ctt6ux > div.css-usduim')

        await page2.click('#root > div > div > div > main > div.css-b03p1p > div > div.css-mc048b > div > div > div.css-1a5kozx > div > div > div > div > button > span')

        const texto = await page.$eval('#root > div > div > div > main > div > div > div.css-mc048b > div > div > div.css-1mwdxn9 > div.css-gxvy4m > div > div > div > div:nth-child(1) > div:nth-child(2) > div:nth-child(6) > div > div > p', el => el.textContent)

        console.log(texto)

        await new Promise(resolve => setTimeout(resolve, 2000))


        //await browser.close()

    },50000)

})

//#tm-body > main > div:nth-child(1) > div > div.col-sm-12.col-md-12.col-lg-12.col-xl-8 > div.tm-content > div > div.inboxWarpMain > div > div.inbox-dataList > ul > li:nth-child(3) > div:nth-child(1)

//#tm-body > main > div:nth-child(1) > div > div.col-sm-12.col-md-12.col-lg-12.col-xl-8 > div.tm-content > div > div.inboxWarpMain > div > div.inbox-data-content > div.inbox-data-content-intro > table > tbody > tr:nth-child(2) > td > table > tbody > tr > td > a