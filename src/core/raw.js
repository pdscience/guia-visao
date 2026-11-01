import { markRaw } from 'vue';

export function raw(v){ return (v && typeof v === 'object') ? markRaw(v) : v; }
