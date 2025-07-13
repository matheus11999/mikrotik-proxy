# 🚀 MikroTik Proxy API

API proxy eficiente e segura para MikroTik RouterOS v7+ com rate limiting e integração Supabase.

## 📋 Características

- ✅ **Proxy para API REST MikroTik**: Acesso transparente à API RouterOS v7+
- ✅ **Rate Limiting**: 30 requisições/minuto por MikroTik
- ✅ **Integração Supabase**: Credenciais automáticas da tabela `mikrotiks`
- ✅ **Validação de Status**: Cancela requisições para MikroTiks inativos
- ✅ **Logs Detalhados**: Winston com rotação automática
- ✅ **Segurança**: Helmet, CORS, validação de inputs
- ✅ **Health Checks**: Monitoramento de saúde da API

## 🏗️ Arquitetura

```
Cliente → Proxy API → Validação Supabase → MikroTik (via WireGuard)
                ↓
         Rate Limiting + Logs
```

## 🚀 Instalação

1. **Instalar dependências:**
```bash
cd mikrotik-proxy-api
npm install
```

2. **Configurar ambiente:**
```bash
cp .env.example .env
# Editar .env com suas configurações Supabase
```

3. **Criar tabela de logs (opcional):**
```sql
CREATE TABLE mikrotik_api_logs (
  id SERIAL PRIMARY KEY,
  mikrotik_id UUID REFERENCES mikrotiks(id),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  response_time INTEGER,
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

4. **Iniciar servidor:**
```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

## 📚 Como Usar

### 1. Autenticação

Use o token Bearer do MikroTik (campo `token` da tabela `mikrotiks`):
```javascript
headers: {
  'Authorization': 'Bearer 882f38a2-ad13-4a60-a298-4e732750a807'
}
```

**Segurança**: Apenas o proprietário do MikroTik (via token) pode acessar seus dados.

### 2. Endpoints Disponíveis

#### Health Check
```bash
GET /health
GET /health/detailed
GET /health/ping
```

#### Listar MikroTiks
```bash
GET /api/mikrotik/list
```

#### Testar Conexão
```bash
GET /api/mikrotik/{mikrotikId}/test
```

#### Endpoints Específicos
```bash
# Interfaces
GET /api/mikrotik/{mikrotikId}/interfaces

# Usuários Hotspot
GET /api/mikrotik/{mikrotikId}/hotspot/users
POST /api/mikrotik/{mikrotikId}/hotspot/users

# Usuários Ativos
GET /api/mikrotik/{mikrotikId}/hotspot/active

# Recursos do Sistema
GET /api/mikrotik/{mikrotikId}/system/resource

# Firewall Address List
GET /api/mikrotik/{mikrotikId}/firewall/address-list
POST /api/mikrotik/{mikrotikId}/firewall/address-list
```

#### Proxy Genérico
```bash
# Qualquer endpoint da API REST MikroTik
GET|POST|PUT|DELETE /api/mikrotik/{mikrotikId}/rest/{endpoint}
```

### 3. Exemplos de Uso

#### JavaScript/Axios
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3001',
  headers: {
    'Authorization': 'Bearer 882f38a2-ad13-4a60-a298-4e732750a807'
  }
});

// Obter interfaces
const interfaces = await api.get('/api/mikrotik/07d822ff-86fd-4988-8120-c6dc28de79fd/interfaces');

// Criar usuário hotspot
const user = await api.post('/api/mikrotik/07d822ff-86fd-4988-8120-c6dc28de79fd/hotspot/users', {
  name: 'usuario123',
  password: 'senha123',
  profile: 'default'
});

// Requisição genérica
const identity = await api.get('/api/mikrotik/07d822ff-86fd-4988-8120-c6dc28de79fd/rest/system/identity');
```

#### cURL
```bash
# Testar conexão
curl -H "Authorization: Bearer 882f38a2-ad13-4a60-a298-4e732750a807" \
     http://localhost:3001/api/mikrotik/07d822ff-86fd-4988-8120-c6dc28de79fd/test

# Listar usuários hotspot
curl -H "Authorization: Bearer 882f38a2-ad13-4a60-a298-4e732750a807" \
     http://localhost:3001/api/mikrotik/07d822ff-86fd-4988-8120-c6dc28de79fd/hotspot/users

