// Sobe uma Edge Function numa porta escolhida (PORTA) para teste local
const original = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: any) => original({ port: Number(Deno.env.get('PORTA')) }, h);
await import(Deno.env.get('FUNCAO')!);
