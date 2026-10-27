const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

test('botão de demonstração não existe mais', () => {
  assert.ok(!html.includes('btnStartDemo'), 'o shell não deve ter o botão demo');
  assert.ok(!html.includes('</button>-->'), 'comentário não pode engolir o </button>');
});

test('app não referencia o botão demo removido', () => {
  assert.ok(!app.includes('btnStartDemo'), 'listener em elemento inexistente quebra o boot');
});

test('instruções não mandam procurar um botão demo inexistente', () => {
  assert.ok(!/botão demonstração/i.test(app), 'a fala de boas-vindas precisa ser atualizada');
});

test('texto de privacidade não promete que nada sai do aparelho', () => {
  assert.ok(!/nenhuma imagem sai do dispositivo/i.test(html), 'ajuda deve mencionar o envio opcional para a nuvem');
  assert.match(html, /IA na nuvem/i);
});

test('botão SOS é acessível e deixa claro que não faz chamadas', () => {
  assert.match(html, /id="btnSOS"/, 'o SOS precisa de um botão visível');
  assert.match(html, /Não faz chamadas/i, 'o label do botão deve ser honesto');
  assert.match(html, /alarme local: não faz chamadas/i, 'a ajuda deve explicar o SOS local');
});

test('regras de segurança carregam antes do app', () => {
  const safety = html.indexOf('./js/safety.js');
  const appSrc = html.indexOf('./js/app.js');
  assert.ok(safety > -1, 'index deve carregar js/safety.js');
  assert.ok(appSrc > safety, 'safety.js precisa vir antes de app.js');
});