# Requisição genérica para system/resource
curl -H "Authorization: Bearer 882f38a2-ad13-4a60-a298-4e732750a807" \
     http://localhost:3001/api/mikrotik/07d822ff-86fd-4988-8120-c6dc28de79fd/rest/system/resource
```

### 4. Cliente de Teste

Execute o cliente de teste incluído:
```bash
npm test
```

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# Servidor
PORT=3001
NODE_ENV=development

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000      # 1 minuto
RATE_LIMIT_MAX_REQUESTS=30      # 30 req/min por MikroTik

# Timeouts
MIKROTIK_TIMEOUT=10000          # 10 segundos
REQUEST_TIMEOUT=30000           # 30 segundos

# Logs
LOG_LEVEL=info
```

### Rate Limiting

- **Global**: 100 req/min por IP
- **Por MikroTik**: 30 req/min por MikroTik ID
- **Janela**: 1 minuto (configurável)

### Segurança

- Helmet para headers de segurança
- CORS configurável
- Validação de inputs
- Logs de auditoria
- Timeouts configuráveis

## 📊 Monitoramento

### Logs

Logs são salvos em:
- `logs/combined.log` - Todos os logs
- `logs/error.log` - Apenas erros

### Health Check

```bash
# Status básico
curl http://localhost:3001/health

# Status detalhado
curl http://localhost:3001/health/detailed
```

### Métricas

- Tempo de resposta das requisições
- Rate limiting por MikroTik
- Logs de acesso no Supabase
- Uso de memória e CPU

## 🔧 Desenvolvimento

### Estrutura do Projeto

```
mikrotik-proxy-api/
├── server.js              # Servidor principal
├── routes/
│   ├── mikrotik.js        # Rotas do proxy MikroTik
│   └── health.js          # Health checks
├── services/
│   ├── supabaseService.js # Integração Supabase
│   └── mikrotikService.js # Client MikroTik API
├── middleware/
│   └── auth.js            # Autenticação e validação
├── utils/
│   └── logger.js          # Sistema de logs
└── test-client.js         # Cliente de teste
```

### Executar em Desenvolvimento

```bash
npm run dev
```

### Deploy em Produção

```bash
# PM2
pm2 start ecosystem.config.js

# Docker
docker build -t mikrotik-proxy-api .
docker run -p 3001:3001 mikrotik-proxy-api
```

## 🆘 Troubleshooting

### Problemas Comuns

1. **MikroTik não acessível**
   - Verificar conectividade WireGuard
   - Confirmar IP e porta do MikroTik
   - Verificar credenciais no Supabase

2. **Rate Limit Excedido**
   - Aguardar 1 minuto ou ajustar `RATE_LIMIT_MAX_REQUESTS`

3. **Erro de Autenticação**
   - Verificar se MikroTik está ativo (`ativo = true`)
   - Confirmar ID do MikroTik no header

4. **Timeout de Conexão**
   - Ajustar `MIKROTIK_TIMEOUT`
   - Verificar latência da rede WireGuard

### Debug

Ativar logs detalhados:
```env
LOG_LEVEL=debug
NODE_ENV=development
```

## 🔗 Integração com Sistema Existente

Para integrar com seu sistema atual:

1. **Use o mesmo Supabase** - A API usa suas credenciais existentes
2. **Mantenha a tabela mikrotiks** - Funciona com sua estrutura atual
3. **Rate limiting independente** - Não afeta outras APIs
4. **Logs centralizados** - Opcionalmente salve logs no Supabase

## 📈 Performance

- **Conexões**: Pool de conexões HTTP reutilizáveis
- **Cache**: Rate limiting em memória
- **Timeout**: Configurável por requisição
- **Logs**: Rotação automática de arquivos

---

## 🎯 Próximos Passos

- [ ] WebSocket para notificações em tempo real
- [ ] Cache Redis para melhor performance
- [ ] Métricas Prometheus
- [ ] Autenticação JWT opcional
- [ ] Webhook para eventos MikroTik

**API criada com ❤️ para gerenciamento eficiente de MikroTiks via WireGuard**