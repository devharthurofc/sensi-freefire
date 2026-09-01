#!/bin/bash
# Script para aplicar correções de segurança no Aimzy

echo "🔒 AIMZY Security Fixes - Aplicador Automático"
echo "=============================================="
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verificar se .env.example existe
if [ ! -f ".env.example" ]; then
    echo -e "${RED}❌ .env.example não encontrado${NC}"
    exit 1
fi

echo -e "${GREEN}✅ .env.example encontrado${NC}"
echo ""

# 2. Criar .env a partir do exemplo (se não existir)
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Criando .env a partir do template${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ .env criado. EDITE COM SUAS CREDENCIAIS REAIS!${NC}"
else
    echo -e "${YELLOW}⚠️  .env já existe. Não sobrescrevendo.${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Próximos passos:${NC}"
echo ""
echo "1. EDITE .env com suas credenciais REAIS:"
echo "   - DATABASE_URL"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo "   - GMAIL_USER e GMAIL_APP_PASSWORD"
echo "   - ADMIN_USERNAME e ADMIN_PASSWORD"
echo ""
echo "2. REMOVA .env do histórico Git (URGENTE):"
echo "   git rm --cached .env"
echo "   git commit -m 'Remove .env from tracking'"
echo ""
echo "3. ROTACIONE todas as credenciais:"
echo "   - Supabase: Settings → API → Regenerate"
echo "   - Gmail: Google Account → Security → App passwords"
echo ""
echo "4. Teste o servidor:"
echo "   npm start"
echo ""
echo -e "${GREEN}✅ Script concluído!${NC}"
