import { parseScriptLocally } from './src/services/localParser';

const text = `V OP: FADE IN TEMA EN TAQUILLA
(7) LOC Arte Bayamo está dedicado hoy a la vida y obra
Nació el 17 de noviembre
Su madre Gloria Nogueras
`;
const parsed = parseScriptLocally(text);
console.log(JSON.stringify(parsed, null, 2));
