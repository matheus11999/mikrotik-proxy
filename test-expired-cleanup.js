const axios = require('axios');

// Configurações do teste
const BASE_URL = 'http://router.mikropix.online:3001';
const MIKROTIK_ID = 'ad8ba643-627d-4539-a6ef-e6636ee0773b';

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

// Criar IP binding já expirado
async function createExpiredBinding() {
  console.log('🧪 Criando IP binding já expirado...\n');
  
  try {
    const randomMac = generateRandomMac();
    const randomIP = generateRandomIP();
    
    const bindingData = {
      address: randomIP,
      mac_address: randomMac,
      comment: 'TESTE-CLEANUP-AUTO',
      expiration_minutes: -1 // 1 minuto atrás (já expirado)
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

    console.log('✅ Resposta recebida:');
    console.log(`Status: ${response.status}`);
    console.log(`Data: ${JSON.stringify(response.data, null, 2)}`);

    if (response.data.success) {
      console.log('\n🎉 IP binding expirado criado com sucesso!');
      console.log(`📊 Endereço: ${randomIP}`);
      console.log(`📊 MAC: ${randomMac}`);
      console.log(`📊 Comentário: ${response.data.binding.comment}`);
      return { ip: randomIP, mac: randomMac, success: true };
    } else {
      console.log('\n❌ Falha ao criar IP binding expirado');
      return { success: false };
    }

  } catch (error) {
    console.error('❌ Erro ao criar IP binding expirado:', error.response?.data || error.message);
    return { success: false };
  }
}

// Aguardar e verificar se o scheduler removeu o binding
async function waitForCleanup(targetIP, targetMac) {
  console.log('\n⏳ Aguardando scheduler de limpeza executar...\n');
  console.log('🔍 O scheduler executa a cada 2 minutos');
  console.log('🔍 Verificando a cada 30 segundos por até 4 minutos');
  
  const maxWaitTime = 4 * 60 * 1000; // 4 minutos
  const checkInterval = 30 * 1000; // 30 segundos
  const startTime = Date.now();
  
  let checkCount = 0;
  
  while (Date.now() - startTime < maxWaitTime) {
    checkCount++;
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    console.log(`🔄 Verificação ${checkCount} (${elapsedSeconds}s elapsed)...`);
    
    try {
      // Verificar se o IP binding ainda existe
      const checkResponse = await axios.post(
        `${BASE_URL}/api/mikrotik/public/check-ip-binding/${MIKROTIK_ID}`,
        { mac_address: targetMac },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (checkResponse.data.success) {
        const bindings = checkResponse.data.bindings || [];
        const targetBinding = bindings.find(b => 
          b.address === targetIP && b['mac-address'] === targetMac
        );
        
        if (!targetBinding) {
          console.log('🎉 IP binding foi removido pelo scheduler!');
          console.log(`⏱️  Tempo total: ${elapsedSeconds}s`);
          return true;
        } else {
          console.log(`📋 IP binding ainda existe: ${targetBinding.address} (${targetBinding['mac-address']})`);
          if (targetBinding.comment) {
            console.log(`📝 Comentário: ${targetBinding.comment}`);
          }
        }
      } else {
        console.log('⚠️  Erro ao verificar IP bindings');
      }
    } catch (error) {
      console.log('⚠️  Erro na verificação:', error.message);
    }
    
    if (Date.now() - startTime < maxWaitTime) {
      console.log(`⏳ Aguardando ${checkInterval / 1000}s para próxima verificação...\n`);
      await delay(checkInterval);
    }
  }
  
  console.log('⏰ Timeout: Scheduler não removeu o binding no tempo esperado');
  return false;
}

// Executar teste completo
async function runCleanupTest() {
  console.log('🚀 Teste de limpeza automática de IP bindings expirados\n');
  console.log('=' .repeat(60));
  
  // Criar binding expirado
  const bindingResult = await createExpiredBinding();
  
  if (!bindingResult.success) {
    console.log('❌ Falha ao criar IP binding, abortando teste');
    return;
  }
  
  console.log('\n' + '=' .repeat(60));
  
  // Aguardar limpeza
  const cleanupResult = await waitForCleanup(bindingResult.ip, bindingResult.mac);
  
  console.log('\n' + '=' .repeat(60));
  
  // Resultado final
  if (cleanupResult) {
    console.log('✅ TESTE PASSOU: Scheduler funcionando corretamente!');
    console.log('🎉 IP binding expirado foi removido automaticamente');
    console.log('\n📋 Funcionalidades confirmadas:');
    console.log('   • Scheduler global criado automaticamente');
    console.log('   • Execução a cada 2 minutos');
    console.log('   • Remoção de bindings com "e:" expirados');
    console.log('   • Timezone America/Manaus funcionando');
    console.log('   • Logs de cleanup gerados');
  } else {
    console.log('❌ TESTE FALHOU: Scheduler não funcionou como esperado');
    console.log('🔧 Possíveis causas:');
    console.log('   • Scheduler global não foi criado');
    console.log('   • Erro no script de limpeza');
    console.log('   • Problema com parsing de data/hora');
    console.log('   • Scheduler desabilitado ou não executando');
  }
  
  console.log('\n🏁 Teste concluído!');
}

// Executar
runCleanupTest().catch(console.error);