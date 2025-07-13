const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Garantir que dotenv está carregado
require('dotenv').config();

class SupabaseService {
  constructor() {
    // Verificar se as variáveis de ambiente estão definidas
    if (!process.env.SUPABASE_URL) {
      throw new Error('SUPABASE_URL não está definida no arquivo .env');
    }
    
    if (!process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_SERVICE_KEY não está definida no arquivo .env');
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }

  async testConnection() {
    try {
      const { data, error } = await this.supabase
        .from('mikrotiks')
        .select('id')
        .limit(1);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Erro ao conectar com Supabase:', error);
      throw error;
    }
  }

  async getMikrotikCredentials(mikrotikId) {
    try {
      const { data, error } = await this.supabase
        .from('mikrotiks')
        .select(`
          id,
          nome,
          ip,
          username,
          password,
          port,
          ativo,
          user_id
        `)
        .eq('id', mikrotikId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          logger.warn(`MikroTik não encontrado: ${mikrotikId}`);
          return null;
        }
        throw error;
      }

      // Verificar se está ativo
      if (!data.ativo) {
        logger.warn(`MikroTik inativo: ${mikrotikId}`);
        return { ...data, inactive: true };
      }

      logger.info(`Credenciais obtidas para MikroTik: ${data.nome} (${data.ip})`);
      return data;
    } catch (error) {
      logger.error(`Erro ao obter credenciais do MikroTik ${mikrotikId}:`, error);
      throw error;
    }
  }

  async getMikrotikByToken(token) {
    try {
      const { data, error } = await this.supabase
        .from('mikrotiks')
        .select(`
          id,
          nome,
          ip,
          username,
          password,
          port,
          ativo,
          user_id,
          token
        `)
        .eq('token', token)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          logger.warn(`Token não encontrado: ${token}`);
          return null;
        }
        throw error;
      }

      if (!data.ativo) {
        logger.warn(`MikroTik inativo para token: ${token}`);
        return { ...data, inactive: true };
      }

      return data;
    } catch (error) {
      logger.error(`Erro ao obter MikroTik por token:`, error);
      throw error;
    }
  }

  async getAllActiveMikrotiks() {
    try {
      const { data, error } = await this.supabase
        .from('mikrotiks')
        .select(`
          id,
          nome,
          ip,
          username,
          password,
          port,
          user_id
        `)
        .eq('ativo', true);

      if (error) throw error;

      logger.info(`Obtidos ${data.length} MikroTiks ativos`);
      return data;
    } catch (error) {
      logger.error('Erro ao obter MikroTiks ativos:', error);
      throw error;
    }
  }

  async logApiAccess(mikrotikId, endpoint, method, success, responseTime) {
    try {
      const { error } = await this.supabase
        .from('mikrotik_api_logs')
        .insert({
          mikrotik_id: mikrotikId,
          endpoint,
          method,
          success,
          response_time: responseTime,
          accessed_at: new Date().toISOString()
        });

      if (error) {
        logger.error('Erro ao registrar log de acesso à API:', error);
      }
    } catch (error) {
      logger.error('Erro ao registrar log de acesso:', error);
    }
  }
}

module.exports = new SupabaseService();