const axios = require('axios');

// Configurações do teste
const BASE_URL = 'http://router.mikropix.online';
const MIKROTIK_ID = 'ad8ba643-627d-4539-a6ef-e6636ee0773b';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzM3MTM5NzM3LCJpYXQiOjE3MzcxMzYxMzcsInN1YiI6IjQwMzY3NGI2LWI3NzItNDdiZC1iNGNkLWZkNzU5YjNkMDY4NiIsImVtYWlsIjoiaG9zdHBpeEBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTczNzEzNjEzN31dLCJzZXNzaW9uX2lkIjoiMzk0NzNiNTUtNzk1My00ZjE3LTk3NjEtNGM0NDc2ZTE1Y2YzIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.qiXZYZJdyHPNQkdVUfWayGz5wkIEWYj6NzAHLKwQN0s';

// Função para delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para gerar MAC address aleatório
function generateRandomMac() {
  const chars = '0123456789ABCDEF';
  let mac = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 2 === 0) mac += ':';
    mac += chars[Math.floor(Math.random() * chars.length)];
  }
  return mac;
}

// Função para gerar IP aleatório na faixa 192.168.1.x
function generateRandomIP() {
  const lastOctet = Math.floor(Math.random() * 200) + 50; // 50-249
  return `192.168.1.${lastOctet}`;
}

// Teste 1: Criar scheduler global se não existir
async function testSetupCleanupScheduler() {
  console.log('🔧 Configurando scheduler global de limpeza...\n');
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/mikrotik/${MIKROTIK_ID}/setup-cleanup-scheduler`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('✅ Resposta do setup do scheduler:');
    console.log(`Status: ${response.status}`);
    console.log(`Data: ${JSON.stringify(response.data, null, 2)}`);

    return response.data.success;

  } catch (error) {
    console.error('❌ Erro ao configurar scheduler:', error.response?.data || error.message);
    return false;
  }
}

// Teste 2: Criar IP binding com expiração já passada (para teste)
async function testCreateExpiredBinding() {
  console.log('🧪 Criando IP binding já expirado para teste...\n');
  
  try {
    const randomMac = generateRandomMac();
    const randomIP = generateRandomIP();
    
    // Usar expiração negativa (já expirado)
    const bindingData = {
      address: randomIP,
      mac_address: randomMac,
      comment: 'Teste de expiração automática',
      expiration_minutes: -5 // 5 minutos atrás (já expirado)
    };

    console.log('📋 Dados do IP binding:');
    console.log(JSON.stringify(bindingData, null, 2));

    const response = await axios.post(
      `${BASE_URL}/api/mikrotik/public/create-ip-binding/${MIKROTIK_ID}`,
      bindingData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('✅ Resposta da criação do IP binding:');
    console.log(`Status: ${response.status}`);
    console.log(`Data: ${JSON.stringify(response.data, null, 2)}`);

    if (response.data.success) {
      console.log('\n🎯 IP binding criado com sucesso!');
      console.log(`📊 Endereço: ${randomIP}`);
      console.log(`📊 MAC: ${randomMac}`);
      console.log(`📊 Expiração: ${response.data.expiration}`);
      return { ip: randomIP, mac: randomMac, success: true };
    } else {
      console.log('\n❌ Falha ao criar IP binding');
      return { success: false };
    }

  } catch (error) {
    console.error('❌ Erro ao criar IP binding:', error.response?.data || error.message);
    return { success: false };
  }
}

// Teste 3: Listar IP bindings para verificar se foi criado
async function testListIPBindings() {
  console.log('📋 Listando IP bindings atuais...\n');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/api/mikrotik/${MIKROTIK_ID}/rest/ip/hotspot/ip-binding`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('✅ Resposta da listagem:');
    console.log(`Status: ${response.status}`);
    
    if (response.data.success && response.data.data) {
      console.log(`📊 Total de IP bindings: ${response.data.data.length}`);
      
      // Filtrar apenas bindings com expiração
      const expiredBindings = response.data.data.filter(binding => 
        binding.comment && binding.comment.includes('e:')
      );
      
      console.log(`📊 IP bindings com expiração: ${expiredBindings.length}`);
      
      if (expiredBindings.length > 0) {
        console.log('\n🔍 Bindings com expiração encontrados:');
        expiredBindings.forEach((binding, index) => {
          console.log(`${index + 1}. ${binding.address} (${binding['mac-address']}) - ${binding.comment}`);
        });
      }
      
      return expiredBindings;
    } else {
      console.log('❌ Erro ao listar IP bindings');
      return [];
    }

  } catch (error) {
    console.error('❌ Erro ao listar IP bindings:', error.response?.data || error.message);
    return [];
  }
}

