import React, { useState } from 'react';
import { ShoppingBag, Loader2, Copy, Check, Link as LinkIcon, AlertCircle, RotateCcw, Share2 } from 'lucide-react';
import { PromoData } from './types.ts';

function parseVideoScenes(script: string): { label: string; text: string }[] {
  const scenes: { label: string; text: string }[] = [];
  const regex = /\[([^\]]+)\]:\s*(.+)/g;
  let match;
  while ((match = regex.exec(script)) !== null) {
    scenes.push({ label: match[1], text: match[2] });
  }
  return scenes;
}

function applyHeadline(layout: string, headline: string): string {
  const lines = layout.split('\n');
  const idx = lines.findIndex(l => l.trim() !== '');
  if (idx === -1) return layout;
  lines[idx] = headline;
  return lines.join('\n');
}

export default function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PromoData | null>(null);
  const [copiedSocial, setCopiedSocial] = useState(false);
  const [copiedVideo, setCopiedVideo] = useState(false);
  const [selectedHeadline, setSelectedHeadline] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<'fallback' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);
    setData(null);
    setSelectedHeadline(null);
    setShareStatus(null);

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

  const handleShareWhatsApp = async () => {
    if (!data?.extractedInfo.imageUrl) return;
    setIsSharing(true);
    try {
      const res = await fetch(
        `/api/download-image?url=${encodeURIComponent(data.extractedInfo.imageUrl)}`
      );
      const blob = await res.blob();
      const file = new File([blob], 'produto.jpg', { type: blob.type || 'image/jpeg' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: displayedSocialLayout });
      } else {
        await navigator.clipboard.writeText(displayedSocialLayout);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'produto.jpg';
        a.click();
        URL.revokeObjectURL(a.href);
        setShareStatus('fallback');
        setTimeout(() => setShareStatus(null), 4000);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Share failed:', err);
    } finally {
      setIsSharing(false);
    }
  };

  const displayedSocialLayout = data
    ? selectedHeadline
      ? applyHeadline(data.socialLayout, selectedHeadline)
      : data.socialLayout
    : '';

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

            {selectedHeadline && (
              <div className="max-w-full flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-700">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">Headline da cena aplicada ao post de redes sociais.</span>
                <button
                  onClick={() => setSelectedHeadline(null)}
                  className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restaurar original
                </button>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">

              {/* Option A: Social */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="text-lg font-semibold text-slate-800">Opção A: Redes Sociais</h3>
                  <button
                    onClick={() => handleCopy(displayedSocialLayout, 'social')}
                    className="text-slate-500 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
                    title="Copiar texto"
                  >
                    {copiedSocial ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <div className="p-6 flex-1 bg-white">
                  <pre className="whitespace-pre-wrap font-sans text-slate-700 text-sm leading-relaxed">
                    {displayedSocialLayout}
                  </pre>
                </div>
                {data.extractedInfo.imageUrl && (
                  <div className="px-6 pb-5 flex flex-col gap-2">
                    <button
                      onClick={handleShareWhatsApp}
                      disabled={isSharing}
                      className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSharing ? (
                        <><Loader2 className="animate-spin w-4 h-4" /> Preparando...</>
                      ) : (
                        <><Share2 className="w-4 h-4" /> Enviar para WhatsApp (texto + imagem)</>
                      )}
                    </button>
                    {shareStatus === 'fallback' && (
                      <p className="text-xs text-center text-slate-500">
                        Texto copiado e imagem baixada — anexe a imagem manualmente no WhatsApp.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Option B: Video */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">Opção B: Vídeo Curto</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Clique em uma cena para usá-la como headline</p>
                  </div>
                  <button
                    onClick={() => handleCopy(data.videoScript, 'video')}
                    className="text-slate-500 hover:text-purple-600 transition-colors p-2 rounded-lg hover:bg-purple-50"
                    title="Copiar roteiro"
                  >
                    {copiedVideo ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                {(() => {
                  const scenes = parseVideoScenes(data.videoScript);
                  return scenes.length > 0 ? (
                    <div className="p-4 flex-1 space-y-2">
                      {scenes.map((scene, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            setSelectedHeadline(selectedHeadline === scene.text ? null : scene.text)
                          }
                          className={`w-full text-left p-3 rounded-xl border transition-all text-sm ${
                            selectedHeadline === scene.text
                              ? 'border-purple-400 bg-purple-50 text-purple-900 shadow-sm'
                              : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50/40 text-slate-700'
                          }`}
                        >
                          <span className="block text-xs font-semibold text-slate-400 mb-1">
                            {scene.label}
                          </span>
                          <span className="leading-snug">
                            {scene.text}
                          </span>
                          {selectedHeadline === scene.text && (
                            <Check className="inline-block ml-2 w-3.5 h-3.5 text-purple-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 flex-1 bg-white">
                      <pre className="whitespace-pre-wrap font-sans text-slate-700 text-sm leading-relaxed">
                        {data.videoScript}
                      </pre>
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
