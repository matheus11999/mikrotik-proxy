# 📅 Endpoint de Scheduler MikroTik

## Visão Geral

Endpoint para criar schedulers (tarefas agendadas) no MikroTik através da API REST.

## Endpoint

```
POST /api/mikrotik/{mikrotikId}/scheduler
```

## Autenticação

Requer autenticação por sessão de usuário:
```
Authorization: Bearer {userSessionToken}
```

## Parâmetros da Requisição

### Obrigatórios:
- `name` (string) - Nome único do scheduler
- `start_date` (string) - Data de início (formato: jan/01/2025)
- `start_time` (string) - Hora de início (formato: HH:mm:ss)
- `on_event` (string) - Script/comando a ser executado

### Opcionais:
- `interval` (string) - Intervalo de execução (ex: 1d, 1h, 30m, 60s)
- `count` (number) - Número de execuções (0 = infinito)
- `policy` (string) - Políticas de execução (padrão: "read,write,policy,test")
- `disabled` (boolean) - Se o scheduler está desabilitado (padrão: false)
- `comment` (string) - Comentário descritivo

## Exemplo de Uso

### Requisição:
```json
POST /api/mikrotik/ad8ba643-627d-4539-a6ef-e6636ee0773b/scheduler
Content-Type: application/json
Authorization: Bearer {userSessionToken}

{
  "name": "backup-diario",
  "start_date": "jan/01/2025",
  "start_time": "02:00:00",
  "interval": "1d",
  "on_event": "/system backup save name=backup-auto",
  "policy": "read,write,policy,test",
  "disabled": false,
  "comment": "Backup automático diário às 2h"
}
```

### Resposta de Sucesso:
```json
{
  "success": true,
  "message": "Scheduler criado com sucesso",
  "data": {
    "ret": "*57"
  },
  "responseTime": 300
}
```

### Resposta de Erro:
```json
{
  "success": false,
  "error": "Campos obrigatórios: name, start_date, start_time, on_event",
  "code": "MISSING_REQUIRED_FIELDS"
}
```

## Formato de Datas e Horários

### Data (start_date):
- Formato: `mmm/dd/yyyy` (ex: jan/01/2025, dec/31/2024)
- Meses: jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec

### Hora (start_time):
- Formato: `HH:mm:ss` (ex: 02:00:00, 14:30:15)
- Formato 24 horas

### Intervalo (interval):
- Segundos: `30s`, `60s`
- Minutos: `5m`, `30m`
- Horas: `1h`, `6h`
- Dias: `1d`, `7d`
- Semanas: `1w`, `4w`
- Combinações: `1d30m`, `2w3d`

## Políticas (policy)

Políticas disponíveis (separadas por vírgula):
- `read` - Leitura de configuração
- `write` - Escrita de configuração
- `policy` - Gerenciamento de políticas
- `test` - Comandos de teste
- `password` - Alteração de senhas
- `sniff` - Monitoramento de tráfego
- `sensitive` - Operações sensíveis
- `reboot` - Reinicialização do sistema
- `ftp` - Acesso FTP
- `romon` - RoMON

## Exemplos de Scripts (on_event)

### Backup Automático:
```
/system backup save name=backup-auto
```

### Log de Sistema:
```
:log info "Scheduler executado com sucesso"
```

### Reinicialização:
```
/system reboot
```

### Limpeza de Logs:
```
/log print file=logs; /file remove [find name=logs.txt]
```

### Script Complexo:
```
:local date [/system clock get date];
:local time [/system clock get time];
:log info "Backup iniciado em $date $time";
/system backup save name="backup-$date";
:log info "Backup concluído"
```

## Códigos de Erro

- `MISSING_REQUIRED_FIELDS` - Campos obrigatórios ausentes
- `DEVICE_OFFLINE` - MikroTik offline
- `INVALID_CREDENTIALS` - Credenciais inválidas
- `INTERNAL_ERROR` - Erro interno do servidor

## Rate Limiting

- **100 requisições por minuto** por usuário autenticado
- Headers de resposta incluem informações de rate limiting:
  - `X-RateLimit-Limit`: Limite máximo
  - `X-RateLimit-Remaining`: Requisições restantes
  - `X-RateLimit-Reset`: Timestamp de reset

## Teste Realizado

✅ **Teste com MikroTik ID**: `ad8ba643-627d-4539-a6ef-e6636ee0773b`
✅ **Scheduler criado com sucesso**: ID `*56`
✅ **Tempo de resposta**: ~300ms
✅ **Verificação**: Scheduler aparece na listagem do MikroTik

## Segurança

- Autenticação obrigatória por sessão de usuário
- Verificação de propriedade do MikroTik
- Rate limiting por usuário
- Validação de campos obrigatórios
- Logs de auditoria automáticos

## Monitoramento

- Métricas de performance coletadas
- Logs estruturados com Winston
- Headers de resposta com tempos
- Cache de dispositivos offline

---

**Endpoint testado e funcionando corretamente!** 🎉