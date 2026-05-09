# Como usar no iPhone

## Caminho mais simples: PWA

1. Publique esta pasta em um serviço com HTTPS, como Netlify, Vercel ou GitHub Pages.
2. Abra o link publicado no Safari do iPhone.
3. Toque no botão de compartilhar.
4. Toque em "Adicionar à Tela de Início".
5. Abra o app pelo ícone criado.

## Pontos importantes

- A câmera do iPhone exige HTTPS.
- Abra pelo Safari para instalar na Tela de Início.
- Na primeira leitura, permita o acesso à câmera.
- Se a câmera não abrir, teste no Safari antes de testar pelo ícone instalado.

## Arquivos necessários

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `service-worker.js`
- `icon.svg`

O app usa a biblioteca `html5-qrcode` por CDN para funcionar melhor no iOS. Se quiser publicar uma versão 100% independente, baixe essa biblioteca e troque o link do script no `index.html` para um arquivo local.
