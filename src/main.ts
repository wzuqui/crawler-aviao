import * as axios from 'axios';
import { BrowserContext, chromium } from 'playwright';

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
  dias: Dia[];
};

const config: Config = {
  url: 'https://www.google.com/travel/flights?gl=BR&hl=pt-BR',
  webhook:
    'https://ravex.webhook.office.com/webhookb2/165e6bd9-71bc-4844-8ddf-8d8dd6f021f0@b18a2de8-4882-4ea0-b368-107cf188e7fc/IncomingWebhook/295c89e4b8ef4a7fa7517723e776c8b7/9d55148c-0962-48df-ae14-01e4c392eb63',
  dias: [
    {
      data: '31/05/2024',
      voos: [
        {
          origin: 'FLN',
          destination: 'XAP',
        },
        {
          origin: 'NVT',
          destination: 'XAP',
        },
        {
          origin: 'JOI',
          destination: 'XAP',
        },
      ],
    },
    {
      data: '02/06/2024',
      voos: [
        {
          origin: 'XAP',
          destination: 'FLN',
        },
        {
          origin: 'XAP',
          destination: 'NVT',
        },
        {
          origin: 'XAP',
          destination: 'JOI',
        },
      ],
    },
  ],
};

(async () => {
  const browser = await chromium.launch({
    headless: false,
  });
  const context = await browser.newContext({
    screen: { height: 800, width: 800 },
  });

  while (true) {
    for (const dia of config.dias) {
      const voos = dia.voos;
      for (const voo of voos) {
        await buscarVoo(context, dia.data, voo);
      }
      const menor_valor = voos
        .filter((p) => p.menor_valor !== undefined)
        .sort((a, b) => a.menor_valor!.valor - b.menor_valor!.valor)[0];
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
    const minutos = 5;
    await aguardarTempo(minutos * 60 * 1000);
  }
})();

async function encontradoMenorValor(dia: Dia) {
  if (dia.menor_valor === undefined) {
    return;
  }
  console.log(
    `Encontrado menor valor pada o dia (${dia.data})`,
    dia.menor_valor
  );
  await enviarWebhook(dia);
}

async function buscarVoo(context: BrowserContext, data: string, voo: Voo) {
  console.log(
    `Buscando voo de ${voo.origin} para ${voo.destination} no dia ${data}`
  );
  const page = await context.newPage();
  await page.goto(config.url);

  const ida_e_volta_element = page
    .locator('div[role="combobox"]', { hasText: 'Ida e volta' })
    .first();
  await ida_e_volta_element.click();

  const so_ida_element = page.locator('li', { hasText: 'Só ida' }).first();
  await so_ida_element.click();

  const origin_element = page.locator('input[value="Navegantes"]');
  origin_element.fill(voo.origin);
  const origem_option = page.locator('li', { hasText: voo.origin }).first();
  await origem_option.click();

  const destino_element = page.locator('input[placeholder="Para onde?"]');
  destino_element.fill(voo.destination);
  const destino_option = page
    .locator('li', { hasText: voo.destination })
    .first();
  await destino_option.click();

  const partida1_element = page.locator('input[placeholder="Partida"]').first();
  await partida1_element.click();

  const partida2_element = page.locator('input[placeholder="Partida"]').last();
  partida2_element.fill(data);

  const concluido_element = page
    .locator('button', { hasText: 'Concluído' })
    .last();
  await concluido_element.click();

  const pesquisar_element = page
    .locator('button', { hasText: 'Pesquisar' })
    .first();
  await pesquisar_element.click();

  await aguardarTempo(3000);
  const results = await page
    .locator('li', { has: page.locator('[role=link]') })
    .allInnerTexts();

  const resultados = results.map(sanitizar);

  const menor_valor = resultados.sort((a, b) => a.valor - b.valor)[0];
  console.log(
    `Menor valor encontrado: R$ ${menor_valor.valor} da ${menor_valor.empresa}`
  );
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
    console.log(`Aguardando ${ms}ms`);
    setTimeout(resolve, ms);
  });
}

function sanitizar(data: string): Valor {
  const [
    hora_partida,
    _,
    hora_chegada,
    empresa,
    tempo,
    __,
    escala,
    ___,
    ____,
    _____,
  ] = data.split('\n');
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
