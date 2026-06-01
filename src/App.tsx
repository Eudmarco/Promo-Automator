import React, { useState } from 'react';
import { ShoppingBag, Loader2, Copy, Check, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { PromoData } from './types.ts';

export default function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PromoData | null>(null);
  const [copiedSocial, setCopiedSocial] = useState(false);
  const [copiedVideo, setCopiedVideo] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch('/api/generate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Falha ao gerar promoção');
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro desconhecido.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, type: 'social' | 'video') => {
    navigator.clipboard.writeText(text);
    if (type === 'social') {
      setCopiedSocial(true);
      setTimeout(() => setCopiedSocial(false), 2000);
    } else {
      setCopiedVideo(true);
      setTimeout(() => setCopiedVideo(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="text-center space-y-4 pt-12">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <ShoppingBag className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Promo Automator
          </h1>
          <p className="text-slate-500 max-w-lg mx-auto">
            Cole o link da sua oferta abaixo e nossa IA extrairá os dados, criando automaticamente layouts para o Instagram, WhatsApp, e roteiros para vídeos curtos (TikTok/Reels).
          </p>
        </header>

        {/* Form Container */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3 flex-col sm:flex-row">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LinkIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="url"
                required
                placeholder="https://sua-promocao.com/produto"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 sm:text-sm transition-shadow"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !url}
              className="inline-flex justify-center items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  Gerando...
                </>
              ) : (
                'Gerar Scripts'
              )}
            </button>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="max-w-2xl mx-auto flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-6 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Extracted Info Summary */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm">
              {data.extractedInfo.imageUrl && (
                <div className="flex-shrink-0 relative group">
                  <img 
                    src={data.extractedInfo.imageUrl} 
                    alt={data.extractedInfo.name} 
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                  <a 
                    href={`/api/download-image?url=${encodeURIComponent(data.extractedInfo.imageUrl)}`}
                    download="produto.jpg"
                    className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg text-white font-medium text-xs"
                  >
                    Baixar
                  </a>
                </div>
              )}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-slate-700">Produto Extr.:</span>
                  <span className="truncate max-w-xs px-2 py-1 bg-slate-100 text-slate-800 rounded-md font-medium" title={data.extractedInfo.name}>
                    {data.extractedInfo.name || "N/A"}
                  </span>
                  {data.extractedInfo.promoPrice && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-md font-bold">
                      {data.extractedInfo.promoPrice}
                    </span>
                  )}
                </div>
                {data.extractedInfo.imageUrl && (
                  <p className="text-xs text-slate-500">
                    💡 Dica: Salve a imagem acima para enviar junto com o texto no WhatsApp. Isso garante que a foto apareça perfeitamente!
                  </p>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              
              {/* Option A: Social */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="text-lg font-semibold text-slate-800">Opção A: Redes Sociais</h3>
                  <button
                    onClick={() => handleCopy(data.socialLayout, 'social')}
                    className="text-slate-500 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
                    title="Copiar texto"
                  >
                    {copiedSocial ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <div className="p-6 flex-1 bg-white">
                  <pre className="whitespace-pre-wrap font-sans text-slate-700 text-sm leading-relaxed">
                    {data.socialLayout}
                  </pre>
                </div>
              </div>

              {/* Option B: Video */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="text-lg font-semibold text-slate-800">Opção B: Vídeo Curto</h3>
                  <button
                    onClick={() => handleCopy(data.videoScript, 'video')}
                    className="text-slate-500 hover:text-purple-600 transition-colors p-2 rounded-lg hover:bg-purple-50"
                    title="Copiar roteiro"
                  >
                    {copiedVideo ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <div className="p-6 flex-1 bg-white">
                  <pre className="whitespace-pre-wrap font-sans text-slate-700 text-sm leading-relaxed">
                    {data.videoScript}
                  </pre>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

