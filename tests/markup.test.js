const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('botão de demonstração tem fechamento próprio e rótulo acessível', () => {
  assert.ok(!html.includes('</button>-->'), 'comentário não pode engolir o </button>');

  const m = html.match(/<button[^>]*id="btnStartDemo"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(m, 'btnStartDemo precisa de uma tag </button> própria');
  assert.match(m[0], /aria-label="[^"]+"/, 'btnStartDemo precisa de aria-label');
  assert.match(m[1], /demonstra/i, 'btnStartDemo precisa de texto visível');
});

test('texto de privacidade não promete que nada sai do aparelho', () => {
  assert.ok(!/nenhuma imagem sai do dispositivo/i.test(html), 'ajuda deve mencionar o envio opcional para a nuvem');
  assert.match(html, /IA na nuvem/i);
});
