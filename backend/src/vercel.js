import { createApp } from './app.js';
import { assertRuntimeEnv } from './config/env.js';

assertRuntimeEnv();

// A Vercel transforma este Express em uma única Function com Fluid Compute.
// Não use app.listen(): a própria plataforma controla o ciclo HTTP.
export default createApp();
