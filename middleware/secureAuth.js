const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');

// Cache em memória para otimização de performance
const userCache = new Map();
const mikrotikCache = new Map();
const CACHE_TTL = 300000; // 5 minutos

// Função para limpar cache expirado
function cleanExpiredCache() {
  const now = Date.now();
  
  for (const [key, entry] of userCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      userCache.delete(key);
    }
  }
  
  for (const [key, entry] of mikrotikCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      mikrotikCache.delete(key);
    }
  }
}

// Limpar cache a cada 2 minutos
setInterval(cleanExpiredCache, 120000);

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
    const tokenHash = userSessionToken.substring(0, 16); // Hash curto para cache
    
    // Verificar cache primeiro
    let user = null;
    const cachedUser = userCache.get(tokenHash);
    
    if (cachedUser && (Date.now() - cachedUser.timestamp) < CACHE_TTL) {
      user = cachedUser.user;
      logger.debug(`User cache hit for ${user.email}`);
    } else {
      // Verificar o token do usuário no Supabase
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      // Verificar sessão do usuário
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(userSessionToken);
      
      if (authError || !authUser) {
        logger.warn('Sessão de usuário inválida:', authError?.message);
        return res.status(401).json({
          error: 'Sessão inválida',
          code: 'INVALID_SESSION'
        });
      }
      
      user = authUser;
      
      // Cache do usuário
      userCache.set(tokenHash, {
        user,
        timestamp: Date.now()
      });
      
      logger.debug(`User cached for ${user.email}`);
    }

    // Obter o MikroTik específico e verificar ownership
    const mikrotikId = req.params.mikrotikId;
    
    if (!mikrotikId) {
      return res.status(400).json({
        error: 'MikroTik ID obrigatório',
        code: 'MISSING_MIKROTIK_ID'
      });
    }

    // Cache de MikroTik com verificação de ownership
    const mikrotikCacheKey = `${mikrotikId}-${user.id}`;
    let mikrotik = null;
    const cachedMikrotik = mikrotikCache.get(mikrotikCacheKey);
    
    if (cachedMikrotik && (Date.now() - cachedMikrotik.timestamp) < CACHE_TTL) {
      mikrotik = cachedMikrotik.mikrotik;
      logger.debug(`MikroTik cache hit for ${mikrotik.nome}`);
    } else {
      // Buscar MikroTik e verificar se o usuário é o dono
      mikrotik = await supabaseService.getMikrotikCredentials(mikrotikId);
      
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
      
      // Cache do MikroTik
      mikrotikCache.set(mikrotikCacheKey, {
        mikrotik,
        timestamp: Date.now()
      });
      
      logger.debug(`MikroTik cached for ${mikrotik.nome}`);
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

// Rate limiting otimizado com sliding window
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
      userRateLimits.set(userId, {
        requests: [],
        lastCleanup: now
      });
    }
    
    const userLimit = userRateLimits.get(userId);
    
    // Limpeza otimizada: só remove antigas se passou 10s desde última limpeza
    if (now - userLimit.lastCleanup > 10000) {
      userLimit.requests = userLimit.requests.filter(time => time > windowStart);
      userLimit.lastCleanup = now;
    }
    
    // Verificar se excedeu limite (conta inclusive requisições antigas que ainda não foram limpas)
    const recentRequests = userLimit.requests.filter(time => time > windowStart);
    
    if (recentRequests.length >= maxRequests) {
      logger.warn(`Rate limit excedido para usuário ${req.user.email}: ${recentRequests.length}/${maxRequests}`);
      
      // Headers informativos
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': Math.ceil((recentRequests[0] + windowMs) / 1000),
        'Retry-After': Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
      
      return res.status(429).json({
        error: `Muitas requisições. Máximo ${maxRequests} por minuto por usuário.`,
        code: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }
    
    // Adicionar requisição atual
    userLimit.requests.push(now);
    
    // Headers informativos para sucesso
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - recentRequests.length - 1),
      'X-RateLimit-Reset': Math.ceil((now + windowMs) / 1000)
    });
    
    next();
  };
}

// Limpar rate limits antigos periodicamente
setInterval(() => {
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  
  for (const [userId, userLimit] of userRateLimits.entries()) {
    const validRequests = userLimit.requests.filter(time => time > (now - windowMs));
    
    if (validRequests.length === 0) {
      // Remove usuário se não tem requisições recentes
      userRateLimits.delete(userId);
    } else {
      userLimit.requests = validRequests;
      userLimit.lastCleanup = now;
    }
  }
}, 120000); // Executa a cada 2 minutos

module.exports = {
  authenticateByUserSession,
  rateLimitByUser
};