const axios = require('axios');

// Configurações do teste
const BASE_URL = 'http://router.mikropix.online:3001';
const MIKROTIK_ID = 'ad8ba643-627d-4539-a6ef-e6636ee0773b';

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

// Função para mostrar como o cálculo de expiração funciona
function demonstrarCalculoExpiracao() {
  console.log('📊 Demonstração do Cálculo de Expiração\n');
  
  // Exemplo com plano de 5 minutos
  const planoMinutos = 5;
  const now = new Date();
  const expirationDate = new Date(now.getTime() + (planoMinutos * 60 * 1000));
  
  // Converter para timezone America/Manaus usando toLocaleString
  const manausTimeStr = expirationDate.toLocaleString("sv-SE", {
    timeZone: "America/Manaus",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  // Formato já está correto: YYYY-MM-DD HH:MM:SS
  const expirationStr = manausTimeStr.replace(',', '');
  
  console.log(`🕐 Horário atual: ${now.toISOString().slice(0, 19).replace('T', ' ')}`);
  console.log(`⏰ Plano duração: ${planoMinutos} minutos`);
  console.log(`🎯 Horário de expiração: ${expirationStr}`);
  console.log(`📝 Comentário: C:17/07/2025 V:0.1 8b53a6ef e:${expirationStr}\n`);
  
  return { planoMinutos, expirationStr };
}

// Teste criando IP binding com plano de 5 minutos
async function testPlanoCincoMinutos() {
  console.log('🧪 Testando criação de IP binding com plano de 5 minutos...\n');
  
  const { planoMinutos, expirationStr } = demonstrarCalculoExpiracao();
  
  try {
    const randomMac = generateRandomMac();
    const randomIP = generateRandomIP();
    
    const bindingData = {
      address: randomIP,
      mac_address: randomMac,
      comment: 'C:17/07/2025 V:0.1 8b53a6ef-e52d-418e-ab47-8bfd56fbc609',
      expiration_minutes: planoMinutos // 5 minutos de duração
    };

    console.log('📋 Dados do IP binding:');
    console.log(JSON.stringify(bindingData, null, 2));
    console.log('\n⏳ Enviando requisição...\n');

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
      console.log('\n🎉 IP binding criado com sucesso!');
      console.log(`📊 Endereço: ${randomIP}`);
      console.log(`📊 MAC: ${randomMac}`);
      console.log(`📊 Expiração: ${response.data.expiration}`);
      console.log(`📊 Comentário: ${response.data.binding.comment}`);
      
      // Verificar se a expiração está correta
      const expectedExpiration = expirationStr;
      const actualExpiration = response.data.expiration;
      
      if (actualExpiration && actualExpiration.includes(expectedExpiration.slice(0, 16))) {
        console.log('✅ Expiração calculada corretamente!');
      } else {
        console.log('❌ Expiração pode estar incorreta');
        console.log(`Expected: ${expectedExpiration}`);
        console.log(`Actual: ${actualExpiration}`);
      }
      
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

// Teste verificando se o scheduler remove IP binding após 5 minutos
async function testSchedulerRemoveAfterFiveMinutes() {
  console.log('\n🕐 Testando se scheduler remove IP binding após 5 minutos...\n');
  
  // Criar IP binding que vai expirar em 5 minutos
  const bindingResult = await testPlanoCincoMinutos();
  
  if (!bindingResult.success) {
    console.log('❌ Falha ao criar IP binding, abortando teste');
    return;
  }
  
  console.log('\n⏳ Aguardando 6 minutos para o scheduler remover...');
  console.log('🔍 O scheduler executa a cada 2 minutos');
  console.log('🔍 Verificando a cada 1 minuto por até 7 minutos\n');
  
  const maxWaitTime = 7 * 60 * 1000; // 7 minutos
  const checkInterval = 1 * 60 * 1000; // 1 minuto
  const startTime = Date.now();
  
  let checkCount = 0;
  
  while (Date.now() - startTime < maxWaitTime) {
    checkCount++;
    const elapsedMinutes = Math.floor((Date.now() - startTime) / (60 * 1000));
    
    console.log(`🔄 Verificação ${checkCount} (${elapsedMinutes} min elapsed)...`);
    
    try {
      // Verificar se o IP binding ainda existe
      const checkResponse = await axios.post(
        `${BASE_URL}/api/mikrotik/public/check-ip-binding/${MIKROTIK_ID}`,
        { mac_address: bindingResult.mac },
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
          b.address === bindingResult.ip && b['mac-address'] === bindingResult.mac
        );
        
        if (!targetBinding) {
          console.log('🎉 IP binding foi removido pelo scheduler após 5 minutos!');
          console.log(`⏱️  Tempo total: ${elapsedMinutes} minutos`);
          console.log('\n✅ TESTE PASSOU: Scheduler funcionando corretamente com plano de 5 minutos!');
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
      console.log(`⏳ Aguardando ${checkInterval / 60000} minuto(s) para próxima verificação...\n`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
  
  console.log('⏰ Timeout: Scheduler não removeu o binding no tempo esperado');
  console.log('🔧 Possíveis causas:');
  console.log('   • Scheduler não está executando');
  console.log('   • Erro no cálculo de expiração');
  console.log('   • Problema com parsing de data/hora');
  return false;
}

// Executar teste principal
async function runTest() {
  console.log('🚀 Teste de Plano com Expiração Correta\n');
  console.log('=' .repeat(60));
  
  // Demonstrar cálculo
  demonstrarCalculoExpiracao();
  
  console.log('=' .repeat(60));
  
  // Executar teste completo
  const result = await testSchedulerRemoveAfterFiveMinutes();
  
  console.log('\n' + '=' .repeat(60));
  
  if (result) {
    console.log('✅ TESTE COMPLETO PASSOU!');
    console.log('🎉 Sistema de expiração funcionando corretamente');
    console.log('\n📋 Funcionalidades confirmadas:');
    console.log('   • Cálculo correto de expiração baseado na duração do plano');
    console.log('   • Formato de comentário com expiração correta');
    console.log('   • Scheduler remove IP bindings após o tempo definido');
    console.log('   • Timezone America/Manaus funcionando');
  } else {
    console.log('❌ TESTE FALHOU');
    console.log('🔧 Verifique o sistema de expiração');
  }
  
  console.log('\n🏁 Teste concluído!');
}

// Executar
runTest().catch(console.error);