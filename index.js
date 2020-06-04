const core = require('@actions/core');
const handler = require('./handleProjectBoard');

async function run() {
  try {
    const token = core.getInput('token');
    const owner = core.getInput('owner');
    const repo = core.getInput('repo');
    const project = core.getInput('project');
    const columnByLabelStr = core.getInput('columnbylabel');
    const ignoreColumnNamesStr = core.getInput('ignorecolumnnames');
    const labelOnClose = core.getInput('labelonclose');
    const start = new Date();
    core.debug('calling handler');
    await handler(token, owner, repo, project, columnByLabelStr, ignoreColumnNamesStr, labelOnClose);
    var delta = Math.abs(new Date() - start);
    core.debug(`handler returned in ${delta} ms`);
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run()
