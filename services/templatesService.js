const RouterOSAPI = require('node-routeros').RouterOSAPI;
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const supabaseService = require('./supabaseService');

class TemplatesService {
  constructor() {
    this.templatesPath = path.join(__dirname, '../templates');
  }

  // Obter lista de templates disponíveis
  getAvailableTemplates() {
    try {
      const templateDirs = fs.readdirSync(this.templatesPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const templates = [];

      for (const templateDir of templateDirs) {
        const templateConfig = this.getTemplateConfig(templateDir);
        
        if (templateConfig) {
          templates.push({
            id: templateDir,
            name: templateConfig.name,
            description: templateConfig.description,
            variables: templateConfig.variables,
            preview: templateConfig.preview
          });
        }
      }

      return templates;
    } catch (error) {
      logger.error('Erro ao listar templates:', error);
      return [];
    }
  }

  // Obter configuração de um template específico
  getTemplateConfig(templateId) {
    const configs = {
      template1: {
        name: 'Template 1',
        description: 'Template simples e limpo para hotspot',
        preview: `${process.env.PROXY_BASE_URL || 'http://router.mikropix.online:3001'}/api/mikrotik/templates/template1/preview`,
        variables: [
          {
            key: 'PRIMARY_COLOR',
            label: 'Cor Primária',
            type: 'color',
            required: false,
            placeholder: '#3b82f6'
          },
          {
            key: 'LOGO_ICON',
            label: 'Ícone/Logo',
            type: 'text',
            required: false,
            placeholder: '🌐 ou <img src="logo.png" alt="Logo">'
          },
          {
            key: 'WELCOME_TITLE',
            label: 'Título de Boas-vindas',
            type: 'text',
            required: false,
            placeholder: 'Bem-vindo à nossa rede'
          },
          {
            key: 'WELCOME_MESSAGE',
            label: 'Mensagem de Boas-vindas',
            type: 'text',
            required: false,
            placeholder: 'Conecte-se para acessar a internet'
          },
          {
            key: 'DEBUG_MODE',
            label: 'Modo Debug',
            type: 'select',
            required: false,
            options: [
              { value: 'true', label: 'Ativado' },
              { value: 'false', label: 'Desativado' }
            ],
            placeholder: 'false'
          }
        ]
      },
      template2: {
        name: 'Template 2',
        description: 'Template otimizado para dispositivos móveis',
        preview: `${process.env.PROXY_BASE_URL || 'http://router.mikropix.online:3001'}/api/mikrotik/templates/template2/preview`,
        variables: [
          {
            key: 'PROVIDER_NAME',
            label: 'Nome do Provedor',
            type: 'text',
            required: true,
            placeholder: 'Ex: MikroPix Internet'
          },
          {
            key: 'LOGO_URL',
            label: 'URL do Logo',
            type: 'url',
            required: false,
            placeholder: 'https://exemplo.com/logo.png'
          },
          {
            key: 'PRIMARY_COLOR',
            label: 'Cor Primária',
            type: 'color',
            required: false,
            placeholder: '#3b82f6'
          },
          {
            key: 'WELCOME_MESSAGE',
            label: 'Mensagem de Boas-vindas',
            type: 'text',
            required: false,
            placeholder: 'Bem-vindo ao nosso hotspot!'
          },
          {
            key: 'DEBUG_MODE',
            label: 'Modo Debug',
            type: 'select',
            required: false,
            options: [
              { value: 'true', label: 'Ativado' },
              { value: 'false', label: 'Desativado' }
            ],
            placeholder: 'false'
          }
        ]
      }
    };

    return configs[templateId] || null;
  }

  // Obter todos os arquivos de um template recursivamente
  getTemplateFiles(templateId) {
    const templatePath = path.join(this.templatesPath, templateId);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template ${templateId} não encontrado`);
    }

    const files = [];
    this.scanDirectoryRecursive(templatePath, templatePath, files);
    
    return files.filter(file => 
      !file.name.includes('preview.') && // Excluir previews
      !file.name.includes('node_modules') // Excluir node_modules
    );
  }

  // Escanear diretório recursivamente
  scanDirectoryRecursive(currentPath, basePath, files) {
    const items = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(currentPath, item.name);
      const relativePath = path.relative(basePath, itemPath);

      if (item.isDirectory()) {
        // Recursivamente escanear subdiretórios
        this.scanDirectoryRecursive(itemPath, basePath, files);
      } else {
        // Adicionar arquivo à lista
        files.push({
          name: relativePath.replace(/\\/g, '/'), // Normalizar separadores
          fullPath: itemPath,
          relativePath: relativePath.replace(/\\/g, '/'),
          size: fs.statSync(itemPath).size
        });
      }
    }
  }

  // Processar conteúdo de um arquivo com substituição de variáveis
  processFileContent(filePath, variables, mikrotikId, templateId) {
    try {
      const extension = path.extname(filePath).toLowerCase();
      
      // Para arquivos de imagem, ler como buffer
      if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'].includes(extension)) {
        return fs.readFileSync(filePath);
      }

      // Para arquivos de texto, ler como string e processar variáveis
      let content = fs.readFileSync(filePath, 'utf8');

      // Substituir variáveis automáticas do sistema
      const systemVariables = {
        'MIKROTIK_ID': mikrotikId || '',
        'API_URL': process.env.PROXY_BASE_URL || 'http://router.mikropix.online:3001',
        'TIMESTAMP': new Date().toISOString()
      };

      Object.entries(systemVariables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value);
      });

      // Substituir variáveis do usuário
      if (variables && typeof variables === 'object') {
        Object.entries(variables).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            content = content.replace(regex, value);
          }
        });
      }

      // Aplicar valores padrão para variáveis não fornecidas
      const templateConfig = this.getTemplateConfig(templateId);
      if (templateConfig && templateConfig.variables) {
        templateConfig.variables.forEach(variable => {
          const regex = new RegExp(`{{${variable.key}}}`, 'g');
          const userValue = variables && variables[variable.key];
          
          if (!userValue && variable.placeholder) {
            let defaultValue = variable.placeholder;
            
            // Para tipo select, usar o primeiro valor das opções
            if (variable.type === 'select' && variable.options && variable.options.length > 0) {
              const placeholderOption = variable.options.find(opt => opt.value === variable.placeholder);
              defaultValue = placeholderOption ? placeholderOption.value : variable.options[0].value;
            }
            
            content = content.replace(regex, defaultValue);
          }
        });
      }

      return content;
    } catch (error) {
      logger.error(`Erro ao processar arquivo ${filePath}:`, error);
      throw error;
    }
  }

  // Servir arquivo com substituição de variáveis
  serveTemplateFile(templateId, filename, variables = {}, mikrotikId = '') {
    try {
      const templatePath = path.join(this.templatesPath, templateId);
      const filePath = path.join(templatePath, filename);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo ${filename} não encontrado no template ${templateId}`);
      }

