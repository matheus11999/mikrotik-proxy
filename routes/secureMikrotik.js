const express = require('express');
const router = express.Router();
const mikrotikService = require('../services/mikrotikService');
const supabaseService = require('../services/supabaseService');
const { authenticateByUserSession, rateLimitByUser } = require('../middleware/secureAuth');
const { metricsCollector } = require('../middleware/metrics');
const logger = require('../utils/logger');

// Rate limiting otimizado baseado no usuário
const userRateLimit = rateLimitByUser(
  parseInt(process.env.USER_RATE_LIMIT_MAX_REQUESTS) || 100, // Aumentado para produção
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000
);

// Rota segura para fazer requisições genéricas para a API REST do MikroTik
router.all('/:mikrotikId/rest/*', 
  authenticateByUserSession,
  userRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const endpoint = '/' + req.params[0]; // Captura tudo após /rest/
      const method = req.method;
      const data = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : null;

      logger.info(`Secure proxy request to MikroTik`, {
        mikrotikId,
        endpoint,
        method,
        hasData: !!data,
        userId: req.user.id,
        userEmail: req.user.email
      });

      // Verificação rápida de cache offline (otimizado)
      const cachedOffline = metricsCollector.isDeviceCachedOffline(req.mikrotik);
      if (cachedOffline) {
        const cacheExpiresIn = Math.max(0, metricsCollector.metrics.offlineCacheDuration - (Date.now() - cachedOffline.timestamp));
        
        // Headers de cache para otimização do cliente
        res.set({
          'Cache-Control': `private, max-age=${Math.ceil(cacheExpiresIn / 1000)}`,
          'X-Cache': 'HIT-OFFLINE',
          'X-Cache-Expires': cacheExpiresIn
        });
        
        // Resposta rápida sem logs desnecessários
        return res.status(200).json({
          success: false,
          error: 'MikroTik offline (cached)',
          code: 'DEVICE_OFFLINE',
          responseTime: 0,
          cached: true,
          cacheExpiresIn
        });
      }

      // Fazer a requisição para o MikroTik
      const result = await mikrotikService.makeRequest(req.mikrotik, endpoint, method, data);
      const responseTime = Date.now() - startTime;

      // Log assíncrono para não bloquear resposta
      setImmediate(() => {
        supabaseService.logApiAccess(mikrotikId, endpoint, method, result.success, responseTime)
          .catch(err => logger.debug('Log API access failed:', err.message));
      });

      // Headers de performance
      res.set({
        'X-Response-Time': `${responseTime}ms`,
        'X-Cache': 'MISS',
        'X-MikroTik-Id': mikrotikId
      });

      if (result.success) {
        // Cache headers para sucesso
        res.set('Cache-Control', 'private, max-age=5'); // Cache curto para dados dinâmicos
        
        res.status(result.status || 200).json({
          success: true,
          data: result.data,
          responseTime: result.responseTime
        });
      } else {
        // Dispositivos offline devem retornar status 200, não 500
        const statusCode = result.code === 'DEVICE_OFFLINE' ? 200 : (result.status || 500);
        
        // Headers específicos para erros
        if (result.code === 'DEVICE_OFFLINE') {
          res.set('Cache-Control', 'private, max-age=30'); // Cache mais longo para offline
        }
        
        res.status(statusCode).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime: result.responseTime
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Erro no proxy seguro MikroTik:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR',
        responseTime
      });
    }
  }
);

