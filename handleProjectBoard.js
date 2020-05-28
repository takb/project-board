const core = require('@actions/core');
const github = require("@actions/github");

async function handleIssueOpened(token, owner, repo, id, payload) {
  const octokit = new github.GitHub(token);
  var projectList = await octokit.projects.listForRepo({owner, repo});
  if (projectList.status != 200) {
    throw new Error('insufficient access privilege to fetch project data, check owner/repo');
  }
  var project = projectList.data.find(e => e.number == id);
  if (!project) {
    throw new Error('failed to fetch project data, check project id');
  }
  console.log(payload);
}

let handler = function(token, owner, repo, id) {
  if (typeof(token) !== 'string' || token.length != 40) {
    throw new Error('invalid token');
  }
  if (typeof(owner) !== 'string' || !owner.length) {
    throw new Error('invalid owner');
  }
  if (typeof(repo) !== 'string' || !repo.length) {
    throw new Error('invalid repo');
  }
  if (typeof(id) !== 'string' || !id.length) {
    throw new Error('invalid project id');
  }
  return new Promise(async(resolve, reject) => {
    const context = github.context;
    switch (context.eventName) {
      case 'issues':
        if (context.payload.action == 'opened') {
          console.log('triggered by new issue')
          console.log(context.payload)
          try {
            handleIssueOpened(token, owner, repo, id, context.payload);
            resolve("done!");
          } catch (e) {
            reject(e.message);
          }
        }
        if (context.payload.action == 'labeled') {
          console.log('triggered by label add')
          console.log(context.payload)
        }
        break;
      case 'pull_request':
        console.log('triggered by PR')
        console.log(context.payload)
        break;
      case 'release':
        console.log('triggered by release')
        console.log(context.payload)
        break;
      default:
        break;
    }
    reject('handleProjectBoard.js: ' + error.message);
  });
}

module.exports = handler;
