const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.vue'), 'utf8');

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
  assert.ok(!/nenhuma imagem sai do dispositivo/i.test(app), 'ajuda deve mencionar o envio opcional para a nuvem');
  assert.match(app, /IA na nuvem/i);
});

test('botão SOS é acessível e deixa claro que não faz chamadas', () => {
  assert.match(app, /id="btnSOS"/, 'o SOS precisa de um botão visível');
  assert.match(app, /Não faz chamadas/i, 'o label do botão deve ser honesto');
  assert.match(app, /alarme local: não faz chamadas/i, 'a ajuda deve explicar o SOS local');
});

test('entry do Vite carrega o app', () => {
  assert.match(html, /src\/main\.js/, 'index deve carregar src/main.js');
});
