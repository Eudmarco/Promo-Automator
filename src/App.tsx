import { useState } from 'react';
import { Loader2, Copy, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { PromoData } from './types.ts';

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM11.997 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.304A9.957 9.957 0 0011.997 22C17.523 22 22 17.523 22 12S17.523 2 11.997 2z" />
    </svg>
  );
}

export default function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PromoData | null>(null);
  const [copiedSocial, setCopiedSocial] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [editedSocialLayout, setEditedSocialLayout] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);
    setData(null);
    setEditedSocialLayout('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch('/api/generate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Falha ao gerar promoção');
      }

      const result = await response.json();
      setData(result);
      setEditedSocialLayout(result.socialLayout ?? '');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('A requisição excedeu o tempo limite. Tente novamente.');
      } else {
        setError(err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.');
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleCopySocial = () => {
    navigator.clipboard.writeText(editedSocialLayout);
    setCopiedSocial(true);
    setTimeout(() => setCopiedSocial(false), 2000);
  };

  const handleCopyForWhatsApp = () => {
    navigator.clipboard.writeText(editedSocialLayout);
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 2500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-[#0d1117] to-slate-950 p-4">
      <div className="max-w-lg mx-auto space-y-5 pt-10 pb-16">

        {/* Header */}
        <header className="text-center space-y-3 pb-2">
          <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-400 shadow-lg shadow-green-500/30">
            <WhatsAppIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Promo Automator
          </h1>
          <p className="text-slate-400 text-sm max-w-xs mx-auto text-center">
            Cole o link da oferta — a IA cria a mensagem pronta para o WhatsApp.
          </p>
        </header>

        {/* URL Input */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label htmlFor="product-url" className="sr-only">URL do produto</label>
            <input
              id="product-url"
              type="url"
              required
              placeholder="https://sua-oferta.com/produto"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.12] text-white placeholder-slate-500 text-sm outline-none focus:border-green-500/60 focus:bg-white/[0.08] transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !url}
              className="w-full inline-flex justify-center items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-green-500 to-emerald-400 shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <><Loader2 className="animate-spin w-4 h-4" /> Gerando...</>
              ) : (
                <><WhatsAppIcon className="w-4 h-4" /> Gerar mensagem</>
              )}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Product Card */}
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-4 flex gap-4 items-start">
              {data.extractedInfo.imageUrl && (
                <div className="relative flex-shrink-0 group">
                  <img
                    src={data.extractedInfo.imageUrl}
                    alt={data.extractedInfo.name}
                    className="w-20 h-20 object-cover rounded-xl border border-white/10"
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <a
                    href={`/api/download-image?url=${encodeURIComponent(data.extractedInfo.imageUrl)}`}
                    download="produto.jpg"
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl text-white text-xs font-medium"
                  >
                    Baixar
                  </a>
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-white text-sm font-medium leading-snug line-clamp-2">
                  {data.extractedInfo.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.extractedInfo.promoPrice && (
                    <span className="px-2.5 py-1 rounded-lg bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-bold tabular-nums">
                      {data.extractedInfo.promoPrice}
                    </span>
                  )}
                  {data.extractedInfo.rating && (
                    <span className="px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-medium">
                      ⭐ {data.extractedInfo.rating}
                    </span>
                  )}
                  {data.extractedInfo.coupon && (
                    <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                      🇧🇷 {data.extractedInfo.coupon}
                    </span>
                  )}
                </div>
                {data.extractedInfo.imageUrl && (
                  <p className="text-slate-500 text-xs">
                    💡 Baixe a imagem acima para enviar junto no WhatsApp
                  </p>
                )}
              </div>
            </div>

            {/* Message Card */}
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-300">Mensagem WhatsApp</span>
                <button
                  onClick={handleCopySocial}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all"
                  aria-label={copiedSocial ? "Mensagem copiada" : "Copiar mensagem"}
                >
                  {copiedSocial ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="px-4 pt-3 pb-3">
                {editedSocialLayout === data.socialLayout && (
                  <p className="text-xs text-slate-600 mb-2 select-none">✏️ Toque para editar</p>
                )}
                <textarea
                  value={editedSocialLayout}
                  onChange={(e) => setEditedSocialLayout(e.target.value)}
                  className="w-full resize-none bg-transparent border-0 outline-none focus:ring-0 text-white/90 text-sm leading-relaxed cursor-text"
                  style={{ minHeight: '260px', fontFamily: 'inherit' }}
                />
                {editedSocialLayout !== data.socialLayout && (
                  <button
                    onClick={() => setEditedSocialLayout(data.socialLayout)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mt-1 mb-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Restaurar original
                  </button>
                )}
              </div>
              <div className="px-4 pb-4">
                <button
                  onClick={handleCopyForWhatsApp}
                  aria-label={copiedWhatsApp ? "Mensagem copiada! Cole no WhatsApp" : "Copiar mensagem para WhatsApp"}
                  className="w-full inline-flex justify-center items-center gap-2.5 px-4 py-4 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-green-500 to-emerald-400 shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  {copiedWhatsApp ? (
                    <><Check className="w-5 h-5" /> Copiado! Cole no WhatsApp</>
                  ) : (
                    <><WhatsAppIcon className="w-5 h-5" /> Copiar mensagem para WhatsApp</>
                  )}
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
