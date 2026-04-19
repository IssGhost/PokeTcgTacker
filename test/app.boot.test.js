const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../src/app');

test('health endpoint returns ok', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
