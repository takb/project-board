const core = require('@actions/core');
const handler = require('./handleProjectBoard');

process.env['INPUT_TOKEN'] = '494a107520b7f96d51474ec4dacfd597f3fe2c70';
process.env['INPUT_OWNER'] = 'takb';
process.env['INPUT_REPO'] = 'zuiso';
process.env['INPUT_PROJECT'] = '1';

async function run() {
  try {
    const token = core.getInput('token');
    const owner = core.getInput('owner');
    const repo = core.getInput('repo');
    const project = core.getInput('project');
    const start = new Date();
    core.debug('calling handler');
    await handler(token, owner, repo, project);
    var delta = Math.abs(new Date() - start);
    core.debug(`handler returned in ${delta} ms`);
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run()