      const content = this.processFileContent(filePath, variables, mikrotikId, templateId);
      const extension = path.extname(filePath).toLowerCase();

      // Retornar tipo MIME baseado na extensão
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.xml': 'application/xml; charset=utf-8',
        '.xsd': 'application/xml; charset=utf-8'
      };

      const mimeType = mimeTypes[extension] || 'text/html; charset=utf-8';

      return {
        content,
        mimeType,
        isBuffer: Buffer.isBuffer(content)
      };
    } catch (error) {
      logger.error(`Erro ao servir arquivo ${filename} do template ${templateId}:`, error);
      throw error;
    }
  }

  // Conectar ao MikroTik usando node-routeros
  async connectToMikroTik(mikrotikConfig) {
    try {
      const conn = new RouterOSAPI({
        host: mikrotikConfig.ip,
        user: mikrotikConfig.username,
        password: mikrotikConfig.password,
        port: 8728,
        timeout: 10000
      });

      await conn.connect();
      logger.info(`Conectado ao MikroTik ${mikrotikConfig.ip} via RouterOS API`);
      return conn;
    } catch (error) {
      logger.error(`Erro ao conectar ao MikroTik ${mikrotikConfig.ip}:`, error);
      throw error;
    }
  }

  // Aplicar template usando node-routeros
  async applyTemplate(mikrotikId, templateId, serverProfileId, variables = {}, userId = null) {
    try {
      logger.info(`[TEMPLATES] Aplicando template ${templateId} ao MikroTik ${mikrotikId}`);

      // Obter configuração do MikroTik
      const mikrotikConfig = await supabaseService.getMikrotikCredentials(mikrotikId);
      if (!mikrotikConfig) {
        throw new Error(`MikroTik ${mikrotikId} não encontrado`);
      }

      // Verificar se o usuário é dono do MikroTik (se userId foi fornecido)
      if (userId && mikrotikConfig.user_id !== userId) {
        throw new Error('Usuário não autorizado para este MikroTik');
      }

      // Verificar se o MikroTik está ativo
      if (mikrotikConfig.inactive) {
        throw new Error('MikroTik está inativo');
      }

      // Conectar ao MikroTik
      const conn = await this.connectToMikroTik(mikrotikConfig);

      try {
        // Obter arquivos do template
        const templateFiles = this.getTemplateFiles(templateId);
        
        const baseURL = process.env.PROXY_BASE_URL || 'http://router.mikropix.online:3001';
        const results = [];

        // Criar diretório /flash/mikropix2/ se não existir
        try {
          await conn.write('/file/add', {
            name: '/flash/mikropix2',
            type: 'directory'
          });
        } catch (error) {
          // Ignorar se o diretório já existe
          if (!error.message.includes('already exists')) {
            logger.warn('Erro ao criar diretório /flash/mikropix2:', error.message);
          }
        }

        // Fazer download de cada arquivo usando tool fetch
        for (const file of templateFiles) {
          const fileUrl = `${baseURL}/api/mikrotik/templates/${templateId}/file/${encodeURIComponent(file.relativePath)}?mikrotikId=${mikrotikId}&${new URLSearchParams(variables).toString()}`;
          const targetPath = `/flash/mikropix2/${file.relativePath}`;

          logger.info(`[TEMPLATES] Baixando arquivo: ${file.relativePath}`);
          logger.info(`[TEMPLATES] URL: ${fileUrl}`);
          logger.info(`[TEMPLATES] Destino: ${targetPath}`);

          try {
            const result = await conn.write('/tool/fetch', {
              url: fileUrl,
              dst: targetPath
            });

            results.push({
              file: file.relativePath,
              success: true,
              result: result
            });

            logger.info(`[TEMPLATES] ✅ Arquivo ${file.relativePath} baixado com sucesso`);
          } catch (error) {
            logger.error(`[TEMPLATES] ❌ Erro ao baixar arquivo ${file.relativePath}:`, error);
            results.push({
              file: file.relativePath,
              success: false,
              error: error.message
            });
          }
        }

        // Atualizar server profile para usar o novo template
        try {
          await conn.write(`/ip/hotspot/server/profile/set`, {
            '.id': serverProfileId,
            'html-directory': '/flash/mikropix2/'
          });

          logger.info(`[TEMPLATES] ✅ Server profile ${serverProfileId} atualizado`);
        } catch (error) {
          logger.error(`[TEMPLATES] ❌ Erro ao atualizar server profile:`, error);
        }

        return {
          success: true,
          message: 'Template aplicado com sucesso',
          results: results,
          totalFiles: templateFiles.length,
          successCount: results.filter(r => r.success).length
        };

      } finally {
        // Desconectar do MikroTik
        await conn.close();
      }

    } catch (error) {
      logger.error(`[TEMPLATES] Erro ao aplicar template:`, error);
      throw error;
    }
  }

  // Validar variáveis obrigatórias
  validateVariables(templateId, variables) {
    const templateConfig = this.getTemplateConfig(templateId);
    
    if (!templateConfig) {
      throw new Error(`Template ${templateId} não encontrado`);
    }

    const requiredVariables = templateConfig.variables.filter(v => v.required);
    const missingVariables = [];

    for (const variable of requiredVariables) {
      if (!variables[variable.key] || variables[variable.key].trim() === '') {
        missingVariables.push(variable.label);
      }
    }

    if (missingVariables.length > 0) {
      throw new Error(`Variáveis obrigatórias não preenchidas: ${missingVariables.join(', ')}`);
    }

    return true;
  }
}

module.exports = new TemplatesService();