// Rota para testar conexão com MikroTik de forma segura
router.get('/:mikrotikId/test', 
  authenticateByUserSession,
  userRateLimit,
  async (req, res) => {
    try {
      const { mikrotikId } = req.params;

      logger.info(`Teste de conexão seguro para MikroTik ${mikrotikId}`, {
        userId: req.user.id,
        userEmail: req.user.email
      });

      // Verificar cache primeiro
      const cachedOffline = metricsCollector.isDeviceCachedOffline(req.mikrotik);
      if (cachedOffline) {
        return res.json({
          success: false,
          error: 'MikroTik offline (cached)',
          code: 'DEVICE_OFFLINE',
          cached: true,
          cacheExpiresIn: Math.max(0, metricsCollector.metrics.offlineCacheDuration - (Date.now() - cachedOffline.timestamp))
        });
      }

      const result = await mikrotikService.testConnection(req.mikrotik);

      res.json(result);
    } catch (error) {
      logger.error(`Erro no teste de conexão seguro para ${req.params.mikrotikId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Erro interno no teste de conexão',
        code: 'TEST_ERROR'
      });
    }
  }
);

// Rota para listar MikroTiks do usuário
router.get('/list', 
  authenticateByUserSession,
  async (req, res) => {
    try {
      logger.info(`Listando MikroTiks do usuário`, {
        userId: req.user.id,
        userEmail: req.user.email
      });

      const { data: mikrotiks, error } = await supabaseService.supabase
        .from('mikrotiks')
        .select('id, nome, ip, ativo, created_at')
        .eq('user_id', req.user.id)
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;

      res.json({
        success: true,
        data: mikrotiks,
        count: mikrotiks.length
      });
    } catch (error) {
      logger.error('Erro ao listar MikroTiks do usuário:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar MikroTiks',
        code: 'LIST_ERROR'
      });
    }
  }
);

// Rota para verificar/criar scheduler global de limpeza
router.post('/:mikrotikId/setup-cleanup-scheduler', 
  authenticateByUserSession,
  userRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;

      logger.info(`Configurando scheduler global de limpeza`, {
        mikrotikId,
        userId: req.user.id,
        userEmail: req.user.email
      });

      // Verificação rápida de cache offline
      const cachedOffline = metricsCollector.isDeviceCachedOffline(req.mikrotik);
      if (cachedOffline) {
        const cacheExpiresIn = Math.max(0, metricsCollector.metrics.offlineCacheDuration - (Date.now() - cachedOffline.timestamp));
        
        res.set({
          'Cache-Control': `private, max-age=${Math.ceil(cacheExpiresIn / 1000)}`,
          'X-Cache': 'HIT-OFFLINE',
          'X-Cache-Expires': cacheExpiresIn
        });
        
        return res.status(200).json({
          success: false,
          error: 'MikroTik offline (cached)',
          code: 'DEVICE_OFFLINE',
          responseTime: 0,
          cached: true,
          cacheExpiresIn
        });
      }

      // Verificar se o scheduler já existe
      const existingSchedulers = await mikrotikService.makeRequest(
        req.mikrotik, 
        '/system/scheduler', 
        'GET'
      );

      let cleanupSchedulerExists = false;
      if (existingSchedulers.success && existingSchedulers.data) {
        cleanupSchedulerExists = existingSchedulers.data.some(scheduler => 
          scheduler.name === 'mikropix-ip-binding-cleanup'
        );
      }

      if (cleanupSchedulerExists) {
        const responseTime = Date.now() - startTime;
        res.set({
          'X-Response-Time': `${responseTime}ms`,
          'X-Cache': 'MISS',
          'X-MikroTik-Id': mikrotikId
        });

        return res.status(200).json({
          success: true,
          message: 'Scheduler global de limpeza já existe',
          exists: true,
          responseTime
        });
      }

      // Criar scheduler global de limpeza
      const cleanupScript = `
        :local now [/system clock get time];
        :local today [/system clock get date];
        :local currentTimestamp [:totime ("$today $now")];
        
        :foreach binding in=[/ip hotspot ip-binding find] do={
          :local comment [/ip hotspot ip-binding get $binding comment];
          :if ([:find $comment "e:"] >= 0) do={
            :local expiryStart ([:find $comment "e:"] + 2);
            :local expiryEnd [:find $comment " " $expiryStart];
            :if ($expiryEnd < 0) do={ :set expiryEnd [:len $comment] };
            :local expiryStr [:pick $comment $expiryStart $expiryEnd];
            
            :do {
              :local expiryTimestamp [:totime $expiryStr];
              :if ($currentTimestamp > $expiryTimestamp) do={
                :local address [/ip hotspot ip-binding get $binding address];
                :local mac [/ip hotspot ip-binding get $binding mac-address];
                /ip hotspot ip-binding remove $binding;
                :log info "[MIKROPIX-CLEANUP] IP binding expirado removido: $address ($mac)";
              }
            } on-error={
              :log warning "[MIKROPIX-CLEANUP] Erro ao processar expiracao: $comment";
            }
          }
        }
      `;

      const schedulerData = {
        name: 'mikropix-ip-binding-cleanup',
        'start-time': 'startup',
        interval: '2m',
        'on-event': cleanupScript.trim(),
        policy: 'read,write,policy,test',
        disabled: 'false',
        comment: 'MIKROPIX - Remove IP bindings expirados automaticamente'
      };

      // Criar o scheduler
      const result = await mikrotikService.makeRequest(
        req.mikrotik, 
        '/system/scheduler/add', 
        'POST', 
        schedulerData
      );

      const responseTime = Date.now() - startTime;

      // Log assíncrono
      setImmediate(() => {
        supabaseService.logApiAccess(mikrotikId, '/system/scheduler/add', 'POST', result.success, responseTime)
          .catch(err => logger.debug('Log API access failed:', err.message));
      });

      // Headers de performance
      res.set({
        'X-Response-Time': `${responseTime}ms`,
        'X-Cache': 'MISS',
        'X-MikroTik-Id': mikrotikId
      });

      if (result.success) {
        res.status(201).json({
          success: true,
          message: 'Scheduler global de limpeza criado com sucesso',
          data: result.data,
          responseTime: result.responseTime
        });
      } else {
        const statusCode = result.code === 'DEVICE_OFFLINE' ? 200 : (result.status || 500);
        
        res.status(statusCode).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime: result.responseTime
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Erro ao configurar scheduler global:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR',
        responseTime
      });
    }
  }
);

// Rota para criar scheduler no MikroTik
router.post('/:mikrotikId/scheduler', 
  authenticateByUserSession,
  userRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const { 
        name, 
        start_date, 
        start_time, 
        interval,
        count,
        on_event,
        policy = 'read,write,policy,test',
        disabled = false,
        comment = ''
      } = req.body;

      // Validação dos campos obrigatórios
      if (!name || !start_date || !start_time || !on_event) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: name, start_date, start_time, on_event',
          code: 'MISSING_REQUIRED_FIELDS'
        });
      }

      logger.info(`Criando scheduler no MikroTik`, {
        mikrotikId,
        name,
        start_date,
        start_time,
        userId: req.user.id,
        userEmail: req.user.email
      });

      // Verificação rápida de cache offline
      const cachedOffline = metricsCollector.isDeviceCachedOffline(req.mikrotik);
      if (cachedOffline) {
        const cacheExpiresIn = Math.max(0, metricsCollector.metrics.offlineCacheDuration - (Date.now() - cachedOffline.timestamp));
        
        res.set({
          'Cache-Control': `private, max-age=${Math.ceil(cacheExpiresIn / 1000)}`,
          'X-Cache': 'HIT-OFFLINE',
          'X-Cache-Expires': cacheExpiresIn
        });
        
        return res.status(200).json({
          success: false,
          error: 'MikroTik offline (cached)',
          code: 'DEVICE_OFFLINE',
          responseTime: 0,
          cached: true,
          cacheExpiresIn
        });
      }

      // Preparar dados do scheduler
      const schedulerData = {
        name,
        'start-date': start_date,
        'start-time': start_time,
        policy,
        'on-event': on_event,
        disabled: disabled.toString()
      };

      // Campos opcionais
      if (interval) schedulerData.interval = interval;
      if (count) schedulerData.count = count.toString();
      if (comment) schedulerData.comment = comment;

      // Fazer requisição para criar o scheduler
      const result = await mikrotikService.makeRequest(
        req.mikrotik, 
        '/system/scheduler/add', 
        'POST', 
        schedulerData
      );

      const responseTime = Date.now() - startTime;

      // Log assíncrono
      setImmediate(() => {
        supabaseService.logApiAccess(mikrotikId, '/system/scheduler/add', 'POST', result.success, responseTime)
          .catch(err => logger.debug('Log API access failed:', err.message));
      });

      // Headers de performance
      res.set({
        'X-Response-Time': `${responseTime}ms`,
        'X-Cache': 'MISS',
        'X-MikroTik-Id': mikrotikId
      });

      if (result.success) {
        res.status(201).json({
          success: true,
          message: 'Scheduler criado com sucesso',
          data: result.data,
          responseTime: result.responseTime
        });
      } else {
        const statusCode = result.code === 'DEVICE_OFFLINE' ? 200 : (result.status || 500);
        
        res.status(statusCode).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime: result.responseTime
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Erro ao criar scheduler:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR',
        responseTime
      });
    }
  }
);

module.exports = router;