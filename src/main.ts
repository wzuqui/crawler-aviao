import * as axios from 'axios';
import * as fs from 'node:fs/promises';
import { BrowserContext, chromium } from 'playwright';

import { Logger } from './logger';

type Voo = {
  origin: string;
  destination: string;
  menor_valor?: Valor;
};

type Valor = {
  hora_partida: string;
  hora_chegada: string;
  empresa: string;
  tempo: string;
  escala: string;
  valor: number;
};

type Dia = {
  data: string;
  voos: Voo[];
  menor_valor?: Valor;
};

type Config = {
  url: string;
  webhook: string;
  dias?: Dia[];
};

const config: Config = {
  url: 'https://www.google.com/travel/flights?gl=BR&hl=pt-BR',
  // prettier-ignore
  webhook: 'https://ravex.webhook.office.com/webhookb2/165e6bd9-71bc-4844-8ddf-8d8dd6f021f0@b18a2de8-4882-4ea0-b368-107cf188e7fc/IncomingWebhook/295c89e4b8ef4a7fa7517723e776c8b7/9d55148c-0962-48df-ae14-01e4c392eb63',
};

const logger = new Logger();
let rodando = true;

(async () => {
  const browser = await chromium.launch({
    headless: false,
  });
  const context = await browser.newContext({
    screen: { height: 800, width: 800 },
  });
  await context.newPage();

  let dias = await fs.readFile('src/dias.json', 'utf-8');
  config.dias = JSON.parse(dias);

  if (config.dias === undefined) {
    logger.error('Não foi possível carregar os dias');
    return;
  }
  while (rodando) {
    try {
      for (const dia of config.dias) {
        const voos = dia.voos;
        for (const voo of voos) {
          await buscarVoo(context, dia.data, voo);
        }
        const menor_valor = voos.filter((p) => p.menor_valor !== undefined).sort((a, b) => a.menor_valor!.valor - b.menor_valor!.valor)[0];
        if (dia.menor_valor === undefined) {
          dia.menor_valor = menor_valor.menor_valor;
          await encontradoMenorValor(dia);
        } else {
          if (dia.menor_valor.valor > menor_valor.menor_valor!.valor) {
            dia.menor_valor = menor_valor.menor_valor;
            await encontradoMenorValor(dia);
          }
        }
      }
      logger.log(`Persistindo dados...`);
      await fs.writeFile('src/dias.json', JSON.stringify(config.dias, null, 2));

      const minutos = 0.5;
      logger.log(`Aguardando ${minutos} minutos`);
      await aguardarTempo(minutos * 60 * 1000);
    } catch (e) {
      logger.error(e);
    }
  }
})();

process.on('SIGTERM', async () => {
  logger.log('Encerrando via SIGTERM');
  rodando = false;
});

async function encontradoMenorValor(dia: Dia) {
  if (dia.menor_valor === undefined) {
    return;
  }
  logger.log(`============== Encontrado menor valor pada o dia (${dia.data})`, dia.menor_valor);
  await enviarWebhook(dia);
}

async function buscarVoo(context: BrowserContext, data: string, voo: Voo) {
  logger.log(`Buscando voo de ${voo.origin} para ${voo.destination} no dia ${data}`);
  const page = await context.newPage();
  await page.goto(config.url);
  await aguardarTempo(1000);
  const ida_e_volta_element = page.locator('div[role="combobox"]', { hasText: 'Ida e volta' }).first();
  await aguardarTempo(1000);
  await ida_e_volta_element.click();
  await aguardarTempo(1000);

  const so_ida_element = page.locator('li', { hasText: 'Só ida' }).first();
  await so_ida_element.click();

  const origin_element = page.locator('input[value="Navegantes"]');
  origin_element.fill(voo.origin);
  const origem_option = page.locator('li', { hasText: voo.origin }).first();
  await origem_option.click();

  const destino_element = page.locator('input[placeholder="Para onde?"]');
  await destino_element.fill(voo.destination);
  await aguardarTempo(1000);

  const destino_option = page.locator('li', { hasText: voo.destination }).first();
  await destino_option.click();

  const partida1_element = page.locator('input[placeholder="Partida"]').first();
  await partida1_element.click();

  const partida2_element = page.locator('input[placeholder="Partida"]').last();
  partida2_element.fill(data);

  const concluido_element = page.locator('button', { hasText: 'Concluído' }).last();
  await concluido_element.click();

  await aguardarTempo(1000);
  const pesquisar_element = page.locator('button', { hasText: 'Pesquisar' }).first();
  await pesquisar_element.click();

  await aguardarTempo(3000);
  const results = await page.locator('li', { has: page.locator('[role=link]') }).allInnerTexts();

  const resultados = results.map(sanitizar);

  const menor_valor = resultados.sort((a, b) => a.valor - b.valor)[0];
  logger.log(`Menor valor encontrado: R$ ${menor_valor.valor} da ${menor_valor.empresa}`);
  if (voo.menor_valor === undefined) {
    voo.menor_valor = menor_valor;
  } else {
    if (voo.menor_valor.valor > menor_valor.valor) {
      voo.menor_valor = menor_valor;
    }
  }
  page.close();
}

async function aguardarTempo(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sanitizar(data: string): Valor {
  const [hora_partida, _, hora_chegada, empresa, tempo, __, escala, ___, ____, _____] = data.split('\n');
  const valor = data.split('\n').find((p) => p.includes('R$')) ?? '999999';
  const retorno = {
    hora_partida,
    hora_chegada,
    empresa,
    tempo,
    escala,
    valor: +valor.replace('R$', '').replace('.', ''),
  };

  return retorno;
}

async function enviarWebhook(dia: Dia) {
  const mensagem = [
    'Menor valor encontrado para o dia',
    dia.data,
    'é: R$ ',
    dia.menor_valor?.valor,
    'da empresa',
    dia.menor_valor?.empresa,
    'com tempo de',
    dia.menor_valor?.tempo,
    ' ',
    dia.menor_valor?.escala,
  ].join(' ');
  const body = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          type: 'AdaptiveCard',
          body: [
            {
              type: 'TextBlock',
              size: 'Medium',
              text: mensagem,
              wrap: true,
            },
          ],
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.5',
        },
      },
    ],
  };
  await axios.default.post(config.webhook, body);
}
