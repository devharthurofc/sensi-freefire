# Como rodar e publicar o SENSI PRO

## 1. Rodar no PC (Windows)

1. Instale o Node.js uma única vez: https://nodejs.org (versão LTS)
2. Dê dois cliques em **`INICIAR.bat`** dentro da pasta `sensi-freefire`
3. Abra no navegador:
   - Site: `http://localhost:3000`
   - Painel admin: `http://localhost:3000/admin`

Para parar o servidor: feche a janela preta (ou Ctrl+C).

> O PC precisa ficar ligado com o `.bat` aberto para outras pessoas acessarem pela rede.

---

## 2. Publicar na internet (recomendado para Android)

Hospede de graça em um serviço de Node.js — assim o site fica com um link que abre em qualquer celular:

### Opção A — Render.com (grátis)
1. Suba a pasta do projeto para um repositório no GitHub
2. Acesse https://render.com → **New Web Service** → conecte o repositório
3. Configurações:
   - Build command: `npm install`
   - Start command: `npm start`
4. Pronto: você recebe um link tipo `https://sensi-pro.onrender.com`

### Opção B — Railway.app
1. https://railway.app → **New Project** → **Deploy from GitHub repo**
2. Ele detecta o `npm start` sozinho e gera o link público

### Opção C — VPS pago (Hostinger, Contabo...)
Instale Node.js na VPS, suba os arquivos e rode `npm start` (use `pm2` para manter sempre ligado):
```
npm install -g pm2
pm2 start server.js --name sensi-pro
```

---

## 3. Usar no Android

Com o site publicado (opção acima), no celular:

1. Abra o link no Chrome
2. Menu (⋮) → **"Adicionar à tela inicial"**
3. O gerador vira um "app" com ícone na tela do celular

> Alternativa sem publicar: instalar o **Termux** no Android e rodar `node server.js` lá dentro — mas é mais complicado e só funciona com o Termux aberto.

---

## 4. Segurança ao publicar

- Defina a senha do admin antes de publicar: variável de ambiente `ADMIN_PASSWORD`
- Troque a senha padrão no painel após o primeiro acesso
- Faça backup do arquivo `data/db.json` (é onde ficam keys, usuários e configs)
