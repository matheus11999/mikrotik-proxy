const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');

// Middleware para autenticação por token
async function authenticateByToken(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Token de autenticação não fornecido',
        code: 'MISSING_TOKEN'
      });
    }

    const mikrotik = await supabaseService.getMikrotikByToken(token);
    
    if (!mikrotik) {
      return res.status(401).json({
        error: 'Token inválido',
        code: 'INVALID_TOKEN'
      });
    }

    if (mikrotik.inactive) {
      return res.status(403).json({
        error: 'MikroTik inativo',
        code: 'MIKROTIK_INACTIVE'
      });
    }

    // Adicionar informações do MikroTik ao request
    req.mikrotik = mikrotik;
    req.mikrotikId = mikrotik.id;
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação por token:', error);
    res.status(500).json({
      error: 'Erro interno na autenticação',
      code: 'AUTH_ERROR'
    });
  }
}

// Middleware para autenticação por ID do MikroTik
async function authenticateByMikrotikId(req, res, next) {
  try {
    const mikrotikId = req.headers['x-mikrotik-id'] || req.params.mikrotikId;
    
    if (!mikrotikId) {
      return res.status(400).json({
        error: 'ID do MikroTik não fornecido',
        code: 'MISSING_MIKROTIK_ID'
      });
    }

    const mikrotik = await supabaseService.getMikrotikCredentials(mikrotikId);
    
    if (!mikrotik) {
      return res.status(404).json({
        error: 'MikroTik não encontrado',
        code: 'MIKROTIK_NOT_FOUND'
      });
    }

    if (mikrotik.inactive) {
      return res.status(403).json({
        error: 'MikroTik inativo',
        code: 'MIKROTIK_INACTIVE'
      });
    }

    // Adicionar informações do MikroTik ao request
    req.mikrotik = mikrotik;
    req.mikrotikId = mikrotik.id;
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação por MikroTik ID:', error);
    res.status(500).json({
      error: 'Erro interno na autenticação',
      code: 'AUTH_ERROR'
    });
  }
}

// Middleware para validar parâmetros da requisição
function validateRequest(requiredFields = []) {
  return (req, res, next) => {
    const missingFields = [];
    
    requiredFields.forEach(field => {
      if (!req.body[field] && req.body[field] !== 0 && req.body[field] !== false) {
        missingFields.push(field);
      }
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`,
        code: 'MISSING_REQUIRED_FIELDS',
        missingFields
      });
    }

    next();
  };
}

// Middleware para rate limiting por MikroTik
const mikrotikRateLimits = new Map();

function rateLimitByMikrotik(maxRequests = 30, windowMs = 60000) {
  return (req, res, next) => {
    const mikrotikId = req.mikrotikId;
    
    if (!mikrotikId) {
      return next();
    }

    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!mikrotikRateLimits.has(mikrotikId)) {
      mikrotikRateLimits.set(mikrotikId, []);
    }

    const requests = mikrotikRateLimits.get(mikrotikId);
    
    // Remover requisições antigas
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    mikrotikRateLimits.set(mikrotikId, validRequests);

    if (validRequests.length >= maxRequests) {
      logger.warn(`Rate limit excedido para MikroTik ${mikrotikId}`);
      return res.status(429).json({
        error: `Limite de ${maxRequests} requisições por minuto excedido para este MikroTik`,
        code: 'MIKROTIK_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
      });
    }

    // Adicionar esta requisição
    validRequests.push(now);
    mikrotikRateLimits.set(mikrotikId, validRequests);

    next();
  };
}

module.exports = {
  authenticateByToken,
  authenticateByMikrotikId,
  validateRequest,
  rateLimitByMikrotik
};