import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // API constraints check
  if (!process.env.GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is missing.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  app.get("/api/download-image", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "A URL é obrigatória" });
      }

      const imageAbort = new AbortController();
      const imageTimeout = setTimeout(() => imageAbort.abort(), 12000);
      const imageRes = await fetch(url, {
        signal: imageAbort.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/*"
        }
      });
      clearTimeout(imageTimeout);

      if (!imageRes.ok) {
        throw new Error("Falha ao buscar a imagem");
      }

      const contentType = imageRes.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", 'attachment; filename="produto.jpg"');
      res.send(buffer);
    } catch (error: any) {
      console.error("Erro no download da imagem:", error);
      res.status(500).json({ error: "Erro ao baixar a imagem" });
    }
  });

  app.post("/api/generate-promo", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "A URL é obrigatória." });
      }

      console.log(`Gerando promo para: ${url}`);

      // 1. Fetching URL Content
      let rawText = "";
      let imageUrl: string | undefined = undefined;
      let structuredData: object | null = null;
      try {
        const pageAbort = new AbortController();
        const pageTimeout = setTimeout(() => pageAbort.abort(), 12000);
        const fetchRes = await fetch(url, {
          signal: pageAbort.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          }
        });
        clearTimeout(pageTimeout);
        const html = await fetchRes.text();

        const $ = cheerio.load(html);

        // Extract JSON-LD structured product data (most reliable source)
        $('script[type="application/ld+json"]').each((_, el) => {
          if (structuredData) return; // already found one
          try {
            const parsed = JSON.parse($(el).html() || '');
            const entry = Array.isArray(parsed) ? parsed[0] : parsed;
            if (entry['@type'] === 'Product' || entry['@type'] === 'Offer') {
              structuredData = entry;
            }
          } catch (_) {}
        });

        // Extract product-specific Open Graph meta tags
        const ogPrice = $('meta[property="product:price:amount"]').attr('content') ||
                        $('meta[property="product:sale_price:amount"]').attr('content');

        imageUrl = $('meta[property="og:image"]').attr('content') ||
                   $('meta[name="twitter:image"]').attr('content') ||
                   $('link[rel="image_src"]').attr('href');

        if (!imageUrl) {
          const firstImg = $('img').filter((_, el) => {
            const w = parseInt($(el).attr('width') || '0');
            return !w || w >= 100;
          }).first().attr('src');
          if (firstImg) imageUrl = firstImg;
        }

        if (imageUrl && !imageUrl.startsWith('http')) {
          try { imageUrl = new URL(imageUrl, url).toString(); } catch(_) {}
        }

        $("script, style, noscript, svg, img, nav, footer, header").remove();
        rawText = $("body").text().replace(/\s+/g, " ").trim();
        rawText = rawText.substring(0, 15000);

        // Prepend structured data and meta price if found for better AI accuracy
        if (structuredData) {
          rawText = `[DADOS ESTRUTURADOS JSON-LD]: ${JSON.stringify(structuredData)}\n\n[CONTEÚDO DA PÁGINA]: ${rawText}`;
        } else if (ogPrice) {
          rawText = `[PREÇO EXTRAÍDO VIA META TAG]: ${ogPrice}\n\n[CONTEÚDO DA PÁGINA]: ${rawText}`;
        }
      } catch (err: any) {
        console.warn("Erro ao raspar a URL diretamente, usando URL apenas no prompt:", err.message);
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

Regra 2: Para o link no WhatsApp, coloque-o rigorosamente ISOLADO na ÚLTIMA LINHA do texto. Isso é crucial para o WhatsApp gerar o card com a imagem do produto.

Regra 3: Gere DOIS formatos estritos de texto, usando exatamente a formatação pedida, preenchendo as variáveis. **MUITO IMPORTANTE: Use obrigatoriamente caracteres de quebra de linha ('\\n') no texto JSON retornado para não agrupar o texto em uma única linha**.

## Opção A: Layout para Redes Sociais
🚨 ALERTA DE OFERTA 🚨
[Nome do Produto]

🔥 De: R$ [Preço Original] por Apenas: R$ [Preço Promocional]
📉 [X]% de DESCONTO!
📦 Frete: [Status do Frete]

Corra antes que acabe! 👇

🛒 Compre aqui:
[Link]

## Opção B: Script para Vídeo Curto
[CENA 1 - Gancho - 0 a 5s]: Pare tudo o que você está fazendo se você quer economizar em [Nome do Produto]!
[CENA 2 - O Problema/Desejo - 5 a 15s]: Esse item todo mundo quer, mas o preço normal de R$ [Preço Original] assusta.
[CENA 3 - A Solução - 15 a 25s]: Só que eu achei um link escondido onde ele está saindo por apenas R$ [Preço Promocional]! É o menor preço dos últimos meses.
[CENA 4 - Chamada para Ação - 25 a 30s]: O link seguro está na minha bio/comentários. Corre porque o estoque vai zerar rápido!
`;

      const prompt = `Aqui está o conteúdo extraído da página (ou informações limitadas à URL):\n\nURL Original: ${url}\n\nImagem Principal (Extraída): ${imageUrl || 'Nenhuma'}\n\nConteúdo Textual: ${rawText}`;

      let response;
      let retries = 5;
      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  socialLayout: { type: Type.STRING },
                  videoScript: { type: Type.STRING },
                  extractedInfo: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      originalPrice: { type: Type.STRING, nullable: true },
                      promoPrice: { type: Type.STRING, nullable: true },
                      discount: { type: Type.STRING, nullable: true },
                      shipping: { type: Type.STRING, nullable: true },
                      imageUrl: { type: Type.STRING, nullable: true }
                    },
                    required: ["name"]
                  }
                },
                required: ["socialLayout", "videoScript", "extractedInfo"]
              }
            }
          });
          break; // if successful, break out of retry loop
        } catch (error: any) {
          retries--;
          console.error(`Attempt failed, retries left: ${retries}`, error.message || error);
          if (retries === 0) {
            throw error;
          }
          await new Promise(r => setTimeout(r, 4000)); // wait 4s before retry
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
      } catch (_) {
        throw new Error("Resposta do Gemini em formato inválido. Tente novamente.");
      }
      jsonResult.extractedInfo.link = url;

      // Override or inject the extracted image URL if Gemini didn't pick it up or if we just want to ensure it's there
      if (imageUrl && !jsonResult.extractedInfo.imageUrl) {
        jsonResult.extractedInfo.imageUrl = imageUrl;
      }

      return res.json(jsonResult);
    } catch (error: any) {
      console.error("Erro no processamento:", error);

      let errorMessage = "Erro interno do servidor.";
      const errorString = error?.message || JSON.stringify(error);
      if (errorString && errorString.includes("503") && errorString.includes("high demand")) {
         errorMessage = "A inteligência artificial (Gemini) está com alta demanda neste momento. Por favor, aguarde alguns segundos e tente novamente.";
      } else if (error.message) {
         errorMessage = error.message;
      }

      res.status(500).json({ error: errorMessage });
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
