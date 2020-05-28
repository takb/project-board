const core = require('@actions/core');
const github = require("@actions/github");

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
    console.log(context);
    try {
      const octokit = new github.GitHub(token);
      var projectList = await octokit.projects.listForRepo({owner, repo});
      if (projectList.status != 200) {
        reject({message: 'insufficient access privilege to fetch project data, check owner/repo'});
      }
      var project = projectList.data.find(e => e.number == id);
      if (!project) {
        reject({message: 'failed to fetch project data, check project id'});
      }
      console.log(project);
      resolve("done!");
    }
    catch (error) {
      console.log(error);
      reject('handleProjectBoard.js: ' + error.message);
    }
  });
}

module.exports = handler;
