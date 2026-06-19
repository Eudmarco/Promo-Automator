import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";
import rateLimit from 'express-rate-limit';
import cors from 'cors';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_TEXT_LENGTH = 15_000;
const MAX_RETRIES = 5;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Blocks SSRF: rejects private/loopback/cloud-metadata addresses
function assertSafeUrl(raw: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('URL inválida.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('Apenas URLs http/https são permitidas.');
  }
  const host = u.hostname.toLowerCase();
  if (
    /^(localhost|127\.|0\.0\.0\.0)/.test(host) ||
    /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host) ||
    host === '::1' ||
    host === '169.254.169.254' ||
    /^fe80:/i.test(host)
  ) {
    throw new Error('Acesso a endereços de rede interna não é permitido.');
  }
}

function buildSocialLayout(
  headline: string,
  info: { name: string; originalPrice: string | null; promoPrice: string | null; savings: string | null; rating: string | null; coupon: string | null },
  link: string
): string {
  const stripRS = (v: string | null) => v?.replace(/^R\$\s*/, '').trim() ?? null;
  const origPrice = stripRS(info.originalPrice);
  const promoPrice = stripRS(info.promoPrice);
  const lines: string[] = [headline, ''];
  lines.push(`✅ ${info.name}`, '');
  if (info.rating) lines.push(`⭐ Avaliação: ${info.rating}`);
  if (info.savings) lines.push(`💰 ECONOMIZE: ${info.savings}`);
  if (info.rating || info.savings) lines.push('');
  if (origPrice) lines.push(`DE R$ ${origPrice}`);
  if (promoPrice) lines.push(`🔥 POR R$ ${promoPrice} 🔥`);
  if (info.coupon) lines.push(`🇧🇷 Cupom ${info.coupon}`);
  lines.push('', '🔗 Ou acesse o link:', link);
  return lines.join('\n');
}

