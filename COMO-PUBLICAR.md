# Como rodar e publicar o SENSI PRO

## 1. Rodar no PC (Windows)

1. Instale o Node.js uma única vez: https://nodejs.org (versão LTS)
2. Dê dois cliques em **`INICIAR.bat`** dentro da pasta `sensi-freefire`
3. Abra no navegador:
   - Site: `http://localhost:3000`
   - Painel admin: `http://localhost:3000/painel-admin`

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
4. **IMPORTANTE — conectar o banco de dados (pra nada se perder):**
   No plano grátis o Render apaga os arquivos quando o servidor dorme/reinicia.
   A solução é o **Supabase** (grátis, sem cartão):

   **Criar o banco (uma única vez, ~5 minutos):**
   1. Acesse https://supabase.com → **Start your project** → crie a conta
   2. **New project** → escolha um nome e uma senha do banco (anote!)
   3. No menu lateral: **SQL Editor** → **New query** → cole todo o conteúdo
      do arquivo `supabase-schema.sql` → clique em **RUN**
   4. Pegue as chaves em **Project Settings → API**:
      - **Project URL** (algo como `https://xxxx.supabase.co`)
      - **service_role key** (em `Project API Keys`)

   **Ligar no Render:**
   5. No painel do serviço: **Environment → Add from .env** ou manualmente:
      - Nome: `SUPABASE_URL` · Valor: a Project URL
      - Nome: `SUPABASE_SERVICE_ROLE_KEY` · Valor: a service_role key
   6. Salve e faça o deploy novamente.
   7. Nos logs do Render vai aparecer:
      `BANCO DE DADOS: Supabase configurado ✔`

   > Pronto: KEYs, VIPs, usuários e configurações ficam salvos no Supabase,
   > mesmo se o servidor dormir, reiniciar ou você publicar atualização nova.
   > Se já existia um db.json local, ele é migrado pro Supabase automaticamente
   > no primeiro boot.

   **Recomendado também:** defina `ADMIN_PASSWORD` no Environment
   (senha forte para o painel admin) antes de publicar.
5. Pronto: você recebe um link tipo `https://sensi-pro.onrender.com`

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
- Os dados ficam no Supabase; o arquivo `data/db.json` é só um espelho/backup local