// Teste 4: Aguardar e verificar se o scheduler removeu o binding expirado
async function testWaitForCleanup(targetIP, targetMac) {
  console.log('⏳ Aguardando scheduler de limpeza executar (máximo 3 minutos)...\n');
  
  const maxWaitTime = 3 * 60 * 1000; // 3 minutos
  const checkInterval = 15 * 1000; // 15 segundos
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    console.log(`🔄 Verificando... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
    
    const bindings = await testListIPBindings();
    
    // Verificar se o binding expirado ainda existe
    const expiredBindingExists = bindings.some(binding => 
      binding.address === targetIP && binding['mac-address'] === targetMac
    );
    
    if (!expiredBindingExists) {
      console.log('🎉 IP binding expirado foi removido pelo scheduler!');
      return true;
    }
    
    console.log(`⏳ IP binding ainda existe, aguardando mais ${checkInterval / 1000}s...`);
    await delay(checkInterval);
  }
  
  console.log('⏰ Timeout: Scheduler não removeu o binding no tempo esperado');
  return false;
}

// Teste 5: Verificar logs do scheduler
async function testCheckSchedulerLogs() {
  console.log('📋 Verificando logs do sistema...\n');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/api/mikrotik/${MIKROTIK_ID}/rest/log`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data.success && response.data.data) {
      // Filtrar logs do MikroPix cleanup
      const cleanupLogs = response.data.data.filter(log => 
        log.message && log.message.includes('MIKROPIX-CLEANUP')
      );
      
      console.log(`📊 Logs de cleanup encontrados: ${cleanupLogs.length}`);
      
      if (cleanupLogs.length > 0) {
        console.log('\n🔍 Logs de cleanup recentes:');
        cleanupLogs.slice(0, 5).forEach((log, index) => {
          console.log(`${index + 1}. [${log.time}] ${log.message}`);
        });
      }
      
      return cleanupLogs.length > 0;
    }

  } catch (error) {
    console.error('❌ Erro ao verificar logs:', error.response?.data || error.message);
    return false;
  }
}

// Executar todos os testes
async function runAllTests() {
  console.log('🚀 Iniciando teste completo de expiração de IP binding\n');
  console.log('=' .repeat(60));
  
  // Teste 1: Configurar scheduler global
  const schedulerSetup = await testSetupCleanupScheduler();
  
  if (!schedulerSetup) {
    console.log('❌ Falha ao configurar scheduler, abortando testes');
    return;
  }
  
  console.log('\n' + '=' .repeat(60));
  
  // Teste 2: Criar IP binding expirado
  const bindingResult = await testCreateExpiredBinding();
  
  if (!bindingResult.success) {
    console.log('❌ Falha ao criar IP binding, abortando testes');
    return;
  }
  
  console.log('\n' + '=' .repeat(60));
  
  // Teste 3: Listar bindings iniciais
  await testListIPBindings();
  
  console.log('\n' + '=' .repeat(60));
  
  // Teste 4: Aguardar limpeza
  const cleanupResult = await testWaitForCleanup(bindingResult.ip, bindingResult.mac);
  
  console.log('\n' + '=' .repeat(60));
  
  // Teste 5: Verificar logs
  await testCheckSchedulerLogs();
  
  console.log('\n' + '=' .repeat(60));
  
  // Resultado final
  if (cleanupResult) {
    console.log('✅ TESTE COMPLETO: Scheduler funcionando corretamente!');
    console.log('🎉 IP binding expirado foi removido automaticamente');
  } else {
    console.log('❌ TESTE FALHOU: Scheduler não removeu o binding expirado');
    console.log('🔧 Verifique se o scheduler está funcionando corretamente');
  }
  
  console.log('\n📊 Resumo do teste:');
  console.log(`• Scheduler configurado: ${schedulerSetup ? '✅' : '❌'}`);
  console.log(`• IP binding criado: ${bindingResult.success ? '✅' : '❌'}`);
  console.log(`• Limpeza automática: ${cleanupResult ? '✅' : '❌'}`);
}

// Executar
runAllTests().catch(console.error);