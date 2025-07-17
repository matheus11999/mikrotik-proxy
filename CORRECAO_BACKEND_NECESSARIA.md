# 🔧 Correção Necessária no Backend MikroPix

## 📋 Problema Identificado

O IP binding está sendo criado com **horário da compra** em vez do **horário de expiração**, causando:

```
❌ INCORRETO: C:17/07/2025 V:0.1 uuid e:2025-07-17 13:30:30 (horário da compra)
✅ CORRETO:   C:17/07/2025 V:0.1 uuid e:2025-07-17 13:35:30 (compra + 5 min)
```

## 🎯 Causa Raiz

No arquivo `mikropix-backend-vps1/src/services/mikrotikUserService.js`, método `createIpBindingFromPayment`, está faltando o campo `expiration_minutes` na requisição para a API proxy.

## 📦 Solução Implementada pela Task

**Arquivo**: `mikropix-backend-vps1/src/services/mikrotikUserService.js`
**Método**: `createIpBindingFromPayment`
**Linha**: ~407-411

### Código Corrigido:

```javascript
// === 4. Montar dados do IP binding ===
// Calcular expiration_minutes baseado na duração do plano
const planMinutos = vendaData.planos?.minutos || 
                  vendaData.plano_minutos || 
                  60; // fallback para 60 minutos se não encontrar

console.log(`[IP Binding] Duração do plano: ${planMinutos} minutos (${planMinutos/60} horas)`);
console.log(`[IP Binding] Dados do plano:`, vendaData.planos);

const bindingData = {
    address: '192.168.1.100', // IP fixo - deve ser configurado conforme necessário
    mac_address: vendaData.mac_address,
    comment: ipBindingComment,
    expiration_minutes: planMinutos // ✅ CRUCIAL: Usar duração do plano em minutos
};

console.log(`[IP Binding] Dados enviados para API:`, bindingData);
```

### Antes (Incorreto):
```javascript
const bindingData = {
    address: '192.168.1.100',
    mac_address: vendaData.mac_address,
    comment: ipBindingComment
    // ❌ Faltava: expiration_minutes
};
```

### Depois (Correto):
```javascript
const bindingData = {
    address: '192.168.1.100',
    mac_address: vendaData.mac_address,
    comment: ipBindingComment,
    expiration_minutes: planMinutos // ✅ Duração do plano
};
```

## 🔍 Arquivos Afetados

O método `createIpBindingFromPayment` é chamado em:
- `src/controllers/webhookController.js:403`
- `src/services/paymentPollingService.js:593`
- `src/services/optimizedPaymentPollingService.js:723`

## 🧪 Testes Confirmam Correção

### Teste da API Proxy (✅ Funcionando):
```javascript
// Enviando expiration_minutes = 5 (duração do plano)
{
  "address": "192.168.1.56",
  "mac_address": "F6:5B:49:68:3C:F7",
  "comment": "C:17/07/2025 V:0.1 23ccce4f-69c2-4697-949d-a0f14c526c13",
  "expiration_minutes": 5
}

// Resultado: ✅ CORRETO
"e:2025-07-17 12:40:19" // Agora + 5 minutos
```

### Sem expiration_minutes (❌ Problema):
```javascript
// Backend atual não envia expiration_minutes
{
  "address": "192.168.1.100",
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "comment": "C:17/07/2025 V:0.1 uuid"
  // ❌ Falta: expiration_minutes
}

// API usa padrão de 60 minutos (linha 248 do publicMikrotik.js)
"e:2025-07-17 13:30:30" // Agora + 60 min (padrão)
```

## 📋 Checklist de Implementação

- [ ] **Aplicar correção** no `mikrotikUserService.js`
- [ ] **Verificar** se campo `minutos` está sendo salvo corretamente na tabela `planos`
- [ ] **Testar** com plano de 5 minutos
- [ ] **Testar** com plano de 30 minutos
- [ ] **Testar** com plano de 1 hora
- [ ] **Verificar logs** para confirmar que `expiration_minutes` está sendo enviado
- [ ] **Validar** que IP binding é removido no tempo correto

## 🎯 Resultado Esperado

Após a correção:
```
💳 Compra às 13:30:30 com plano de 5 minutos
✅ IP binding criado: e:2025-07-17 13:35:30
🤖 Scheduler remove automaticamente às 13:35:30
```

## 📝 Logs para Verificação

Após implementar, verificar nos logs:
```
[IP Binding] Duração do plano: 5 minutos (0.08333333333333333 horas)
[IP Binding] Dados do plano: { id: 'uuid', nome: 'teste', minutos: 5, ... }
[IP Binding] Dados enviados para API: { expiration_minutes: 5, ... }
```

## 🚀 Status

- ✅ **API Proxy**: Funcionando corretamente
- ✅ **Timezone**: Corrigido (America/Manaus)
- ✅ **Scheduler**: Funcionando corretamente
- ❌ **Backend**: Precisa implementar correção
- ❌ **Frontend**: Precisa aplicar correção do cálculo de minutos (já feito)

**Próximo passo**: Implementar a correção no backend MikroPix.