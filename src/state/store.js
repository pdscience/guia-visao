// src/state/store.js — ponte reativa entre Vue e o controller.
// Em produção usa reactive() do Vue; em teste pode ser um objeto simples.
export function createState(initial){
  return initial || {};
}
export function createStore(initial){
  return { state: createState(initial) };
}
EOF
node --check src/state/store.js && echo OK