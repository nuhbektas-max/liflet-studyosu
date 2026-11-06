# OmniRoute ile Claude Code

OmniRoute, birçok yapay zekâ sağlayıcısını tek bir yerel adresten (`http://localhost:20128`) sunan bir yönlendirici. Claude Code'u bu adrese bağlayınca istekler panelde seçtiğin sağlayıcıya gider.

Bu adımlar **kendi bilgisayarında** çalışır. Bulut oturumunda (claude.ai/code) panel adresi senin tarayıcından açılmaz.

## Gerekenler

- Node.js 22.22.2 veya üstü (`node -v` ile bak). 23.x desteklenmiyor, 24 ve üstü olur.
- Kullanacağın sağlayıcının hesabı veya API anahtarı.

## Kurulum ve çalıştırma

```bash
npm install -g omniroute
omniroute
# panel: http://localhost:20128  → sağlayıcı ekle, OmniRoute anahtarı al
```

`omniroute` komutu açık kaldığı sürece yönlendirici çalışır. Bu pencereyi kapatma; Claude Code'u ikinci bir terminalde başlat.

## Claude Code'u ayar dosyasına dokunmadan denemek

```bash
omniroute run claude --model [sağlayıcı/model] --api-key [panelden alınan anahtar]
```

- `--model` panelde görünen adla yazılır, örneğin `openai/gpt-5.4`.
- Anahtarı her seferinde yazmak istemezsen `OMNIROUTE_API_KEY` ortam değişkenine koy; `--api-key` o zaman gerekmez.
- Bu komut `~/.claude/settings.json` dosyasını değiştirmez. Yalnızca başlattığı Claude Code için `ANTHROPIC_BASE_URL` ve `ANTHROPIC_AUTH_TOKEN` değerlerini ayarlar; komut kapanınca her şey eski hâline döner.
- Ayrı geçmiş ve ayar istersen `--profile [ad]` ekle (`~/.claude/profiles/[ad]` kullanılır).

## Kalıcı yapmak (isteğe bağlı)

```bash
omniroute configure claude
```

Bu komut Claude Code ayarlarını OmniRoute'a yönlendirir. Önce `omniroute run` ile denemek daha güvenli.

## Dikkat

- API anahtarlarını bu depoya veya herhangi bir dosyaya yazıp commit etme.
- Bir aboneliği (Claude, ChatGPT vb.) üçüncü taraf bir yönlendiriciden geçirmek o hizmetin kullanım koşullarına aykırı olabilir. API anahtarıyla kullanım daha sorunsuz.
- Yanıt kalitesi seçtiğin modele bağlıdır; Claude dışı bir modelle Claude Code'un araç kullanımı zayıf kalabilir.
