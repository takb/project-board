const core = require('@actions/core');
const github = require("@actions/github");

async function getProject(octokit, owner, repo, id) {
  const projectList = await octokit.projects.listForRepo({owner, repo});
  if (projectList.status != 200) {
    throw new Error('insufficient access privilege to fetch project data, check owner/repo');
  }
  const project = projectList.data.find(e => e.number == id);
  if (!project) {
    throw new Error('failed to fetch project data, check project id');
  }
  return project;
}

async function handleIssueOpened(octokit, project, payload) {
  console.log(payload);
  console.log(project);
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
    const octokit = new github.GitHub(token);
    try {
      const project = await getProject(octokit, owner, repo, id);
    } catch (e) {
      reject(e);
    }
    context = github.context;
    switch (context.eventName) {
      case 'issues':
        if (context.payload.action == 'opened') {
          console.log('triggered by new issue')
          try {
            handleIssueOpened(octokit, project, context.payload);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        if (context.payload.action == 'labeled') {
          console.log('triggered by label add')
          try {
            handleIssueLabeled(octokit, project, context.payload);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        break;
      case 'pull_request':
        console.log('triggered by PR')
        try {
          handlePR(octokit, project, context.payload);
          resolve("done!");
        } catch (e) {
          reject(e);
        }
        break;
      case 'release':
        console.log('triggered by release')
        try {
          handleRelease(octokit, project, context.payload);
          resolve("done!");
        } catch (e) {
          reject(e);
        }
        break;
      default:
        break;
    }
    reject({message: 'unhandled trigger: ' + context.eventName});
  });
}

module.exports = handler;
