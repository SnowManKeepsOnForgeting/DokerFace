import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  client: 'fetch',
  input: '../openapi.json',
  output: 'src/contracts/rest',
});