async function startServer() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('FATAL: GEMINI_API_KEY é obrigatória. Configure a variável de ambiente antes de iniciar.');
    process.exit(1);
  }

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS: opt-in via ALLOWED_ORIGINS env var; default is same-origin (most secure)
  if (process.env.ALLOWED_ORIGINS) {
    const origins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
    app.use(cors({ origin: origins }));
  }

  app.use('/api/', rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Aguarde um momento e tente novamente.' },
  }));

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // Debug endpoint: only available in development
  app.get("/api/debug-emoji", (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).end();
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const sample = buildSocialLayout(
      'TESTE DE EMOJIS!',
      { name: 'Produto Teste', originalPrice: '100,00', promoPrice: '80,00', savings: 'R$ 20,00', rating: '4.8/5.0', coupon: 'TESTE123' },
      'https://exemplo.com'
    );
    res.send(sample + '\n\n---HEX linha 3---\n' + Buffer.from(sample.split('\n')[2]).toString('hex'));
  });

  app.get("/api/download-image", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "A URL é obrigatória" });
      }
      try {
        assertSafeUrl(url);
      } catch (e: unknown) {
        return res.status(400).json({ error: e instanceof Error ? e.message : 'URL inválida.' });
      }

      const imageAbort = new AbortController();
      const imageTimeout = setTimeout(() => imageAbort.abort(), FETCH_TIMEOUT_MS);
      let imageRes: Response;
      try {
        imageRes = await fetch(url, {
          signal: imageAbort.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/*"
          }
        });
      } finally {
        clearTimeout(imageTimeout);
      }

      if (!imageRes.ok) {
        throw new Error("Falha ao buscar a imagem");
      }

      const contentType = imageRes.headers.get("content-type")?.split(';')[0].trim() || 'image/jpeg';
      if (!ALLOWED_IMAGE_MIME.has(contentType)) {
        return res.status(400).json({ error: "Tipo de conteúdo da imagem não suportado." });
      }

      const arrayBuffer = await imageRes.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
        return res.status(400).json({ error: "Imagem excede o tamanho máximo de 10MB." });
      }
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", 'attachment; filename="produto.jpg"');
      res.send(buffer);
    } catch (error: unknown) {
      console.error("Erro no download da imagem:", error);
      res.status(500).json({ error: "Erro ao baixar a imagem" });
    }
  });

  app.post("/api/generate-promo", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "A URL é obrigatória." });
      }
      try {
        assertSafeUrl(url);
      } catch (e: unknown) {
        return res.status(400).json({ error: e instanceof Error ? e.message : 'URL inválida.' });
      }

      console.log(`Gerando promo para: ${url}`);

      // 1. Fetching URL Content
      let rawText = "";
      let imageUrl: string | undefined = undefined;
      let structuredData: object | null = null;
      try {
        const pageAbort = new AbortController();
        const pageTimeout = setTimeout(() => pageAbort.abort(), FETCH_TIMEOUT_MS);
        let fetchRes: Response;
        try {
          fetchRes = await fetch(url, {
            signal: pageAbort.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            }
          });
        } finally {
          clearTimeout(pageTimeout);
        }

        const html = await fetchRes.text();
        const $ = cheerio.load(html);

        // Extract JSON-LD structured product data (most reliable source)
        $('script[type="application/ld+json"]').each((_, el) => {
          if (structuredData) return;
          try {
            const parsed = JSON.parse($(el).html() || '');
            const entry = Array.isArray(parsed) ? parsed[0] : parsed;
            if (entry['@type'] === 'Product' || entry['@type'] === 'Offer') {
              structuredData = entry;
            }
          } catch (e) {
            console.warn('Erro ao fazer parse de JSON-LD:', e instanceof Error ? e.message : e);
          }
        });

        // Extract product-specific Open Graph meta tags
        const ogPrice = $('meta[property="product:price:amount"]').attr('content') ||
                        $('meta[property="product:sale_price:amount"]').attr('content');

        imageUrl = $('meta[property="og:image"]').attr('content') ||
                   $('meta[name="twitter:image"]').attr('content') ||
                   $('link[rel="image_src"]').attr('href');

        // Amazon-specific: product image lives in #landingImage
        if (!imageUrl && /amazon\.|amzn\./i.test(url)) {
          const landingImg = $('#landingImage');
          imageUrl = landingImg.attr('data-old-hires') || landingImg.attr('src');
          if (!imageUrl) {
            const dynJson = landingImg.attr('data-a-dynamic-image');
            if (dynJson) {
              try {
                const imgs = JSON.parse(dynJson) as Record<string, [number, number]>;
                imageUrl = Object.entries(imgs)
                  .sort(([, a], [, b]) => b[0] - a[0])[0]?.[0];
              } catch (_) {}
            }
          }
        }

        if (!imageUrl) {
          const logoPattern = /logo|icon|sprite|banner|badge|brand/i;
          const firstImg = $('img').filter((_, el) => {
            const w = parseInt($(el).attr('width') || '0');
            const src = $(el).attr('src') || '';
            const alt = $(el).attr('alt') || '';
            return (!w || w >= 100) && !logoPattern.test(src) && !logoPattern.test(alt);
          }).first().attr('src');
          if (firstImg) imageUrl = firstImg;
        }

        if (imageUrl && !imageUrl.startsWith('http')) {
          try { imageUrl = new URL(imageUrl, url).toString(); } catch(_) {}
        }

        $("script, style, noscript, svg, img, nav, footer, header").remove();
        rawText = $("body").text().replace(/\s+/g, " ").trim();
        rawText = rawText.substring(0, MAX_TEXT_LENGTH);

        if (structuredData) {
          rawText = `[DADOS ESTRUTURADOS JSON-LD]: ${JSON.stringify(structuredData)}\n\n[CONTEÚDO DA PÁGINA]: ${rawText}`;
        } else if (ogPrice) {
          rawText = `[PREÇO EXTRAÍDO VIA META TAG]: ${ogPrice}\n\n[CONTEÚDO DA PÁGINA]: ${rawText}`;
        }
      } catch (err: unknown) {
        console.warn("Erro ao raspar a URL, usando URL apenas no prompt:", err instanceof Error ? err.message : err);
        rawText = `Falha ao extrair o HTML. A URL é: ${url}. Tente inferir pelo link e pelo seu conhecimento.`;
      }

      // 2. Setting up the Gemini Prompt
      const systemInstruction = `
Você é um especialista em marketing de afiliados e web scraping. Seu objetivo é extrair detalhes de produto de um texto (ou URL) e criar peças de divulgação que maximizem a conversão.

Regra 1: Extraia as seguintes informações (se não encontrar alguma, deixe null/vazio ou deduza se for óbvio):
- Nome do produto (Título principal).
- Preço original (Preço "de").
- Preço promocional (Preço "por").
- Porcentagem de desconto (Se disponível).
- Link de afiliado/origem: ${url}
- Regras de frete (Se houver frete grátis visível).
- Avaliação do produto (ex: "4.8/5.0" — extraia SOMENTE se encontrar uma nota/avaliação clara).
- Cupom de desconto (ex: "QUEROPROMO" — extraia SOMENTE se encontrar um código de cupom explícito na página).
- Economia em R$ (calcule: preço original - preço promocional, ex: "R$ 50,90" — deixe null se não tiver ambos os preços).

Regra 2: Para o link no WhatsApp, coloque-o rigorosamente ISOLADO na ÚLTIMA LINHA do texto. Isso é crucial para o WhatsApp gerar o card com a imagem do produto.

Regra 3: Gere os seguintes campos. **MUITO IMPORTANTE: Use obrigatoriamente caracteres de quebra de linha ('\\n') no texto JSON retornado para não agrupar o texto em uma única linha**.

## Campo headline
Crie UMA frase de venda chamativa em LETRAS MAIÚSCULAS para o produto (ex: "O MAIS VENDIDO: O BANHO QUE TODOS AMAM!", "A OFERTA QUE VOCÊ ESTAVA ESPERANDO!", "SEU INVERNO MAIS QUENTINHO COM ECONOMIA!"). Seja criativo e impactante.

## Opção B: Script para Vídeo Curto
Crie um roteiro ORIGINAL e CRIATIVO, personalizado especificamente para ESTE produto.
NÃO use textos genéricos, clichês ou copie exemplos. Use as características reais, benefícios
concretos e o apelo emocional mais forte deste produto em particular. Adapte o tom ao tipo de
produto (ex: conforto para cobertores, praticidade para eletrônicos, beleza para moda etc.).

Siga EXATAMENTE este formato:
[CENA 1 - Gancho - 0 a 5s]: [gancho original e poderoso — use curiosidade, surpresa ou provocação baseada NESTE produto específico]
[CENA 2 - O Problema/Desejo - 5 a 15s]: [o problema real que este produto resolve OU o desejo que ele satisfaz, com detalhes específicos ao item]
[CENA 3 - A Solução - 15 a 25s]: [como este produto específico resolve o problema, com o preço promocional como argumento decisivo]
[CENA 4 - Chamada para Ação - 25 a 30s]: [CTA urgente e específico para esta oferta e este produto]
`;

      const prompt = `Aqui está o conteúdo extraído da página (ou informações limitadas à URL):\n\nURL Original: ${url}\n\nImagem Principal (Extraída): ${imageUrl || 'Nenhuma'}\n\nConteúdo Textual: ${rawText}`;

      // 3. Calling Gemini with exponential backoff retry
      let response;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  videoScript: { type: Type.STRING },
                  extractedInfo: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      originalPrice: { type: Type.STRING, nullable: true },
                      promoPrice: { type: Type.STRING, nullable: true },
                      discount: { type: Type.STRING, nullable: true },
                      shipping: { type: Type.STRING, nullable: true },
                      imageUrl: { type: Type.STRING, nullable: true },
                      rating: { type: Type.STRING, nullable: true },
                      coupon: { type: Type.STRING, nullable: true },
                      savings: { type: Type.STRING, nullable: true }
                    },
                    required: ["name"]
                  }
                },
                required: ["headline", "videoScript", "extractedInfo"]
              }
            }
          });
          break;
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`Gemini tentativa ${attempt + 1}/${MAX_RETRIES} falhou:`, msg);
          if (attempt === MAX_RETRIES - 1) throw error;
          // Exponential backoff with jitter
          const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 30_000);
          await new Promise(r => setTimeout(r, delay));
        }
      }

      if (!response) {
        throw new Error("Falha ao gerar resposta do Gemini após várias tentativas.");
      }

      const resultText = response.text;
      if (!resultText) {
        throw new Error("Falha ao gerar resposta do Gemini.");
      }

      let jsonResult: any;
      try {
        jsonResult = JSON.parse(resultText);
      } catch {
        throw new Error("Resposta do Gemini em formato inválido. Tente novamente.");
      }

      if (!jsonResult?.extractedInfo) {
        throw new Error("Resposta do Gemini com estrutura inválida. Tente novamente.");
      }

      jsonResult.extractedInfo.link = url;
      jsonResult.socialLayout = buildSocialLayout(
        jsonResult.headline,
        jsonResult.extractedInfo,
        url
      );
      console.log('[DEBUG socialLayout]\n', jsonResult.socialLayout);

      if (imageUrl && !jsonResult.extractedInfo.imageUrl) {
        jsonResult.extractedInfo.imageUrl = imageUrl;
      }

      return res.json(jsonResult);
    } catch (error: unknown) {
      console.error("Erro no processamento:", error);

      const msg = error instanceof Error ? error.message : 'Erro interno do servidor.';
      const isHighDemand = msg.includes("503") && msg.includes("high demand");

      res.status(500).json({
        error: isHighDemand
          ? "A inteligência artificial (Gemini) está com alta demanda neste momento. Por favor, aguarde alguns segundos e tente novamente."
          : msg
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
