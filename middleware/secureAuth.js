const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');

// Middleware de autenticação segura usando session token do usuário
async function authenticateByUserSession(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Token de autorização obrigatório',
        code: 'MISSING_TOKEN'
      });
    }

    const userSessionToken = authHeader.substring(7);
    
    // Verificar o token do usuário no Supabase
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Verificar sessão do usuário
    const { data: { user }, error: authError } = await supabase.auth.getUser(userSessionToken);
    
    if (authError || !user) {
      logger.warn('Sessão de usuário inválida:', authError?.message);
      return res.status(401).json({
        error: 'Sessão inválida',
        code: 'INVALID_SESSION'
      });
    }

    // Obter o MikroTik específico e verificar ownership
    const mikrotikId = req.params.mikrotikId;
    
    if (!mikrotikId) {
      return res.status(400).json({
        error: 'MikroTik ID obrigatório',
        code: 'MISSING_MIKROTIK_ID'
      });
    }

    // Buscar MikroTik e verificar se o usuário é o dono
    const mikrotik = await supabaseService.getMikrotikCredentials(mikrotikId);
    
    if (!mikrotik) {
      return res.status(404).json({
        error: 'MikroTik não encontrado',
        code: 'MIKROTIK_NOT_FOUND'
      });
    }

    if (mikrotik.user_id !== user.id) {
      logger.warn(`Tentativa de acesso não autorizado ao MikroTik ${mikrotikId} pelo usuário ${user.id}`);
      return res.status(403).json({
        error: 'Acesso negado - MikroTik não pertence ao usuário',
        code: 'UNAUTHORIZED_ACCESS'
      });
    }

    if (!mikrotik.ativo) {
      return res.status(403).json({
        error: 'MikroTik inativo',
        code: 'MIKROTIK_INACTIVE'
      });
    }

    // Adicionar informações ao request
    req.user = user;
    req.mikrotik = mikrotik;
    req.mikrotikId = mikrotik.id;
    
    logger.info(`Acesso autorizado ao MikroTik ${mikrotik.nome} pelo usuário ${user.email}`);
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação segura:', error);
    res.status(500).json({
      error: 'Erro interno na autenticação',
      code: 'AUTH_ERROR'
    });
  }
}

// Rate limiting baseado no usuário
const userRateLimits = new Map();

function rateLimitByUser(maxRequests = 60, windowMs = 60000) {
  return (req, res, next) => {
    const userId = req.user?.id;
    
    if (!userId) {
      return next();
    }

    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!userRateLimits.has(userId)) {
      userRateLimits.set(userId, []);
    }
    
    const requests = userRateLimits.get(userId);
    
    // Remove requisições antigas
    const recentRequests = requests.filter(time => time > windowStart);
    userRateLimits.set(userId, recentRequests);
    
    if (recentRequests.length >= maxRequests) {
      logger.warn(`Rate limit excedido para usuário ${req.user.email}: ${recentRequests.length}/${maxRequests}`);
      return res.status(429).json({
        error: `Muitas requisições. Máximo ${maxRequests} por minuto por usuário.`,
        code: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }
    
    // Adicionar requisição atual
    recentRequests.push(now);
    
    next();
  };
}

module.exports = {
  authenticateByUserSession,
  rateLimitByUser
};