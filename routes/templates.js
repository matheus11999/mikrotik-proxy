const express = require('express');
const router = express.Router();
const templatesService = require('../services/templatesService');
const { authenticateByUserSession, rateLimitByUser } = require('../middleware/secureAuth');
const logger = require('../utils/logger');

// Rate limiting para templates
const templatesRateLimit = rateLimitByUser(50, 60000); // 50 requests por minuto por usuário

// Middleware para servir arquivos de templates (sem autenticação para permitir fetch do MikroTik)
router.get('/templates/:templateId/file/:filename', async (req, res) => {
  try {
    const { templateId, filename } = req.params;
    const mikrotikId = req.query.mikrotikId || '';
    
    // Extrair variáveis da query string
    const variables = { ...req.query };
    delete variables.mikrotikId; // Remover mikrotikId das variáveis
    
    logger.info(`[TEMPLATES] Servindo arquivo ${filename} do template ${templateId} para MikroTik ${mikrotikId}`);
    
    const result = templatesService.serveTemplateFile(templateId, filename, variables, mikrotikId);
    
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (result.isBuffer) {
      res.setHeader('Content-Length', result.content.length);
      res.end(result.content);
    } else {
      res.send(result.content);
    }
    
  } catch (error) {
    logger.error(`[TEMPLATES] Erro ao servir arquivo:`, error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para servir preview dos templates
router.get('/templates/:templateId/preview', (req, res) => {
  try {
    const { templateId } = req.params;
    const fs = require('fs');
    const path = require('path');
    
    const previewPath = path.join(__dirname, '../templates', templateId, 'preview.png');
    
    if (fs.existsSync(previewPath)) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      return fs.createReadStream(previewPath).pipe(res);
    } else {
      return res.status(404).json({
        success: false,
        error: 'Preview não encontrado'
      });
    }
  } catch (error) {
    logger.error(`[TEMPLATES] Erro ao servir preview:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para listar templates disponíveis
router.get('/templates', (req, res) => {
  try {
    const templates = templatesService.getAvailableTemplates();
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error(`[TEMPLATES] Erro ao listar templates:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para obter detalhes de um template específico
router.get('/templates/:templateId', (req, res) => {
  try {
    const { templateId } = req.params;
    const templateConfig = templatesService.getTemplateConfig(templateId);
    
    if (!templateConfig) {
      return res.status(404).json({
        success: false,
        error: 'Template não encontrado'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: templateId,
        ...templateConfig
      }
    });
  } catch (error) {
    logger.error(`[TEMPLATES] Erro ao obter template:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para aplicar template (com autenticação)
router.post('/templates/apply', authenticateByUserSession, templatesRateLimit, async (req, res) => {
  logger.info(`[TEMPLATES] ===== ROTA CHAMADA =====`);
  logger.info(`[TEMPLATES] Method: ${req.method}`);
  logger.info(`[TEMPLATES] Path: ${req.path}`);
  logger.info(`[TEMPLATES] Headers:`, req.headers);
  
  try {
    logger.info(`[TEMPLATES] Recebendo request para aplicar template`);
    logger.info(`[TEMPLATES] Request body:`, req.body);
    
    const { mikrotikId, templateId, serverProfileId, variables } = req.body;
    
    logger.info(`[TEMPLATES] Extracted values:`, {
      mikrotikId: mikrotikId,
      templateId: templateId,
      serverProfileId: serverProfileId,
      variables: variables,
      mikrotikIdType: typeof mikrotikId,
      templateIdType: typeof templateId,
      serverProfileIdType: typeof serverProfileId
    });
    
    if (!mikrotikId) {
      logger.error(`[TEMPLATES] MikroTik ID is missing or empty`);
      return res.status(400).json({
        success: false,
        error: 'MikroTik ID obrigatório'
      });
    }
    
    if (!templateId) {
      logger.error(`[TEMPLATES] Template ID is missing or empty`);
      return res.status(400).json({
        success: false,
        error: 'Template ID obrigatório'
      });
    }
    
    if (!serverProfileId) {
      logger.error(`[TEMPLATES] Server Profile ID is missing or empty`);
      return res.status(400).json({
        success: false,
        error: 'Server Profile ID obrigatório'
      });
    }
    
    // Validar variáveis obrigatórias
    templatesService.validateVariables(templateId, variables || {});
    
    // Aplicar template
    const result = await templatesService.applyTemplate(mikrotikId, templateId, serverProfileId, variables || {}, req.user.id);
    
    res.json({
      success: true,
      message: 'Template aplicado com sucesso',
      data: result
    });
    
  } catch (error) {
    logger.error(`[TEMPLATES] Erro ao aplicar template:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Middleware de tratamento de erros para templates
router.use((err, req, res, next) => {
  logger.error(`[TEMPLATES] Middleware error:`, err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Erro interno do servidor'
  });
});

module.exports = router;