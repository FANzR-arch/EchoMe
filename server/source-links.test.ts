import {test} from 'node:test';import assert from 'node:assert/strict';import {cleanSourceLinks} from './source-links.ts';
test('approved contact survives Markdown, trailing punctuation and slash',()=>{
 for(const text of ['[林夏的联系页](https://example.com/contact)','（https://example.com/contact）。','https://example.com/contact.','https://example.com/contact/'])assert.equal(cleanSourceLinks(text,[]),text);
});
test('unsupported URLs lose link but keep readable labels, without internal warnings',()=>{
 assert.equal(cleanSourceLinks('[相关内容](https://fake.invalid/a)',[]),'相关内容');assert.equal(cleanSourceLinks('参考 https://fake.invalid。',[]),'参考 。');assert.equal(cleanSourceLinks('https://example.com/contac',[]),'');assert.equal(cleanSourceLinks('https://example.com/contact/evil',[]),'');assert.equal(cleanSourceLinks('[资料](https://real.example/a)',['https://real.example/a']),'[资料](https://real.example/a)');
});
